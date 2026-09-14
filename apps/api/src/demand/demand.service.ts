import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { CategoryKind } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Сколько подписок на спрос можно держать. */
const MAX_WATCHES = 10;

/**
 * Охота за спросом.
 *
 * Продавец и мастер говорят один раз, что им интересно, — и получают
 * уведомление, когда появляется подходящий запрос. Это переворачивает
 * работу площадки: не человек ходит по витрине в поисках клиента,
 * а спрос сам приходит к нему.
 *
 * Уведомляем о запросах «куплю» и о новых заявках на услуги — то есть
 * о тех местах, где человек уже сказал, что ему надо. Объявления о
 * продаже сюда не попадают: продавцу не нужно знать, что кто-то ещё
 * продаёт такую же вещь.
 */
@Injectable()
export class DemandService {
  private readonly logger = new Logger(DemandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.demandWatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { category: { select: { id: true, name: true, icon: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as CategoryKind,
      city: row.city,
      keyword: row.keyword,
      category: row.category,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async add(
    userId: string,
    dto: { kind: CategoryKind; categoryId?: string | null; city?: string | null; keyword?: string | null },
  ) {
    const count = await this.prisma.demandWatch.count({ where: { userId } });
    if (count >= MAX_WATCHES) {
      throw new BadRequestException({
        code: 'TOO_MANY_WATCHES',
        message: `Больше ${MAX_WATCHES} подписок держать нельзя`,
      });
    }

    // Подписка без единого условия означала бы «шлите мне всё подряд».
    // Через неделю такой человек отключит уведомления вовсе — и мы
    // потеряем канал, который дороже одной подписки.
    const keyword = dto.keyword?.trim() || null;
    const city = dto.city?.trim() || null;
    if (!dto.categoryId && !keyword && !city) {
      throw new BadRequestException({
        code: 'WATCH_TOO_BROAD',
        message: 'Выберите хотя бы категорию, город или слово — иначе придёт всё подряд',
      });
    }

    await this.prisma.demandWatch.create({
      data: { userId, kind: dto.kind, categoryId: dto.categoryId ?? null, city, keyword },
    });

    return this.list(userId);
  }

  async remove(userId: string, id: string) {
    await this.prisma.demandWatch.deleteMany({ where: { id, userId } });
    return this.list(userId);
  }

  /**
   * Разослать уведомления о новом запросе.
   *
   * Вызывается, когда запрос «куплю» прошёл проверку и появился на
   * витрине. Именно после проверки: рассылать непроверенное значит
   * поручиться за то, чего мы не видели.
   */
  async notifyAboutListing(listingId: string): Promise<void> {
    try {
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          slug: true,
          kind: true,
          title: true,
          city: true,
          userId: true,
          status: true,
          categories: { select: { categoryId: true } },
        },
      });

      if (!listing || listing.kind !== 'BUY' || listing.status !== 'ACTIVE') return;

      const categoryIds = listing.categories.map((link) => link.categoryId);

      const watches = await this.prisma.demandWatch.findMany({
        where: {
          kind: 'PRODUCT',
          // Автору его же запрос не нужен.
          userId: { not: listing.userId },
          AND: [
            { OR: [{ categoryId: null }, { categoryId: { in: categoryIds } }] },
            { OR: [{ city: null }, { city: { equals: listing.city, mode: 'insensitive' } }] },
          ],
        },
        select: { userId: true, keyword: true },
      });

      const title = listing.title.toLowerCase();
      // Слово проверяем здесь, а не в запросе: сравнение «заголовок
      // содержит слово подписки» базе не выразить одним условием.
      const recipients = new Set(
        watches
          .filter((watch) => !watch.keyword || title.includes(watch.keyword.toLowerCase()))
          .map((watch) => watch.userId),
      );

      for (const userId of recipients) {
        this.notifications.notify(
          userId,
          `🔎 <b>Ищут то, что вы продаёте</b>\n\n«${escapeHtml(listing.title)}» — ${escapeHtml(listing.city)}.\n\n` +
            'Откройте и предложите своё.',
          this.notifications.miniAppUrl,
        );
      }

      if (recipients.size > 0) {
        this.logger.log(`Запрос ${listing.id}: уведомлено ${recipients.size}`);
      }
    } catch (error) {
      // Рассылка — не часть публикации: если она не удалась, запрос
      // всё равно должен выйти на витрину.
      this.logger.warn(`Не удалось разослать уведомления по ${listingId}: ${String(error)}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
