import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  MapBoundsQuery,
  Paginated,
  Review,
  SpecialistDetail,
  SpecialistListItem,
  SpecialistQuery,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { boundingBox, haversineKm } from '../common/geo';
import { detailInclude, listInclude, toDetail, toListItem } from './specialists.mapper';
import { toReviewDto } from '../reviews/reviews.mapper';

/**
 * Сколько карточек максимум разбирается в памяти при поиске «рядом».
 * Прямоугольник вокруг точки уже отсекает почти всё по индексу (lat, lng);
 * этот предел — страховка от запроса с радиусом 200 км по плотному городу.
 * Если каталог дорастёт до сотен тысяч карточек, здесь нужен PostGIS.
 */
const GEO_CANDIDATE_LIMIT = 2000;

@Injectable()
export class SpecialistsService {
  private readonly logger = new Logger(SpecialistsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: SpecialistQuery, viewerId: string | null = null): Promise<Paginated<SpecialistListItem>> {
    const where = this.buildWhere(query);

    const page =
      query.lat !== undefined && query.lng !== undefined
        ? await this.findNearby(query, where, query.lat, query.lng)
        : await this.findPlain(query, where);

    page.items = await this.markFavorites(page.items, viewerId);
    return page;
  }

  /**
   * Проставляет признак избранного одним запросом на всю страницу выдачи.
   * Спрашивать по карточке значило бы делать двадцать запросов вместо одного.
   */
  private async markFavorites(
    items: SpecialistListItem[],
    viewerId: string | null,
  ): Promise<SpecialistListItem[]> {
    if (!viewerId || items.length === 0) return items;

    const favorites = await this.prisma.favorite.findMany({
      where: { userId: viewerId, specialistId: { in: items.map((item) => item.id) } },
      select: { specialistId: true },
    });
    const ids = new Set(favorites.map((f) => f.specialistId));

    return items.map((item) => ({ ...item, isFavorite: ids.has(item.id) }));
  }

  /** Обычная выдача: фильтрация, сортировка и пагинация целиком в СУБД. */
  private async findPlain(
    query: SpecialistQuery,
    where: Prisma.SpecialistWhereInput,
  ): Promise<Paginated<SpecialistListItem>> {
    const skip = (query.page - 1) * query.pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.specialist.findMany({
        where,
        include: listInclude,
        orderBy: this.buildOrderBy(query.sort),
        skip,
        take: query.pageSize,
      }),
      this.prisma.specialist.count({ where }),
    ]);

    return {
      items: rows.map((row) => toListItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: skip + rows.length < total,
    };
  }

  /**
   * Поиск «рядом»: прямоугольник отбирает кандидатов по индексу,
   * точное расстояние и сортировка считаются уже на этой выборке.
   */
  private async findNearby(
    query: SpecialistQuery,
    where: Prisma.SpecialistWhereInput,
    lat: number,
    lng: number,
  ): Promise<Paginated<SpecialistListItem>> {
    const box = boundingBox(lat, lng, query.radiusKm);

    const candidates = await this.prisma.specialist.findMany({
      where: {
        ...where,
        lat: { gte: box.minLat, lte: box.maxLat },
        lng: { gte: box.minLng, lte: box.maxLng },
      },
      include: listInclude,
      take: GEO_CANDIDATE_LIMIT,
    });

    if (candidates.length === GEO_CANDIDATE_LIMIT) {
      this.logger.warn(
        `Поиск рядом упёрся в предел ${GEO_CANDIDATE_LIMIT} карточек ` +
          `(радиус ${query.radiusKm} км). Часть результатов могла не попасть в выдачу.`,
      );
    }

    const withDistance = candidates
      .map((row) => ({ row, distanceKm: haversineKm(lat, lng, row.lat!, row.lng!) }))
      // Прямоугольник шире круга по углам — отсекаем лишнее точным расстоянием.
      .filter((c) => c.distanceKm <= query.radiusKm);

    withDistance.sort((a, b) => {
      // Оплаченное продвижение поднимает карточку в любой сортировке.
      if (a.row.isPromoted !== b.row.isPromoted) return a.row.isPromoted ? -1 : 1;
      switch (query.sort) {
        case 'rating':
          return b.row.ratingAvg - a.row.ratingAvg || a.distanceKm - b.distanceKm;
        case 'reviews':
          return b.row.ratingCount - a.row.ratingCount || a.distanceKm - b.distanceKm;
        case 'new':
          return b.row.createdAt.getTime() - a.row.createdAt.getTime();
        case 'distance':
        default:
          return a.distanceKm - b.distanceKm;
      }
    });

    const skip = (query.page - 1) * query.pageSize;
    const page = withDistance.slice(skip, skip + query.pageSize);

    return {
      items: page.map(({ row, distanceKm }) => toListItem(row, distanceKm)),
      total: withDistance.length,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: skip + page.length < withDistance.length,
    };
  }

  /**
   * Города, в которых уже есть опубликованные карточки.
   *
   * Полноценный справочник городов потребовал бы ведения и не решал бы
   * главную беду — расхождение написаний. Подсказка из фактических значений
   * сводит их сама: человек видит «Москва» и выбирает его, а не пишет «Мск».
   */
  async findCities(query?: string): Promise<{ name: string; count: number }[]> {
    const rows = await this.prisma.specialist.groupBy({
      by: ['city'],
      where: {
        status: 'ACTIVE',
        ...(query ? { city: { contains: query, mode: 'insensitive' } } : {}),
      },
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: 30,
    });

    return rows.map((row) => ({ name: row.city, count: row._count.city }));
  }

  /** Маркеры для видимой области карты. */
  async findInBounds(query: MapBoundsQuery): Promise<SpecialistListItem[]> {
    const rows = await this.prisma.specialist.findMany({
      where: {
        status: 'ACTIVE',
        lat: { gte: query.south, lte: query.north },
        ...this.buildLngBounds(query),
        ...(query.categorySlug ? { categories: { some: { category: { slug: query.categorySlug } } } } : {}),
      },
      include: listInclude,
      // При переполнении кадра показываем сильнейшие карточки.
      orderBy: [{ isPromoted: 'desc' }, { ratingAvg: 'desc' }],
      take: query.limit,
    });

    return rows.map((row) => toListItem(row));
  }

  /**
   * Область карты может пересекать 180-й меридиан — тогда west > east
   * и условие превращается в объединение двух диапазонов.
   */
  private buildLngBounds(query: MapBoundsQuery): Prisma.SpecialistWhereInput {
    if (query.west <= query.east) {
      return { lng: { gte: query.west, lte: query.east } };
    }
    return { OR: [{ lng: { gte: query.west } }, { lng: { lte: query.east } }] };
  }

  /** Полный профиль. Просмотр фиксируется в истории, если пользователь авторизован. */
  async findOne(idOrSlug: string, viewerId: string | null): Promise<SpecialistDetail> {
    const row = await this.prisma.specialist.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        status: { in: ['ACTIVE', 'HIDDEN'] },
      },
      include: detailInclude,
    });

    if (!row || row.status !== 'ACTIVE') {
      throw new NotFoundException({ code: 'SPECIALIST_NOT_FOUND', message: 'Специалист не найден' });
    }

    const [breakdown, myReviewRow, favorite] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { specialistId: row.id, status: 'APPROVED' },
        _count: { rating: true },
      }),
      viewerId
        ? this.prisma.review.findUnique({
            where: { specialistId_userId: { specialistId: row.id, userId: viewerId } },
            include: { user: true },
          })
        : Promise.resolve(null),
      viewerId
        ? this.prisma.favorite.findUnique({
            where: { userId_specialistId: { userId: viewerId, specialistId: row.id } },
            select: { userId: true },
          })
        : Promise.resolve(null),
    ]);

    const ratingBreakdown: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const b of breakdown) ratingBreakdown[String(b.rating)] = b._count.rating;

    // Просмотр не должен ломать выдачу профиля, поэтому пишем его в фоне.
    if (viewerId) void this.recordView(viewerId, row.id);

    const myReview: Review | null = myReviewRow ? toReviewDto(myReviewRow, { includeModerationNote: true }) : null;
    return { ...toDetail(row, { ratingBreakdown, myReview }), isFavorite: Boolean(favorite) };
  }

  private async recordView(userId: string, specialistId: string): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.profileView.upsert({
          where: { userId_specialistId: { userId, specialistId } },
          create: { userId, specialistId },
          update: { viewedAt: new Date() },
        }),
        this.prisma.specialist.update({
          where: { id: specialistId },
          data: { viewCount: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      this.logger.warn(`Не удалось записать просмотр ${specialistId}: ${String(error)}`);
    }
  }

  private buildWhere(query: SpecialistQuery): Prisma.SpecialistWhereInput {
    const where: Prisma.SpecialistWhereInput = { status: 'ACTIVE' };

    if (query.categorySlug) {
      where.categories = { some: { category: { slug: query.categorySlug } } };
    }
    if (query.city) {
      where.city = { equals: query.city, mode: 'insensitive' };
    }
    if (query.minRating !== undefined) {
      where.ratingAvg = { gte: query.minRating };
    }
    if (query.q) {
      // Ищем и по карточке, и по названиям услуг: «маникюр» чаще
      // встречается в прайсе, чем в имени мастера.
      where.OR = [
        { displayName: { contains: query.q, mode: 'insensitive' } },
        { headline: { contains: query.q, mode: 'insensitive' } },
        { about: { contains: query.q, mode: 'insensitive' } },
        { services: { some: { name: { contains: query.q, mode: 'insensitive' } } } },
        { categories: { some: { category: { name: { contains: query.q, mode: 'insensitive' } } } } },
      ];
    }
    return where;
  }

  private buildOrderBy(sort: SpecialistQuery['sort']): Prisma.SpecialistOrderByWithRelationInput[] {
    // Продвинутые карточки всегда сверху — это и есть смысл платной подписки.
    const promoted: Prisma.SpecialistOrderByWithRelationInput = { isPromoted: 'desc' };
    switch (sort) {
      case 'reviews':
        return [promoted, { ratingCount: 'desc' }, { ratingAvg: 'desc' }];
      case 'new':
        return [promoted, { publishedAt: 'desc' }, { createdAt: 'desc' }];
      case 'rating':
      case 'distance': // без координат вырождается в сортировку по рейтингу
      default:
        return [promoted, { ratingAvg: 'desc' }, { ratingCount: 'desc' }];
    }
  }
}
