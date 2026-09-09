import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { IncomingServiceRequest, ServiceRequestState, ServiceRequestStatus } from '@app/shared';
import { SERVICE_REQUEST_MINUTES } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Заявки на услугу.
 *
 * Заказчик не открывает переписку с мастером сам: он просит, и мастер
 * соглашается. Разница не формальная. Открытый чат обещает ответ, а
 * обещать за мастера нельзя: половина обращений так и оставалась без
 * ответа, и виноватой выглядела площадка.
 *
 * Согласие ограничено по времени. Услуга нужна сейчас, и заказчик,
 * не дождавшийся ответа за полчаса, должен получить не тишину, а прямое
 * «не ответили» — и пойти к следующему мастеру.
 */
@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Отправить заявку.
   *
   * Если мастер уже соглашался раньше, новая заявка не нужна: переписка
   * есть, и спрашивать разрешения заново значило бы мешать людям, которые
   * уже общаются.
   */
  async create(clientId: string, specialistId: string, note: string | null): Promise<ServiceRequestState> {
    const specialist = await this.prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { id: true, status: true, userId: true, displayName: true },
    });

    if (!specialist || specialist.status !== 'ACTIVE') {
      throw new NotFoundException({ code: 'SPECIALIST_NOT_FOUND', message: 'Специалист не найден' });
    }
    if (specialist.userId === clientId) {
      throw new BadRequestException({ code: 'SELF_CHAT', message: 'Это ваша анкета' });
    }
    if (!specialist.userId) {
      throw new BadRequestException({
        code: 'SPECIALIST_UNREACHABLE',
        message: 'Этот специалист пока не подключил чат',
      });
    }

    const existingChat = await this.prisma.conversation.findUnique({
      where: { specialistId_clientId: { specialistId, clientId } },
      select: { id: true },
    });

    const open = await this.current(clientId, specialistId);
    if (open && (open.status === 'PENDING' || open.status === 'ACCEPTED')) return open;

    const now = new Date();
    const request = await this.prisma.serviceRequest.create({
      data: {
        specialistId,
        clientId,
        note,
        // Уже общались — согласие получено давно, и держать человека
        // в очереди второй раз незачем.
        status: existingChat ? 'ACCEPTED' : 'PENDING',
        respondedAt: existingChat ? now : null,
        expiresAt: new Date(now.getTime() + SERVICE_REQUEST_MINUTES * 60 * 1000),
      },
    });

    if (existingChat) return this.toState(request, existingChat.id);

    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: { firstName: true },
    });

    this.notifications.notifyWithActions(
      specialist.userId,
      `🔔 <b>Заявка на услугу</b>\n\n${escapeHtml(client?.firstName ?? 'Заказчик')} хочет воспользоваться вашей услугой.` +
        (note ? `\n\n«${escapeHtml(note)}»` : '') +
        `\n\nОтветьте в течение ${SERVICE_REQUEST_MINUTES} минут — потом заявка сгорит, и человек уйдёт к другому мастеру.`,
      [
        { text: '✅ Принять запрос', data: `req:accept:${request.id}` },
        { text: '✖️ Отказать', data: `req:decline:${request.id}` },
      ],
    );

    return this.toState(request, null);
  }

  /**
   * Что сейчас с обращением этого заказчика к этому мастеру.
   * Нужно карточке анкеты: она рисует либо кнопку, либо ожидание, либо отказ.
   */
  async current(clientId: string, specialistId: string): Promise<ServiceRequestState | null> {
    const request = await this.prisma.serviceRequest.findFirst({
      where: { clientId, specialistId },
      orderBy: { createdAt: 'desc' },
    });
    if (!request) return null;

    const conversation =
      this.effectiveStatus(request) === 'ACCEPTED'
        ? await this.prisma.conversation.findUnique({
            where: { specialistId_clientId: { specialistId, clientId } },
            select: { id: true },
          })
        : null;

    return this.toState(request, conversation?.id ?? null);
  }

  /** Заявки, которые ждут ответа мастера. */
  async incoming(userId: string): Promise<IncomingServiceRequest[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      where: {
        specialist: { userId },
        status: 'PENDING',
        // Просроченные не показываем: соглашаться уже поздно, и кнопка
        // «Принять» обещала бы то, чего не будет.
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        client: { select: { id: true, firstName: true, photoUrl: true, avatarUrl: true } },
        specialist: { select: { id: true, displayName: true } },
      },
    });

    return rows.map((row) => ({
      ...this.toState(row, null),
      client: {
        id: row.client.id,
        name: row.client.firstName,
        photoUrl: row.client.avatarUrl ?? row.client.photoUrl,
      },
      specialist: { id: row.specialist.id, displayName: row.specialist.displayName },
    }));
  }

  /**
   * Ответ мастера. Согласие открывает переписку — до этого момента её нет,
   * и написать заказчику невозможно даже случайно.
   */
  async respond(
    userId: string,
    requestId: string,
    action: 'accept' | 'decline',
  ): Promise<{ status: ServiceRequestStatus; conversationId: string | null }> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
      include: { specialist: { select: { id: true, userId: true, displayName: true } } },
    });

    if (!request) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Заявка не найдена' });
    }
    if (request.specialist.userId !== userId) {
      throw new ForbiddenException({ code: 'REQUEST_NOT_YOURS', message: 'Это заявка не к вам' });
    }

    const status = this.effectiveStatus(request);

    // Повторное нажатие не ошибка: кнопка осталась в переписке, и человек
    // мог нажать её второй раз. Отвечаем тем же, что было решено раньше.
    if (status === 'ACCEPTED') {
      const chat = await this.prisma.conversation.findUnique({
        where: { specialistId_clientId: { specialistId: request.specialistId, clientId: request.clientId } },
        select: { id: true },
      });
      return { status: 'ACCEPTED', conversationId: chat?.id ?? null };
    }
    if (status === 'DECLINED') return { status: 'DECLINED', conversationId: null };
    if (status === 'EXPIRED') {
      // Отметку ставим здесь, а не по расписанию: момент, когда просрочку
      // заметили, — единственный, когда она кому-то важна.
      await this.prisma.serviceRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException({
        code: 'REQUEST_EXPIRED',
        message: `Заявка сгорела: на ответ было ${SERVICE_REQUEST_MINUTES} минут`,
      });
    }

    if (action === 'decline') {
      await this.prisma.serviceRequest.update({
        where: { id: requestId },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });

      this.notifications.notify(
        request.clientId,
        `😔 <b>Мастер отказался</b>\n\n${escapeHtml(request.specialist.displayName)} не может взяться за работу. ` +
          'Посмотрите других — в каталоге их больше.',
        this.notifications.miniAppUrl,
      );

      return { status: 'DECLINED', conversationId: null };
    }

    const conversation = await this.prisma.$transaction(async (tx) => {
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });

      return tx.conversation.upsert({
        where: { specialistId_clientId: { specialistId: request.specialistId, clientId: request.clientId } },
        create: { specialistId: request.specialistId, clientId: request.clientId },
        update: {},
        select: { id: true },
      });
    });

    this.notifications.notify(
      request.clientId,
      `✅ <b>Мастер принял заявку</b>\n\n${escapeHtml(request.specialist.displayName)} готов взяться. ` +
        'Откройте переписку и договоритесь о деталях.',
      this.notifications.miniAppUrl,
    );

    return { status: 'ACCEPTED', conversationId: conversation.id };
  }

  /**
   * Есть ли у заказчика право переписываться с мастером.
   * Спрашивает чат, когда решает, открывать ли диалог.
   */
  async isAccepted(clientId: string, specialistId: string): Promise<boolean> {
    const accepted = await this.prisma.serviceRequest.findFirst({
      where: { clientId, specialistId, status: 'ACCEPTED' },
      select: { id: true },
    });
    return Boolean(accepted);
  }

  /**
   * Настоящее состояние заявки.
   *
   * В базе просроченная заявка так и лежит со словом «ждёт»: гасить их
   * по расписанию значит завести задачу, которая однажды не выполнится,
   * и получить два разных ответа на один вопрос. Считаем при чтении.
   */
  private effectiveStatus(request: { status: string; expiresAt: Date }): ServiceRequestStatus {
    if (request.status === 'PENDING' && request.expiresAt.getTime() < Date.now()) return 'EXPIRED';
    return request.status as ServiceRequestStatus;
  }

  private toState(
    request: { id: string; status: string; note: string | null; createdAt: Date; expiresAt: Date },
    conversationId: string | null,
  ): ServiceRequestState {
    return {
      id: request.id,
      status: this.effectiveStatus(request),
      note: request.note,
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      conversationId,
    };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
