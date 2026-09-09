import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Involvement } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Через сколько отзыв открывается сам, даже если вторая сторона молчит.
 *
 * Без срока молчание одной стороны прятало бы отзыв другой навсегда,
 * и достаточно было бы просто не отвечать, чтобы плохая оценка никогда
 * не появилась. Две недели — достаточно, чтобы успеть ответить, и не
 * настолько долго, чтобы отзыв потерял смысл.
 */
const REVEAL_AFTER_DAYS = 14;

const revealDeadline = () => new Date(Date.now() - REVEAL_AFTER_DAYS * 24 * 60 * 60 * 1000);

/**
 * Сделки и отзывы участников друг о друге.
 *
 * Отзыв даёт только состоявшаяся сделка. Иначе площадку заливают местью
 * и накрутками: написать «мошенник» может кто угодно, а доказать обратное
 * нельзя. Сделку отмечает продавец — он единственный знает, кому продал.
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Кому можно продать: те, кто писал по этому объявлению.
   *
   * Список — не ограничение, а подсказка: продать можно и человеку
   * со стороны, тогда сделка просто не отмечается и отзывов не будет.
   * Но выбирать из тех, с кем разговор действительно был, честнее,
   * чем позволять указать любого.
   */
  async buyerCandidates(sellerId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true },
    });
    if (!listing) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    if (listing.userId !== sellerId) throw new ForbiddenException('Это чужое объявление');

    const conversations = await this.prisma.conversation.findMany({
      where: { listingId },
      select: {
        client: { select: { id: true, firstName: true, photoUrl: true, avatarUrl: true } },
        lastMessageAt: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 20,
    });

    return conversations.map(({ client }) => ({
      id: client.id,
      name: client.firstName,
      photoUrl: client.avatarUrl ?? client.photoUrl,
    }));
  }

  /**
   * Отметить продажу. Покупатель необязателен: продали мимо площадки —
   * объявление всё равно нужно снять, просто без права на отзыв.
   */
  async markSold(sellerId: string, listingId: string, buyerId: string | null) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, userId: true, title: true },
    });
    if (!listing) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    if (listing.userId !== sellerId) throw new ForbiddenException('Это чужое объявление');
    if (buyerId === sellerId) throw new BadRequestException('Нельзя продать самому себе');

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'SOLD', soldAt: new Date() },
    });

    if (!buyerId) return { dealId: null };

    // Повторная отметка той же продажи не создаёт вторую сделку:
    // иначе за одну вещь можно было бы оставить два отзыва.
    const deal = await this.prisma.deal.upsert({
      where: { listingId_buyerId: { listingId, buyerId } },
      create: { listingId, sellerId, buyerId },
      update: {},
      select: { id: true },
    });

    this.notifications.notify(
      buyerId,
      `🤝 <b>Сделка отмечена</b>\n\nПродавец отметил, что «${escapeHtml(listing.title)}» продано вам. ` +
        'Оставьте отзыв — он поможет другим покупателям.',
      this.notifications.miniAppUrl,
    );

    return { dealId: deal.id };
  }

  /**
   * Чужие дела, в которых человек участвует.
   *
   * Участие начинается с первого сообщения: написал мастеру, откликнулся
   * на запрос, спросил о товаре — и предмет попадает сюда. Списком владеет
   * не тот, кто разместил, а тот, кто пришёл, поэтому берём переписки, где
   * человек — обратившаяся сторона: свои объявления у него в другом месте.
   *
   * Переписка отвечает на вопрос «о чём говорили», а этот список — «во что
   * я ввязался»: тут видно цену, состояние предмета и то, чем всё кончилось.
   */
  async involvements(userId: string): Promise<Involvement[]> {
    const rows = await this.prisma.conversation.findMany({
      where: {
        clientId: userId,
        /*
         * Участие — это разговор или согласие, а не просмотр.
         *
         * Переписка заводится уже при нажатии «Написать», поэтому пустые
         * не считаем: иначе в сделки попадал бы каждый, чью карточку
         * человек открыл из любопытства, и список переставал бы что-либо
         * значить. У услуг участие возникает раньше первого сообщения —
         * в момент, когда мастер принял заявку.
         */
        OR: [
          { lastMessageAt: { not: null } },
          { specialist: { requests: { some: { clientId: userId, status: 'ACCEPTED' } } } },
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      select: {
        id: true,
        lastMessageAt: true,
        clientUnread: true,
        specialist: {
          select: {
            slug: true,
            displayName: true,
            headline: true,
            photoUrl: true,
            status: true,
            user: { select: { id: true, firstName: true, photoUrl: true, avatarUrl: true } },
          },
        },
        listing: {
          select: {
            id: true,
            slug: true,
            kind: true,
            title: true,
            priceAmount: true,
            currency: true,
            status: true,
            photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
            user: { select: { id: true, firstName: true, photoUrl: true, avatarUrl: true } },
          },
        },
      },
    });

    // Сделки по этим же объявлениям: отмеченная продажа превращает участие
    // в право оценить продавца, и человек должен видеть это там же, где
    // видит саму сделку, а не в отдельном углу приложения.
    const listingIds = rows.map((row) => row.listing?.id).filter((id): id is string => Boolean(id));

    const deals = listingIds.length
      ? await this.prisma.deal.findMany({
          where: { buyerId: userId, listingId: { in: listingIds } },
          select: {
            id: true,
            listingId: true,
            reviews: { where: { authorId: userId }, select: { id: true } },
          },
        })
      : [];

    const dealByListing = new Map(deals.map((deal) => [deal.listingId, deal]));

    return rows.flatMap((row): Involvement[] => {
      const owner = row.specialist?.user ?? row.listing?.user;
      // Анкету мог завести администратор — владельца у неё тогда нет,
      // и участвовать не с кем.
      if (!owner) return [];

      const base = {
        id: row.id,
        owner: {
          id: owner.id,
          name: owner.firstName,
          photoUrl: owner.avatarUrl ?? owner.photoUrl,
        },
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        unread: row.clientUnread,
      };

      if (row.specialist) {
        return [
          {
            ...base,
            kind: 'SERVICE' as const,
            title: row.specialist.displayName,
            subtitle: row.specialist.headline,
            href: `/specialist/${row.specialist.slug}`,
            coverUrl: row.specialist.photoUrl,
            priceAmount: null,
            currency: null,
            isClosed: row.specialist.status !== 'ACTIVE',
            dealId: null,
            isReviewed: false,
          },
        ];
      }

      if (!row.listing) return [];
      const deal = dealByListing.get(row.listing.id) ?? null;

      return [
        {
          ...base,
          kind: row.listing.kind,
          title: row.listing.title,
          subtitle: null,
          href: `/listing/${row.listing.slug}`,
          coverUrl: row.listing.photos[0]?.url ?? null,
          priceAmount: row.listing.priceAmount,
          currency: row.listing.currency,
          isClosed: row.listing.status !== 'ACTIVE',
          dealId: deal?.id ?? null,
          isReviewed: Boolean(deal?.reviews.length),
        },
      ];
    });
  }

  /** Сделки, по которым человек ещё не высказался. */
  async pendingReviews(userId: string) {
    const deals = await this.prisma.deal.findMany({
      where: {
        OR: [{ sellerId: userId }, { buyerId: userId }],
        reviews: { none: { authorId: userId } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        sellerId: true,
        listing: { select: { title: true, slug: true } },
        seller: { select: { id: true, firstName: true, photoUrl: true, avatarUrl: true } },
        buyer: { select: { id: true, firstName: true, photoUrl: true, avatarUrl: true } },
      },
    });

    return deals.map((deal) => {
      const counterpart = deal.sellerId === userId ? deal.buyer : deal.seller;
      return {
        id: deal.id,
        createdAt: deal.createdAt.toISOString(),
        listingTitle: deal.listing.title,
        /** Кем человек был в этой сделке — от этого зависит формулировка вопроса. */
        role: deal.sellerId === userId ? ('SELLER' as const) : ('BUYER' as const),
        counterpart: {
          id: counterpart.id,
          name: counterpart.firstName,
          photoUrl: counterpart.avatarUrl ?? counterpart.photoUrl,
        },
      };
    });
  }

  /**
   * Оставить отзыв о второй стороне.
   *
   * Открывается он не сразу: пока вторая сторона не ответила, отзыв
   * виден только автору. Когда отвечает — открываются оба разом, и
   * подстроиться под чужую оценку уже невозможно.
   */
  async leaveReview(authorId: string, dealId: string, rating: number, text: string | null) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, sellerId: true, buyerId: true, listing: { select: { title: true } } },
    });
    if (!deal) throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Сделка не найдена' });

    const isSeller = deal.sellerId === authorId;
    const isBuyer = deal.buyerId === authorId;
    if (!isSeller && !isBuyer) throw new ForbiddenException('Вы не участник этой сделки');

    const targetId = isSeller ? deal.buyerId : deal.sellerId;

    const counterpart = await this.prisma.userReview.findFirst({
      where: { dealId, authorId: targetId },
      select: { id: true },
    });

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.userReview.upsert({
        where: { dealId_authorId: { dealId, authorId } },
        create: {
          dealId,
          authorId,
          targetId,
          rating,
          text,
          // Если вторая сторона уже высказалась — открываем сразу оба.
          revealedAt: counterpart ? now : null,
        },
        update: { rating, text },
      });

      if (counterpart) {
        await tx.userReview.updateMany({
          where: { dealId, revealedAt: null },
          data: { revealedAt: now },
        });
      }
    });

    if (counterpart) {
      this.notifications.notify(
        targetId,
        `⭐️ <b>Отзыв о сделке</b>\n\nОбе стороны оценили сделку «${escapeHtml(deal.listing.title)}» — отзывы опубликованы.`,
        this.notifications.miniAppUrl,
      );
    }

    return { revealed: Boolean(counterpart) };
  }

  /**
   * Отзывы о человеке и его средняя оценка.
   *
   * Скрытые не показываются никому, кроме автора, а по прошествии срока
   * открываются сами — поэтому условие смотрит и на дату: отдельная
   * задача, которая ходила бы по базе и что-то «раскрывала», здесь
   * не нужна и была бы лишним местом для поломки.
   */
  async userReviews(userId: string) {
    const where = {
      targetId: userId,
      OR: [{ revealedAt: { not: null } }, { createdAt: { lt: revealDeadline() } }],
    };

    const [rows, aggregate] = await Promise.all([
      this.prisma.userReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          rating: true,
          text: true,
          createdAt: true,
          author: { select: { firstName: true, photoUrl: true, avatarUrl: true } },
          deal: { select: { sellerId: true, listing: { select: { title: true } } } },
        },
      }),
      this.prisma.userReview.aggregate({ where, _avg: { rating: true }, _count: true }),
    ]);

    return {
      ratingAvg: Number((aggregate._avg.rating ?? 0).toFixed(2)),
      ratingCount: aggregate._count,
      items: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        text: row.text,
        createdAt: row.createdAt.toISOString(),
        listingTitle: row.deal.listing.title,
        /** Кем был автор отзыва: продавцом или покупателем в той сделке. */
        authorRole: row.deal.sellerId === userId ? ('BUYER' as const) : ('SELLER' as const),
        author: {
          name: row.author.firstName,
          photoUrl: row.author.avatarUrl ?? row.author.photoUrl,
        },
      })),
    };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
