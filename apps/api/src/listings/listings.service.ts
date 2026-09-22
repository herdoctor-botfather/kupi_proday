import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ListingDetail,
  ListingDto,
  ListingKind,
  ListingQuery,
  MyListing,
  Paginated,
  ListingListItem,
} from '@app/shared';
import { LISTING_PHOTOS_MAX, maskContacts } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContactPolicyService } from '../notifications/contact-policy.service';
import { StorageService } from '../storage/storage.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferralsService } from '../referrals/referrals.service';
import { detailInclude, listInclude, toDetail, toListItem, toMyListing } from './listings.mapper';

/** Больше этого числа снимков в объявлении не пролистают. */

/** Сколько объявлений один человек может держать опубликованными одновременно. */
const MAX_ACTIVE_LISTINGS = 20;

/**
 * Объявления о продаже товаров — вторая витрина рядом с каталогом услуг.
 *
 * Правила те же, что у анкет специалистов: публикация после проверки,
 * контакты в текстах скрываются, связь только через чат приложения.
 * Объявления о продаже — самая уязвимая для мошенничества часть каталога,
 * поэтому послаблений здесь быть не должно.
 */
@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly contactPolicy: ContactPolicyService,
    private readonly storage: StorageService,
    private readonly payments: PaymentsService,
    private readonly referrals: ReferralsService,
  ) {}

  // ─────────── Витрина ───────────

  async findMany(query: ListingQuery): Promise<Paginated<ListingListItem>> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: listInclude,
        orderBy: this.buildOrderBy(query.sort),
        skip,
        take: query.pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      items: rows.map(toListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: skip + rows.length < total,
    };
  }

  async findOne(idOrSlug: string, viewerId: string | null): Promise<ListingDetail> {
    const row = await this.prisma.listing.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        // Проданное остаётся доступным по ссылке: покупатель может вернуться
        // к переписке, а история продавца не должна обрываться.
        status: { in: ['ACTIVE', 'SOLD'] },
      },
      include: detailInclude,
    });

    if (!row) {
      throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    }

    // Свои просмотры не считаем — иначе счётчик показывал бы активность автора.
    if (viewerId !== row.userId) void this.countView(row.id);

    return toDetail(row, viewerId);
  }

  /** Города, где есть объявления, — для фильтра витрины. */
  async findCities(kind: ListingKind, query?: string): Promise<{ name: string; count: number }[]> {
    const rows = await this.prisma.listing.groupBy({
      by: ['city'],
      where: {
        status: 'ACTIVE',
        kind,
        ...(query ? { city: { contains: query, mode: 'insensitive' } } : {}),
      },
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: 30,
    });
    return rows.map((row) => ({ name: row.city, count: row._count.city }));
  }

  // ─────────── Свои объявления ───────────

  async findOwn(userId: string): Promise<MyListing[]> {
    const rows = await this.prisma.listing.findMany({
      where: { userId },
      include: detailInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toMyListing);
  }

  async findOwnOne(userId: string, id: string): Promise<MyListing> {
    const row = await this.prisma.listing.findFirst({
      where: { id, userId },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    return toMyListing(row);
  }

  async create(userId: string, dto: ListingDto): Promise<MyListing> {
    await this.assertCategoriesExist(dto.categoryIds, dto.kind);

    // Лимит считается по каждой витрине отдельно: два десятка запросов
    // не должны мешать человеку продавать свои вещи.
    const active = await this.prisma.listing.count({
      where: { userId, kind: dto.kind, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    if (active >= MAX_ACTIVE_LISTINGS) {
      throw new BadRequestException({
        code: 'TOO_MANY_LISTINGS',
        message: `Одновременно можно разместить не больше ${MAX_ACTIVE_LISTINGS} объявлений`,
      });
    }

    // Платный лимит — только на продажу. Запросы на покупку бесплатны:
    // это сторона спроса, ради которой продавцы сюда и приходят.
    if (dto.kind === 'SELL') {
      const quota = await this.payments.listingQuota(userId);
      if (quota.left <= 0) {
        throw new BadRequestException({
          code: 'LISTING_QUOTA_EXCEEDED',
          message: `Бесплатные объявления этого месяца закончились. Следующее — ${quota.extraStars} ★.`,
        });
      }
    }

    const prepared = this.toData(dto);
    const listing = await this.prisma.listing.create({
      data: {
        ...prepared.data,
        userId,
        slug: await this.generateSlug(dto.title),
        status: 'PENDING',
        categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
      },
    });

    await this.saveAttributes(listing.id, dto.categoryIds, dto.attributes);

    void this.notifications.notifyStaff(
      dto.kind === 'BUY'
        ? `🔎 <b>Новый запрос на проверку</b>\n\nИщут: ${escapeHtml(dto.title)} — до ${formatPrice(dto.price)}`
        : `🏷 <b>Новое объявление на проверку</b>\n\n${escapeHtml(dto.title)} — ${formatPrice(dto.price)}`,
    );
    if (prepared.hadContacts) this.contactPolicy.register(userId, 'profile');

    // Подарок за первое дело. Выдаём здесь, а не при регистрации: звёзды
    // случайному посетителю ничего не меняют, а человеку, который уже
    // что-то выложил, дают повод попробовать платное.
    void this.payments.grantWelcomeBonus(userId, 'Подарок за первое объявление');
    // Тот же повод засчитывает и приглашение: человек перестал быть зрителем.
    void this.referrals.qualify(userId);

    return this.findOwnOne(userId, listing.id);
  }

  async update(userId: string, id: string, dto: ListingDto): Promise<MyListing> {
    const current = await this.prisma.listing.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    if (current.status === 'SOLD') {
      throw new BadRequestException({
        code: 'LISTING_SOLD',
        message: 'Проданное объявление изменить нельзя. Разместите новое.',
      });
    }

    await this.assertCategoriesExist(dto.categoryIds, dto.kind);
    const prepared = this.toData(dto);

    // Опубликованное остаётся на витрине, но идёт на повторную проверку:
    // снимать объявление из-за исправленной опечатки слишком грубо.
    const isPublished = current.status === 'ACTIVE';

    await this.prisma.$transaction(async (tx) => {
      await tx.listingCategory.deleteMany({ where: { listingId: id } });
      await tx.listing.update({
        where: { id },
        data: {
          ...prepared.data,
          status: isPublished ? 'ACTIVE' : 'PENDING',
          needsReview: isPublished,
          rejectionReason: null,
          categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
        },
      });
      // Категории могли смениться, а с ними и набор характеристик:
      // старые значения от прежней категории здесь уже не значат ничего.
      await tx.listingAttribute.deleteMany({ where: { listingId: id } });
    });

    await this.saveAttributes(id, dto.categoryIds, dto.attributes);

    if (prepared.hadContacts) this.contactPolicy.register(userId, 'profile');

    return this.findOwnOne(userId, id);
  }

  /** Пометить проданным. Объявление уходит с витрины, но остаётся в истории. */
  async markSold(userId: string, id: string): Promise<MyListing> {
    const current = await this.prisma.listing.findFirst({ where: { id, userId }, select: { id: true } });
    if (!current) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });

    await this.prisma.listing.update({
      where: { id },
      data: { status: 'SOLD', soldAt: new Date(), needsReview: false },
    });
    return this.findOwnOne(userId, id);
  }

  async hide(userId: string, id: string): Promise<MyListing> {
    const current = await this.prisma.listing.findFirst({ where: { id, userId }, select: { id: true } });
    if (!current) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });

    await this.prisma.listing.update({ where: { id }, data: { status: 'HIDDEN' } });
    return this.findOwnOne(userId, id);
  }

  /** Вернуть на витрину. Проходившее модерацию возвращается сразу. */
  async publish(userId: string, id: string): Promise<MyListing> {
    const current = await this.prisma.listing.findFirst({
      where: { id, userId },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!current) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    if (current.status === 'ACTIVE') {
      throw new BadRequestException({ code: 'ALREADY_ACTIVE', message: 'Объявление уже опубликовано' });
    }

    await this.prisma.listing.update({
      where: { id },
      data: { status: current.publishedAt ? 'ACTIVE' : 'PENDING', soldAt: null },
    });
    return this.findOwnOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id, userId },
      include: { photos: { select: { storageKey: true } } },
    });
    if (!listing) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });

    await this.prisma.listing.delete({ where: { id } });
    // Файлы удаляем после записи: если упадёт удаление файла, в базе
    // не останется ссылки на несуществующий снимок.
    for (const photo of listing.photos) await this.storage.remove(photo.storageKey);
  }

  // ─────────── Фотографии ───────────

  async addPhoto(userId: string, listingId: string, file: { url: string; key: string }): Promise<MyListing> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, userId },
      select: { id: true, _count: { select: { photos: true } } },
    });
    if (!listing) {
      await this.storage.remove(file.key);
      throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Объявление не найдено' });
    }
    if (listing._count.photos >= LISTING_PHOTOS_MAX) {
      await this.storage.remove(file.key);
      throw new BadRequestException({
        code: 'TOO_MANY_PHOTOS',
        message: `В объявлении не больше ${LISTING_PHOTOS_MAX} фотографий`,
      });
    }

    await this.prisma.listingPhoto.create({
      data: { listingId, url: file.url, storageKey: file.key, sortOrder: listing._count.photos },
    });
    return this.findOwnOne(userId, listingId);
  }

  async removePhoto(userId: string, photoId: string): Promise<void> {
    const photo = await this.prisma.listingPhoto.findUnique({
      where: { id: photoId },
      include: { listing: { select: { userId: true } } },
    });
    if (!photo || photo.listing.userId !== userId) {
      throw new NotFoundException({ code: 'PHOTO_NOT_FOUND', message: 'Фотография не найдена' });
    }

    await this.prisma.listingPhoto.delete({ where: { id: photoId } });
    await this.storage.remove(photo.storageKey);
  }

  // ─────────── Вспомогательное ───────────

  private buildWhere(query: ListingQuery): Prisma.ListingWhereInput {
    // Витрина продажи и витрина спроса не пересекаются никогда: смешав их,
    // мы показали бы покупателю чужие запросы вместо товаров.
    const where: Prisma.ListingWhereInput = { status: 'ACTIVE', kind: query.kind };

    // Раздел показывает и то, что лежит в его подкатегориях: выбрав
    // «Электронику», человек ждёт увидеть и телефоны, и ноутбуки.
    if (query.categorySlug) where.categories = { some: { category: { OR: [{ slug: query.categorySlug }, { parent: { slug: query.categorySlug } }] } } };
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };

    /*
     * Характеристики: каждая сужает выдачу отдельно.
     *
     * Условия складываются через AND по одному `some` на характеристику —
     * иначе «Apple» и «256 ГБ» в одном `some` означали бы «или то, или
     * другое у любой характеристики», и в выдачу попал бы Samsung на 256.
     */
    for (const [slug, value] of parseAttrs(query.attrs)) {
      const condition: Prisma.ListingWhereInput = {
        attributes: { some: { attribute: { slug }, valueText: value } },
      };
      where.AND = Array.isArray(where.AND) ? [...where.AND, condition] : [condition];
    }
    // Страница продавца: все его объявления одной выдачей.
    if (query.sellerId) where.userId = query.sellerId;
    if (query.condition) where.condition = query.condition;
    // Срочная витрина: только то, у чего срок срочности ещё не вышел.
    if (query.urgent) {
      where.isUrgent = true;
      where.urgentUntil = { gt: new Date() };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      // Цены в запросе приходят в рублях, в базе хранятся в копейках.
      where.priceAmount = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice * 100 } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice * 100 } : {}),
      };
    }

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildOrderBy(sort: ListingQuery['sort']): Prisma.ListingOrderByWithRelationInput[] {
    switch (sort) {
      case 'cheap':
        return [{ priceAmount: 'asc' }, { createdAt: 'desc' }];
      case 'expensive':
        return [{ priceAmount: 'desc' }, { createdAt: 'desc' }];
      case 'new':
      default:
        return [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
    }
  }

  /**
   * Сохраняет характеристики объявления.
   *
   * Принимаются только те, что заведены у выбранных категорий или их
   * предков: присланное поле, которого в категории нет, молча
   * отбрасывается — иначе через форму можно было бы записать что угодно.
   *
   * Пустое значение означает «не указано» и просто не сохраняется:
   * хранить пустую строку значит утверждать, что ответ был дан.
   */
  private async saveAttributes(
    listingId: string,
    categoryIds: string[],
    values: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    const entries = Object.entries(values ?? {}).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    );
    if (entries.length === 0) return;

    const attributes = await this.attributesFor(categoryIds);
    const bySlug = new Map(attributes.map((attribute) => [attribute.slug, attribute]));

    const rows: Prisma.ListingAttributeCreateManyInput[] = [];
    for (const [slug, value] of entries) {
      const attribute = bySlug.get(slug);
      if (!attribute) continue;

      if (attribute.kind === 'NUMBER') {
        const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!Number.isFinite(parsed)) continue;
        rows.push({ listingId, attributeId: attribute.id, valueNumber: parsed });
        continue;
      }
      if (attribute.kind === 'BOOLEAN') {
        rows.push({ listingId, attributeId: attribute.id, valueBool: value === true || value === 'true' });
        continue;
      }
      rows.push({ listingId, attributeId: attribute.id, valueText: String(value).slice(0, 200) });
    }

    if (rows.length > 0) await this.prisma.listingAttribute.createMany({ data: rows, skipDuplicates: true });
  }

  /**
   * Характеристики выбранных категорий вместе с унаследованными.
   *
   * «Марка» заведена у «Телефонов», а объявление лежит в них же или
   * глубже — поэтому поднимаемся по дереву до корня и собираем всё,
   * что встретилось по дороге.
   */
  async attributesFor(categoryIds: string[]): Promise<
    { id: string; slug: string; kind: string }[]
  > {
    const chain = new Set(categoryIds);
    let frontier = categoryIds;

    // Дерево двухуровневое, но на всякий случай идём вверх циклом:
    // вырастет третий уровень — код останется верным.
    for (let depth = 0; depth < 5 && frontier.length > 0; depth += 1) {
      const parents = await this.prisma.category.findMany({
        where: { id: { in: frontier } },
        select: { parentId: true },
      });
      frontier = parents.flatMap((row) => (row.parentId ? [row.parentId] : []));
      for (const id of frontier) chain.add(id);
    }

    return this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: [...chain] } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, kind: true },
    });
  }

  private toData(dto: ListingDto) {
    let hadContacts = false;

    const clean = (value: string | null | undefined): string | null => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      const { text, hasContacts } = maskContacts(trimmed);
      if (hasContacts) hadContacts = true;
      return text || null;
    };

    const data = {
      kind: dto.kind,
      // Название чистим тоже: «iPhone 89001234567» видно прямо в списке.
      title: clean(dto.title) ?? dto.title.trim(),
      description: clean(dto.description),
      // В форме рубли, в базе копейки.
      priceAmount: dto.price * 100,
      isNegotiable: dto.isNegotiable,
      // Обмен предлагает тот, кто ищет; у объявления о продаже это поле
      // не имеет смысла, и присланное значение молча отбрасывается.
      exchangeFor: dto.kind === 'BUY' ? clean(dto.exchangeFor) : null,
      condition: dto.condition,
      city: dto.city.trim(),
      isUrgent: dto.isUrgent,
      /*
       * Срочность с собственным сроком.
       *
       * Неделя — не формальность: витрину срочного листают ради повода
       * поторопиться, и объявление месячной давности этот повод убивает.
       * По истечении оно остаётся на общей витрине и просто уходит
       * из срочной, без всякого участия человека.
       */
      urgentUntil: dto.isUrgent ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
    };

    return { data, hadContacts };
  }

  /**
   * Категории должны быть с той же полки, что и объявление.
   *
   * Вакансии и резюме раскладываются по отраслям — это категории вида
   * JOB, а не товарные. Проверка поначалу знала только товары и
   * отвергала любую вакансию: «выбрана недоступная категория товаров».
   */
  private async assertCategoriesExist(ids: string[], kind: ListingKind): Promise<void> {
    const found = await this.prisma.category.count({
      where: {
        id: { in: ids },
        isActive: true,
        kind: kind === 'JOB' || kind === 'RESUME' ? 'JOB' : 'PRODUCT',
      },
    });
    if (found !== ids.length) {
      throw new BadRequestException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Выбрана недоступная категория товаров',
      });
    }
  }

  private async countView(id: string): Promise<void> {
    try {
      await this.prisma.listing.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    } catch (error) {
      this.logger.warn(`Не удалось записать просмотр ${id}: ${String(error)}`);
    }
  }

  /** Адрес объявления из названия. Задавать его продавцу незачем. */
  private async generateSlug(title: string): Promise<string> {
    const base = transliterate(title) || 'tovar';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.listing.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function formatPrice(rubles: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(
    rubles,
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Разбирает строку фильтров «brand=Apple,model=iPhone 15» в пары.
 *
 * Значения приходят из адреса, поэтому длину ограничиваем, а всё, что
 * не похоже на пару, отбрасываем: пустой фильтр лучше неверного.
 */
function parseAttrs(raw: string | undefined): [string, string][] {
  if (!raw) return [];
  return raw
    .split(',')
    .flatMap((pair) => {
      const at = pair.indexOf('=');
      if (at <= 0) return [];
      const slug = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (!slug || !value) return [];
      return [[slug, value.slice(0, 120)] as [string, string]];
    })
    .slice(0, 8);
}
