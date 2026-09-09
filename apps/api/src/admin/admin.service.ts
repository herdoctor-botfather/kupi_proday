import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AdminEditListingDto,
  ModerateReviewDto,
  ModerateListingDto,
  ModerateSpecialistDto,
  Paginated,
  Review,
  UpsertCategoryDto,
  UpsertSpecialistDto,
  UpsertSubscriptionDto,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { recalculateRating, toReviewDto } from '../reviews/reviews.mapper';
import { detailInclude } from '../specialists/specialists.mapper';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────── Статистика ───────────

  async stats() {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      users,
      newUsers,
      specialistsTotal,
      specialistsActive,
      specialistsPending,
      specialistsChanged,
      reviewsPending,
      listingsPending,
      listingsActive,
      reviewsTotal,
      subscriptionsActive,
      topViewed,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
      this.prisma.specialist.count(),
      this.prisma.specialist.count({ where: { status: 'ACTIVE' } }),
      this.prisma.specialist.count({ where: { status: 'PENDING' } }),
      this.prisma.specialist.count({ where: { status: 'ACTIVE', needsReview: true } }),
      this.prisma.review.count({ where: { status: 'PENDING' } }),
      this.prisma.listing.count({ where: { status: 'PENDING' } }),
      this.prisma.listing.count({ where: { status: 'ACTIVE' } }),
      this.prisma.review.count(),
      this.prisma.specialist.count({ where: { subscriptionUntil: { gt: now } } }),
      this.prisma.specialist.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, displayName: true, viewCount: true, ratingAvg: true, ratingCount: true },
        orderBy: { viewCount: 'desc' },
        take: 10,
      }),
    ]);

    return {
      users: { total: users, newLast30Days: newUsers },
      specialists: {
        total: specialistsTotal,
        active: specialistsActive,
        pending: specialistsPending,
        changed: specialistsChanged,
      },
      reviews: { total: reviewsTotal, pending: reviewsPending },
      listings: { active: listingsActive, pending: listingsPending },
      subscriptions: { active: subscriptionsActive },
      topViewed,
    };
  }

  // ─────────── Модерация отзывов ───────────

  async pendingReviews(page = 1, pageSize = 20): Promise<Paginated<Review>> {
    const where = { status: 'PENDING' as const };
    const skip = (page - 1) * pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: { user: true, specialist: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'asc' }, // старые — первыми, чтобы очередь не застаивалась
        skip,
        take: pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items: rows.map((row) => toReviewDto(row, { includeModerationNote: true })),
      total,
      page,
      pageSize,
      hasMore: skip + rows.length < total,
    };
  }

  async moderateReview(reviewId: string, dto: ModerateReviewDto, moderatorId: string): Promise<Review> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден' });

    const status = dto.action === 'approve' ? 'APPROVED' : 'REJECTED';

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: reviewId },
        data: {
          status,
          moderationNote: dto.note ?? null,
          moderatedAt: new Date(),
          moderatedByUserId: moderatorId,
        },
        include: { user: true },
      });
      await recalculateRating(tx, review.specialistId);
      await this.log(tx, moderatorId, `review.${dto.action}`, 'Review', reviewId, { note: dto.note });
      return saved;
    });

    const specialist = await this.prisma.specialist.findUnique({
      where: { id: review.specialistId },
      select: { displayName: true, userId: true },
    });

    // Автору отзыва — о судьбе его текста.
    this.notifications.notify(
      review.userId,
      dto.action === 'approve'
        ? `💬 <b>Отзыв опубликован</b>\n\nВаш отзыв о специалисте «${escapeHtml(specialist?.displayName ?? '')}» виден остальным. Спасибо, что помогаете другим выбирать.`
        : `💬 <b>Отзыв отклонён</b>\n\n${escapeHtml(dto.note ?? 'Причина не указана')}\n\nВы можете отредактировать его и отправить заново.`,
      this.notifications.miniAppUrl,
    );

    // Специалисту — о новом опубликованном отзыве.
    if (dto.action === 'approve' && specialist?.userId) {
      this.notifications.notify(
        specialist.userId,
        `⭐️ <b>Новый отзыв</b>\n\nВам поставили оценку ${updated.rating} из 5.`,
        this.notifications.miniAppUrl,
      );
    }

    return toReviewDto(updated, { includeModerationNote: true });
  }

  // ─────────── Заявки специалистов ───────────

  /**
   * Очередь анкет: новые заявки и правки уже опубликованных карточек.
   * Новые идут первыми — они пока не видны в каталоге, и человек ждёт.
   */
  async pendingApplications() {
    const [pending, changed] = await this.prisma.$transaction([
      this.prisma.specialist.findMany({
        where: { status: 'PENDING' },
        include: { categories: { include: { category: true } }, services: true, user: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.specialist.findMany({
        where: { status: 'ACTIVE', needsReview: true },
        include: { categories: { include: { category: true } }, services: true, user: true },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    return { pending, changed, total: pending.length + changed.length };
  }

  /** Решение по анкете: публикация или отклонение с причиной. */
  async moderateSpecialist(id: string, dto: ModerateSpecialistDto, actorId: string) {
    const specialist = await this.prisma.specialist.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    });
    if (!specialist) {
      throw new NotFoundException({ code: 'SPECIALIST_NOT_FOUND', message: 'Анкета не найдена' });
    }

    const approved = dto.action === 'approve';

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.specialist.update({
        where: { id },
        data: {
          status: approved ? 'ACTIVE' : 'HIDDEN',
          needsReview: false,
          rejectionReason: approved ? null : (dto.reason ?? null),
          // Дата публикации ставится один раз — при первом выходе в каталог.
          publishedAt: approved ? (specialist.publishedAt ?? new Date()) : specialist.publishedAt,
        },
        include: { categories: { include: { category: true } } },
      });
      await this.log(tx, actorId, `specialist.${dto.action}`, 'Specialist', id, { reason: dto.reason });
      return saved;
    });

    // Человек ждёт решения — без уведомления он узнает о нём, только если
    // сам догадается открыть приложение.
    const owner = await this.prisma.specialist.findUnique({ where: { id }, select: { userId: true } });
    if (owner?.userId) {
      this.notifications.notify(
        owner.userId,
        approved
          ? `✅ <b>Анкета опубликована</b>\n\nВаша карточка «${escapeHtml(updated.displayName)}» появилась в каталоге. Теперь вас могут найти клиенты.`
          : `📝 <b>Анкета не прошла проверку</b>\n\n${escapeHtml(dto.reason ?? 'Причина не указана')}\n\nИсправьте и отправьте снова — это займёт минуту.`,
        this.notifications.miniAppUrl,
      );
    }

    return updated;
  }

  // ─────────── Объявления ───────────

  /** Очередь объявлений: новые и правки уже опубликованных. */
  async pendingListings() {
    const [pending, changed] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where: { status: 'PENDING' },
        include: {
          categories: { include: { category: true } },
          photos: { orderBy: { sortOrder: 'asc' } },
          user: { select: { firstName: true, lastName: true, username: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.listing.findMany({
        where: { status: 'ACTIVE', needsReview: true },
        include: {
          categories: { include: { category: true } },
          photos: { orderBy: { sortOrder: 'asc' } },
          user: { select: { firstName: true, lastName: true, username: true } },
        },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    return { pending, changed, total: pending.length + changed.length };
  }

  /**
   * Правка объявления модератором.
   *
   * Только текстовые поля и цена — то, что можно поправить, не меняя
   * сути. Действие записывается в журнал: у продавца объявление меняется
   * без его участия, и он вправе узнать, кто и что исправил.
   */
  async editListing(id: string, dto: AdminEditListingDto, actorId: string) {
    const before = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, title: true, priceAmount: true, description: true },
    });
    if (!before) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });

    const listing = await this.prisma.listing.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description?.trim() || null,
        // В форме рубли, в базе копейки — как и в остальном приложении.
        priceAmount: dto.price * 100,
        isNegotiable: dto.isNegotiable,
        condition: dto.condition,
        city: dto.city.trim(),
      },
      include: {
        categories: { include: { category: true } },
        photos: { orderBy: { sortOrder: 'asc' } },
        user: { select: { firstName: true, lastName: true, username: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'listing.edit',
        entityType: 'Listing',
        entityId: id,
        // Записываем только то, что действительно поменялось: журнал,
        // где каждая запись повторяет всё объявление целиком, читать
        // невозможно, а именно ради чтения он и ведётся.
        payload: {
          ...(before.title === dto.title ? {} : { title: { from: before.title, to: dto.title } }),
          ...(before.priceAmount === dto.price * 100
            ? {}
            : { price: { from: before.priceAmount, to: dto.price * 100 } }),
          ...((before.description ?? '') === (dto.description?.trim() ?? '')
            ? {}
            : { descriptionChanged: true }),
        },
      },
    });

    return listing;
  }

  async moderateListing(id: string, dto: ModerateListingDto, actorId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, userId: true, kind: true, title: true, publishedAt: true },
    });
    if (!listing) {
      throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    }

    const approved = dto.action === 'approve';

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.listing.update({
        where: { id },
        data: {
          status: approved ? 'ACTIVE' : 'REJECTED',
          needsReview: false,
          rejectionReason: approved ? null : (dto.reason ?? null),
          publishedAt: approved ? (listing.publishedAt ?? new Date()) : listing.publishedAt,
        },
      });
      await this.log(tx, actorId, `listing.${dto.action}`, 'Listing', id, { reason: dto.reason });
      return saved;
    });

    // Запрос и объявление о продаже — разные вещи для автора, и путать
    // их в уведомлении нельзя: человек не поймёт, о чём речь.
    const isWanted = listing.kind === 'BUY';
    this.notifications.notify(
      listing.userId,
      approved
        ? isWanted
          ? `🔎 <b>Запрос опубликован</b>\n\n«${escapeHtml(listing.title)}» видят продавцы — ждите предложений.`
          : `🏷 <b>Объявление опубликовано</b>\n\n«${escapeHtml(listing.title)}» появилось на витрине.`
        : isWanted
          ? `🔎 <b>Запрос отклонён</b>\n\n${escapeHtml(dto.reason ?? 'Причина не указана')}\n\nИсправьте и отправьте снова.`
          : `🏷 <b>Объявление отклонено</b>\n\n${escapeHtml(dto.reason ?? 'Причина не указана')}\n\nИсправьте и отправьте снова.`,
      this.notifications.miniAppUrl,
    );

    return updated;
  }

  // ─────────── Специалисты ───────────

  async listSpecialists(params: { q?: string; status?: string; page: number; pageSize: number }) {
    const where: Prisma.SpecialistWhereInput = {};
    if (params.status) where.status = params.status as Prisma.SpecialistWhereInput['status'];
    if (params.q) {
      where.OR = [
        { displayName: { contains: params.q, mode: 'insensitive' } },
        { city: { contains: params.q, mode: 'insensitive' } },
        { phone: { contains: params.q } },
      ];
    }
    const skip = (params.page - 1) * params.pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.specialist.findMany({
        where,
        include: { categories: { include: { category: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.pageSize,
      }),
      this.prisma.specialist.count({ where }),
    ]);

    return { items, total, page: params.page, pageSize: params.pageSize, hasMore: skip + items.length < total };
  }

  getSpecialist(id: string) {
    return this.prisma.specialist.findUniqueOrThrow({
      where: { id },
      include: {
        ...detailInclude,
        user: {
          select: { id: true, telegramId: true, firstName: true, lastName: true, username: true, photoUrl: true },
        },
      },
    });
  }

  /**
   * Находит пользователя по Telegram id для привязки карточки.
   *
   * Пустое значение означает «отвязать». Пользователь должен уже существовать:
   * запись создаётся при первом открытии приложения, и привязать карточку
   * к тому, кто в него не заходил, — значит пообещать чат, которого не будет.
   */
  private async resolveOwner(
    telegramId: string | null | undefined,
    specialistId: string | null,
  ): Promise<string | null | undefined> {
    // undefined — поле не передали, владельца не трогаем.
    if (telegramId === undefined) return undefined;
    if (!telegramId) return null;

    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, specialist: { select: { id: true } } },
    });

    if (!user) {
      throw new BadRequestException({
        code: 'OWNER_NOT_FOUND',
        message: 'Пользователь с таким Telegram id ещё не открывал приложение',
      });
    }
    // У пользователя может быть только одна карточка — это ограничение базы,
    // и лучше объяснить его словами, чем показать ошибку уникального индекса.
    if (user.specialist && user.specialist.id !== specialistId) {
      throw new BadRequestException({
        code: 'OWNER_HAS_PROFILE',
        message: 'У этого пользователя уже есть своя анкета',
      });
    }

    return user.id;
  }

  async createSpecialist(dto: UpsertSpecialistDto, actorId: string) {
    await this.assertCategoriesExist(dto.categoryIds);
    const ownerId = await this.resolveOwner(dto.ownerTelegramId, null);

    const specialist = await this.prisma.specialist.create({
      data: {
        ...this.toSpecialistData(dto),
        ...(ownerId === undefined ? {} : { userId: ownerId }),
        publishedAt: dto.status === 'ACTIVE' ? new Date() : null,
        categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
      },
      include: detailInclude,
    });

    await this.log(this.prisma, actorId, 'specialist.create', 'Specialist', specialist.id, null);
    return specialist;
  }

  async updateSpecialist(id: string, dto: UpsertSpecialistDto, actorId: string) {
    await this.assertCategoriesExist(dto.categoryIds);
    const current = await this.prisma.specialist.findUnique({ where: { id }, select: { publishedAt: true } });
    if (!current) throw new NotFoundException({ code: 'SPECIALIST_NOT_FOUND', message: 'Специалист не найден' });
    const ownerId = await this.resolveOwner(dto.ownerTelegramId, id);

    const specialist = await this.prisma.$transaction(async (tx) => {
      // Категории проще переписать целиком, чем вычислять разницу.
      await tx.specialistCategory.deleteMany({ where: { specialistId: id } });
      return tx.specialist.update({
        where: { id },
        data: {
          ...this.toSpecialistData(dto),
          ...(ownerId === undefined ? {} : { userId: ownerId }),
          // Дата публикации ставится один раз, при первом выходе в ACTIVE.
          publishedAt: dto.status === 'ACTIVE' ? (current.publishedAt ?? new Date()) : current.publishedAt,
          categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
        },
        include: detailInclude,
      });
    });

    await this.log(this.prisma, actorId, 'specialist.update', 'Specialist', id, { status: dto.status });
    return specialist;
  }

  async deleteSpecialist(id: string, actorId: string): Promise<void> {
    await this.prisma.specialist.delete({ where: { id } });
    await this.log(this.prisma, actorId, 'specialist.delete', 'Specialist', id, null);
  }

  private toSpecialistData(dto: UpsertSpecialistDto) {
    return {
      displayName: dto.displayName,
      slug: dto.slug,
      headline: dto.headline ?? null,
      about: dto.about ?? null,
      photoUrl: dto.photoUrl || null,
      city: dto.city,
      address: dto.address ?? null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      phone: dto.phone ?? null,
      telegram: dto.telegram ?? null,
      whatsapp: dto.whatsapp ?? null,
      instagram: dto.instagram ?? null,
      website: dto.website || null,
      status: dto.status,
      isPromoted: dto.isPromoted,
    };
  }

  private async assertCategoriesExist(ids: string[]): Promise<void> {
    const found = await this.prisma.category.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND', message: 'Указана несуществующая категория' });
    }
  }

  // ─────────── Категории ───────────

  listCategories() {
    return this.prisma.category.findMany({
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { specialists: true, listings: true } } },
    });
  }

  createCategory(dto: UpsertCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  updateCategory(id: string, dto: UpsertCategoryDto) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string): Promise<void> {
    const [specialists, listings] = await this.prisma.$transaction([
      this.prisma.specialistCategory.count({ where: { categoryId: id } }),
      this.prisma.listingCategory.count({ where: { categoryId: id } }),
    ]);
    const linked = specialists + listings;
    if (linked > 0) {
      throw new BadRequestException({
        code: 'CATEGORY_IN_USE',
        message: `В категории ${linked} записей. Перенесите их или скройте категорию вместо удаления.`,
      });
    }
    await this.prisma.category.delete({ where: { id } });
  }

  // ─────────── Подписки ───────────

  /**
   * Отметка об оплате. Деньги проходят мимо приложения, админ только фиксирует
   * факт и срок; subscriptionUntil на карточке двигается вперёд, если новый срок больше.
   */
  async addSubscription(specialistId: string, dto: UpsertSubscriptionDto, actorId: string) {
    const specialist = await this.prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { subscriptionUntil: true },
    });
    if (!specialist) throw new NotFoundException({ code: 'SPECIALIST_NOT_FOUND', message: 'Специалист не найден' });

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          specialistId,
          plan: dto.plan,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          amount: dto.amount ?? null,
          currency: dto.currency,
          note: dto.note ?? null,
          createdByUserId: actorId,
        },
      });

      const current = specialist.subscriptionUntil;
      if (!current || dto.endsAt > current) {
        await tx.specialist.update({
          where: { id: specialistId },
          data: { subscriptionUntil: dto.endsAt, isPromoted: true },
        });
      }

      await this.log(tx, actorId, 'subscription.create', 'Specialist', specialistId, { plan: dto.plan });
      return subscription;
    });
  }

  listSubscriptions(specialistId: string) {
    return this.prisma.subscription.findMany({
      where: { specialistId },
      orderBy: { endsAt: 'desc' },
    });
  }

  /**
   * Снимает продвижение с карточек, у которых подписка истекла.
   * Вызывается по расписанию или вручную из админки.
   */
  async expireSubscriptions(): Promise<{ expired: number }> {
    // Сначала выбираем, кого коснётся, — после обновления признак уже снят
    // и найти этих специалистов будет нечем.
    const expiring = await this.prisma.specialist.findMany({
      where: { isPromoted: true, subscriptionUntil: { lt: new Date() } },
      select: { id: true, userId: true, displayName: true },
    });

    const result = await this.prisma.specialist.updateMany({
      where: { id: { in: expiring.map((s) => s.id) } },
      data: { isPromoted: false },
    });

    for (const specialist of expiring) {
      if (!specialist.userId) continue;
      this.notifications.notify(
        specialist.userId,
        '⏳ <b>Размещение закончилось</b>\n\nВаша анкета осталась в каталоге, но больше не поднимается в выдаче. ' +
          'Чтобы продлить, свяжитесь с администратором.',
        this.notifications.miniAppUrl,
      );
    }

    return { expired: result.count };
  }

  // ─────────── Журнал ───────────

  private async log(
    client: PrismaService | Prisma.TransactionClient,
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    payload: Prisma.InputJsonValue | null,
  ): Promise<void> {
    await client.auditLog.create({
      data: { actorId, action, entityType, entityId, payload: payload ?? undefined },
    });
  }
}

/**
 * Экранирование для parse_mode: HTML.
 *
 * В сообщение попадают имя специалиста и причина отклонения — оба текста
 * пишет человек. Символ «<» в них сломал бы разметку, и Telegram отклонил бы
 * всё сообщение целиком.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
