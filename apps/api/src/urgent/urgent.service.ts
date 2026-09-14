import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { UrgentRequestDto } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Сколько открытых вызовов можно держать одновременно. */
const MAX_OPEN = 3;

/**
 * «Надо срочно» — вызов мастера на сейчас.
 *
 * Когда прорвало трубу, выбирать из каталога некогда: человеку нужен не
 * лучший мастер, а тот, кто приедет. Поэтому вызов адресован не одному,
 * а всем подходящим сразу, и берёт его тот, кто первым согласился.
 *
 * Остальным приходит «уже взяли» — это не вежливость, а избавление
 * от звонков в занятую линию.
 */
@Injectable()
export class UrgentService {
  private readonly logger = new Logger(UrgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: UrgentRequestDto) {
    const open = await this.prisma.urgentRequest.count({
      where: { userId, status: 'OPEN', neededBy: { gt: new Date() } },
    });
    if (open >= MAX_OPEN) {
      throw new BadRequestException({
        code: 'TOO_MANY_URGENT',
        message: `Больше ${MAX_OPEN} открытых вызовов сразу не бывает`,
      });
    }

    const request = await this.prisma.urgentRequest.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        city: dto.city.trim(),
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        neededBy: new Date(Date.now() + dto.hours * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    void this.callMasters(request.id);

    const all = await this.mine(userId);
    return all.find((item) => item.id === request.id)!;
  }

  /** Свои вызовы: что открыто, что взяли, что сгорело. */
  async mine(userId: string) {
    const rows = await this.prisma.urgentRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        category: { select: { name: true, icon: true } },
        takenBy: { select: { id: true, firstName: true, photoUrl: true, avatarUrl: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      city: row.city,
      category: row.category,
      status: this.effectiveStatus(row),
      neededBy: row.neededBy.toISOString(),
      createdAt: row.createdAt.toISOString(),
      takenBy: row.takenBy
        ? {
            id: row.takenBy.id,
            name: row.takenBy.firstName,
            photoUrl: row.takenBy.avatarUrl ?? row.takenBy.photoUrl,
          }
        : null,
    }));
  }

  /**
   * Мастер берёт вызов.
   *
   * Побеждает первый: условие «ещё открыт» стоит внутри самого обновления,
   * поэтому двое одновременно взять не могут — второй увидит, что менять
   * было нечего.
   */
  async take(masterId: string, id: string): Promise<{ conversationId: string | null }> {
    const request = await this.prisma.urgentRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, title: true, neededBy: true, status: true },
    });
    if (!request) throw new NotFoundException({ code: 'URGENT_NOT_FOUND', message: 'Вызов не найден' });
    if (request.userId === masterId) {
      throw new BadRequestException({ code: 'SELF_TAKE', message: 'Это ваш собственный вызов' });
    }
    if (request.neededBy < new Date()) {
      throw new BadRequestException({ code: 'URGENT_EXPIRED', message: 'Срок вызова уже вышел' });
    }

    const taken = await this.prisma.urgentRequest.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'TAKEN', takenById: masterId, takenAt: new Date() },
    });

    if (taken.count === 0) {
      throw new BadRequestException({ code: 'ALREADY_TAKEN', message: 'Вызов уже взял другой мастер' });
    }

    const master = await this.prisma.user.findUnique({
      where: { id: masterId },
      select: { firstName: true, specialist: { select: { id: true, displayName: true } } },
    });

    /*
     * Разговор открываем сразу.
     *
     * Обычно переписка с мастером требует заявки и согласия, но здесь
     * согласие только что и прозвучало: он нажал «Беру». Заставлять
     * стороны искать друг друга после этого — терять те самые минуты,
     * ради которых вызов и придуман.
     */
    let conversationId: string | null = null;
    if (master?.specialist) {
      const conversation = await this.prisma.conversation.upsert({
        where: {
          specialistId_clientId: { specialistId: master.specialist.id, clientId: request.userId },
        },
        create: { specialistId: master.specialist.id, clientId: request.userId },
        update: {},
        select: { id: true },
      });
      conversationId = conversation.id;
    }

    const name = master?.specialist?.displayName ?? master?.firstName ?? 'Мастер';

    this.notifications.notify(
      request.userId,
      `⚡️ <b>Вызов взяли</b>\n\n${escapeHtml(name)} берётся за «${escapeHtml(request.title)}». ` +
        'Откройте переписку и договоритесь о деталях.',
      this.notifications.miniAppUrl,
    );

    return { conversationId };
  }

  async cancel(userId: string, id: string) {
    const request = await this.prisma.urgentRequest.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!request) throw new NotFoundException({ code: 'URGENT_NOT_FOUND', message: 'Вызов не найден' });
    if (request.userId !== userId) throw new ForbiddenException('Это чужой вызов');

    await this.prisma.urgentRequest.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'CANCELLED' },
    });

    return this.mine(userId);
  }

  /**
   * Позвать мастеров.
   *
   * Зовём тех, у кого опубликована анкета в нужной категории и городе.
   * Подписку здесь не спрашиваем намеренно: вызов должен находить
   * исполнителя с первого дня, а не ждать, пока каталог наполнится
   * оплатившими.
   */
  private async callMasters(id: string): Promise<void> {
    try {
      const request = await this.prisma.urgentRequest.findUnique({
        where: { id },
        include: { category: { select: { name: true } } },
      });
      if (!request) return;

      const masters = await this.prisma.specialist.findMany({
        where: {
          status: 'ACTIVE',
          userId: { not: null },
          city: { equals: request.city, mode: 'insensitive' },
          categories: { some: { categoryId: request.categoryId } },
        },
        select: { userId: true },
        take: 50,
      });

      const until = request.neededBy.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });

      let called = 0;
      for (const master of masters) {
        if (!master.userId || master.userId === request.userId) continue;
        called += 1;

        this.notifications.notifyWithActions(
          master.userId,
          `⚡️ <b>Надо срочно: ${escapeHtml(request.category.name)}</b>\n\n` +
            `${escapeHtml(request.title)}\n` +
            (request.description ? `${escapeHtml(request.description)}\n` : '') +
            `\n📍 ${escapeHtml(request.city)} · нужно до ${until}\n\n` +
            'Возьмёте — откроется переписка с заказчиком.',
          [{ text: '⚡️ Беру', data: `urg:take:${request.id}` }],
        );
      }

      this.logger.log(`Срочный вызов ${id}: позвано ${called}`);
    } catch (error) {
      // Оповещение — не часть создания вызова: он всё равно должен
      // появиться у заказчика в списке.
      this.logger.warn(`Не удалось позвать мастеров по ${id}: ${String(error)}`);
    }
  }

  /**
   * Настоящее состояние вызова.
   *
   * Сгоревший остаётся в базе открытым: гасить их по расписанию значит
   * завести задачу, которая однажды не выполнится, и получить два разных
   * ответа на один вопрос. Считаем при чтении.
   */
  private effectiveStatus(row: { status: string; neededBy: Date }): string {
    if (row.status === 'OPEN' && row.neededBy < new Date()) return 'EXPIRED';
    return row.status;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
