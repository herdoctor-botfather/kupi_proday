import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ChatMessage, ConversationSummary, ConversationThread } from '@app/shared';
import { hasMeaningfulText, maskContacts } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContactPolicyService } from '../notifications/contact-policy.service';

/** Сколько сообщений отдаём за один раз. Остальное подгружается по требованию. */
const PAGE_SIZE = 50;

const conversationInclude = {
  specialist: { select: { id: true, slug: true, displayName: true, photoUrl: true, userId: true } },
  listing: {
    select: {
      id: true,
      slug: true,
      title: true,
      // Продажа или запрос: в списке переписок это разные разделы,
      // и без признака их не отличить.
      kind: true,
      priceAmount: true,
      currency: true,
      userId: true,
      photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      user: { select: { firstName: true, lastName: true, photoUrl: true } },
    },
  },
  client: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

/**
 * Переписка между заказчиком и специалистом внутри приложения.
 *
 * Общение намеренно удерживается на площадке: так видно, о чём договорились,
 * можно разобрать спор и сделка не уходит в личные контакты. Поэтому контакты
 * в сообщениях скрываются, а исходник сохраняется для разбора жалоб.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly contactPolicy: ContactPolicyService,
  ) {}

  /**
   * Открывает диалог по карточке специалиста или по объявлению.
   * Повторное обращение не создаёт новый тред: переписка должна быть сплошной.
   */
  async startConversation(
    clientId: string,
    subject: { specialistId?: string; listingId?: string },
  ): Promise<ConversationSummary> {
    const conversation = subject.specialistId
      ? await this.startWithSpecialist(clientId, subject.specialistId)
      : await this.startWithListing(clientId, subject.listingId!);

    return this.toSummary(conversation, clientId);
  }

  private async startWithSpecialist(clientId: string, specialistId: string): Promise<ConversationRow> {
    const specialist = await this.prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { id: true, status: true, userId: true },
    });

    if (!specialist || specialist.status !== 'ACTIVE') {
      throw new NotFoundException({ code: 'SPECIALIST_NOT_FOUND', message: 'Специалист не найден' });
    }
    if (specialist.userId === clientId) {
      throw new BadRequestException({ code: 'SELF_CHAT', message: 'Нельзя написать самому себе' });
    }
    // Карточка, заведённая администратором вручную, не привязана к аккаунту —
    // писать некому, и обещать пользователю ответ было бы нечестно.
    if (!specialist.userId) {
      throw new BadRequestException({
        code: 'SPECIALIST_UNREACHABLE',
        message: 'Этот специалист пока не подключил чат',
      });
    }

    return this.prisma.conversation.upsert({
      where: { specialistId_clientId: { specialistId, clientId } },
      create: { specialistId, clientId },
      update: {},
      include: conversationInclude,
    });
  }

  private async startWithListing(clientId: string, listingId: string): Promise<ConversationRow> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true, userId: true },
    });

    // Продавать нечего, но переписка по проданному товару должна открываться:
    // покупатель мог не успеть спросить до того, как объявление закрыли.
    if (!listing || !['ACTIVE', 'SOLD'].includes(listing.status)) {
      throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    }
    if (listing.userId === clientId) {
      throw new BadRequestException({ code: 'SELF_CHAT', message: 'Это ваше объявление' });
    }

    return this.prisma.conversation.upsert({
      where: { listingId_clientId: { listingId, clientId } },
      create: { listingId, clientId },
      update: {},
      include: conversationInclude,
    });
  }

  /** Список диалогов пользователя — и как заказчика, и как специалиста. */
  async findConversations(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.prisma.conversation.findMany({
      where: {
        OR: [{ clientId: userId }, { specialist: { userId } }, { listing: { userId } }],
        // Пустые диалоги в списке не нужны: их создаёт открытие экрана,
        // а не намерение общаться.
        lastMessageAt: { not: null },
      },
      include: conversationInclude,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    return rows.map((row) => this.toSummary(row, userId));
  }

  /** Общее число непрочитанных — для значка на вкладке. */
  async countUnread(userId: string): Promise<number> {
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ clientId: userId }, { specialist: { userId } }, { listing: { userId } }] },
      select: { clientId: true, clientUnread: true, specialistUnread: true },
    });

    return rows.reduce(
      (total, row) => total + (row.clientId === userId ? row.clientUnread : row.specialistUnread),
      0,
    );
  }

  /** Переписка. Открытие треда помечает входящие прочитанными. */
  async findThread(userId: string, conversationId: string, before?: string): Promise<ConversationThread> {
    const conversation = await this.requireParticipant(conversationId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      // Просим на одно больше, чтобы понять, есть ли ещё, не считая всё.
      take: PAGE_SIZE + 1,
    });

    const hasMore = messages.length > PAGE_SIZE;
    const page = hasMore ? messages.slice(0, PAGE_SIZE) : messages;

    await this.markRead(conversation, userId);

    return {
      conversation: this.toSummary(conversation, userId, { unreadOverride: 0 }),
      // В базе идём от новых к старым ради LIMIT, показываем в обратном порядке.
      messages: page.reverse().map((message) => this.toMessage(message, userId)),
      hasMore,
    };
  }

  async sendMessage(userId: string, conversationId: string, text: string): Promise<ChatMessage> {
    const conversation = await this.requireParticipant(conversationId, userId);

    if (conversation.isBlocked) {
      throw new ForbiddenException({
        code: 'CONVERSATION_BLOCKED',
        message: 'Переписка закрыта администрацией',
      });
    }

    // Вычистка на сервере, а не на клиенте: клиентскую проверку легко обойти.
    const { text: masked, hasContacts } = maskContacts(text.trim());

    // Проверяем не пустоту строки, а наличие смысла: после вычистки от
    // «+79001234567» остаётся «[контакт скрыт]» — формально текст есть,
    // а сообщения нет.
    if (!hasMeaningfulText(masked)) {
      throw new BadRequestException({
        code: 'EMPTY_MESSAGE',
        message: 'Сообщение состоит только из контактов. Обсуждайте детали здесь, в чате.',
      });
    }

    const isClient = conversation.clientId === userId;
    const preview = masked.length > 120 ? `${masked.slice(0, 117)}...` : masked;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          text: masked,
          // Исходник храним только когда было что скрывать — иначе это
          // лишняя копия всей переписки в базе.
          originalText: hasContacts ? text.trim() : null,
          hasMaskedContacts: hasContacts,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: created.createdAt,
          lastMessageText: preview,
          // Счётчик растёт у получателя, а не у отправителя.
          ...(isClient ? { specialistUnread: { increment: 1 } } : { clientUnread: { increment: 1 } }),
        },
      });

      return created;
    });

    this.notifyPeer(conversation, userId, preview);

    // Молча вычищать мало: человек не поймёт, почему собеседник
    // не отвечает на присланный номер, и повторит попытку.
    if (hasContacts) this.contactPolicy.register(userId, 'chat');

    return this.toMessage(message, userId);
  }

  /** Сообщения помечаются прочитанными при открытии треда. */
  private async markRead(conversation: ConversationRow, userId: string): Promise<void> {
    const isClient = conversation.clientId === userId;
    const unread = isClient ? conversation.clientUnread : conversation.specialistUnread;
    if (unread === 0) return;

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: isClient ? { clientUnread: 0 } : { specialistUnread: 0 },
      }),
      this.prisma.message.updateMany({
        where: { conversationId: conversation.id, senderId: { not: userId }, readAt: null },
        data: { readAt: new Date() },
      }),
    ]);
  }

  private notifyPeer(conversation: ConversationRow, senderId: string, preview: string): void {
    const isClient = conversation.clientId === senderId;
    const ownerId = conversation.specialist?.userId ?? conversation.listing?.userId ?? null;
    const recipientId = isClient ? ownerId : conversation.clientId;
    if (!recipientId) return;

    // В уведомлении — то же имя, что и в списке диалогов: человек должен
    // узнать отправителя, не открывая приложение.
    const senderName = isClient
      ? conversation.client.firstName
      : (conversation.specialist?.displayName ?? conversation.listing?.user.firstName ?? 'Продавец');

    this.notifications.notify(
      recipientId,
      `💬 <b>Новое сообщение</b>\n\n${escapeHtml(senderName)}: ${escapeHtml(preview)}`,
      this.notifications.miniAppUrl,
    );
  }

  /** Доступ к переписке есть только у её участников. */
  private async requireParticipant(conversationId: string, userId: string): Promise<ConversationRow> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: conversationInclude,
    });

    if (!conversation) {
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Переписка не найдена' });
    }
    const ownerId = conversation.specialist?.userId ?? conversation.listing?.userId ?? null;
    if (conversation.clientId !== userId && ownerId !== userId) {
      // Отвечаем «не найдено», а не «нет доступа»: иначе по коду ответа
      // можно перебором узнать, какие диалоги существуют.
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Переписка не найдена' });
    }

    return conversation;
  }

  private toSummary(
    row: ConversationRow,
    userId: string,
    options: { unreadOverride?: number } = {},
  ): ConversationSummary {
    const isClient = row.clientId === userId;

    /*
     * Собеседник называется по имени — так переписка выглядит разговором
     * двух людей, а не обращением в службу поддержки.
     *
     * Только имя, без фамилии: фамилия для сделки ничего не добавляет,
     * а называет человека полностью. Специалист — исключение: у него
     * публичная карточка, и там стоит выбранное им самим название.
     */
    const owner = row.specialist
      ? { id: row.specialist.id, name: row.specialist.displayName, photoUrl: row.specialist.photoUrl }
      : {
          id: row.listing!.id,
          name: row.listing!.user.firstName,
          photoUrl: row.listing!.photos[0]?.url ?? row.listing!.user.photoUrl,
        };

    return {
      id: row.id,
      peer: isClient
        ? owner
        : {
            id: row.client.id,
            name: row.client.firstName,
            photoUrl: row.client.photoUrl,
          },
      specialist: row.specialist
        ? { id: row.specialist.id, slug: row.specialist.slug, displayName: row.specialist.displayName }
        : null,
      listing: row.listing
        ? {
            id: row.listing.id,
            slug: row.listing.slug,
            title: row.listing.title,
            kind: row.listing.kind,
            priceAmount: row.listing.priceAmount,
            currency: row.listing.currency,
          }
        : null,
      lastMessageText: row.lastMessageText,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      unread: options.unreadOverride ?? (isClient ? row.clientUnread : row.specialistUnread),
      isBlocked: row.isBlocked,
      // С точки зрения переписки владелец предмета — одна роль,
      // независимо от того, анкета это или объявление.
      role: isClient ? 'CLIENT' : 'SPECIALIST',
    };
  }

  private toMessage(row: { id: string; text: string; createdAt: Date; senderId: string; hasMaskedContacts: boolean }, userId: string): ChatMessage {
    return {
      id: row.id,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      isMine: row.senderId === userId,
      hasMaskedContacts: row.hasMaskedContacts,
    };
  }
}

/** Экранирование пользовательского текста для parse_mode: HTML. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
