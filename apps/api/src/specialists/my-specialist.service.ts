import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { MySpecialistProfile, SpecialistApplicationDto } from '@app/shared';
import { maskContacts } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ContactPolicyService } from '../notifications/contact-policy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { detailInclude, toDetail } from './specialists.mapper';

/** Больше этого числа фотографий в галерее не имеет смысла: их не пролистают. */
const MAX_GALLERY_PHOTOS = 12;

/**
 * Анкета, которую специалист заводит и ведёт сам через Mini App.
 *
 * Отличия от админского управления карточками:
 *  — статус, продвижение и slug специалисту недоступны;
 *  — первая публикация проходит модерацию;
 *  — правка уже опубликованной анкеты не снимает её с публикации,
 *    но помечает для повторной проверки.
 */
@Injectable()
export class MySpecialistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly contactPolicy: ContactPolicyService,
  ) {}

  async findOwn(userId: string): Promise<MySpecialistProfile | null> {
    const row = await this.prisma.specialist.findUnique({
      where: { userId },
      include: detailInclude,
    });
    if (!row) return null;

    // Действующая подписка — та, чей срок ещё не вышел. Их может быть
    // несколько, если человек оплачивал вперёд: берём самую дальнюю,
    // именно до неё анкета и показывается.
    const subscription = await this.prisma.subscription.findFirst({
      where: { specialistId: row.id, endsAt: { gt: new Date() } },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });

    return {
      ...toDetail(row, { ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, myReview: null }),
      status: row.status,
      needsReview: row.needsReview,
      rejectionReason: row.rejectionReason,
      viewCount: row.viewCount,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      subscriptionEndsAt: subscription?.endsAt.toISOString() ?? null,
    };
  }

  /** Подача анкеты. Один пользователь — одна карточка. */
  async create(userId: string, dto: SpecialistApplicationDto): Promise<MySpecialistProfile> {
    const existing = await this.prisma.specialist.findUnique({ where: { userId }, select: { id: true } });
    if (existing) {
      throw new ConflictException({
        code: 'PROFILE_EXISTS',
        message: 'У вас уже есть анкета. Её можно отредактировать.',
      });
    }

    await this.assertCategoriesExist(dto.categoryIds);
    const slug = await this.generateSlug(dto.displayName);
    const prepared = this.toData(dto);

    await this.prisma.$transaction(async (tx) => {
      const specialist = await tx.specialist.create({
        data: {
          ...prepared.data,
          userId,
          slug,
          status: 'PENDING',
          isSelfRegistered: true,
          categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
        },
      });
      await this.replaceServices(tx, specialist.id, dto.services);
      // Пользователь, подавший анкету, очевидно специалист — фиксируем выбор,
      // чтобы стартовый экран больше не показывался.
      await tx.user.update({ where: { id: userId }, data: { onboardedAs: 'SPECIALIST' } });
    });

    // Заявка не должна лежать незамеченной до тех пор, пока кто-то
    // не откроет админ-панель по своей инициативе.
    void this.notifications.notifyStaff(
      `📨 <b>Новая анкета на проверку</b>\n\n${escapeHtml(dto.displayName)} — ${escapeHtml(dto.city)}`,
    );

    if (prepared.hadContacts) this.contactPolicy.register(userId, 'profile');

    return (await this.findOwn(userId))!;
  }

  /** Правка своей анкеты. */
  async update(userId: string, dto: SpecialistApplicationDto): Promise<MySpecialistProfile> {
    const current = await this.prisma.specialist.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Анкета не найдена' });
    }
    if (current.status === 'BLOCKED') {
      throw new BadRequestException({
        code: 'PROFILE_BLOCKED',
        message: 'Анкета заблокирована. Обратитесь к администратору.',
      });
    }

    await this.assertCategoriesExist(dto.categoryIds);

    // Отклонённая или черновая анкета после правки снова идёт на проверку.
    // Опубликованная остаётся видимой, но попадает в очередь повторной проверки.
    const isPublished = current.status === 'ACTIVE';
    const prepared = this.toData(dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.specialistCategory.deleteMany({ where: { specialistId: current.id } });
      await tx.specialist.update({
        where: { id: current.id },
        data: {
          ...prepared.data,
          status: isPublished ? 'ACTIVE' : 'PENDING',
          needsReview: isPublished,
          rejectionReason: null,
          categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
        },
      });
      await this.replaceServices(tx, current.id, dto.services);
    });

    if (prepared.hadContacts) this.contactPolicy.register(userId, 'profile');

    return (await this.findOwn(userId))!;
  }

  /** Снятие анкеты с публикации по желанию владельца. */
  async hide(userId: string): Promise<MySpecialistProfile> {
    const current = await this.prisma.specialist.findUnique({ where: { userId }, select: { id: true, status: true } });
    if (!current) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Анкета не найдена' });
    if (current.status === 'BLOCKED') {
      throw new BadRequestException({ code: 'PROFILE_BLOCKED', message: 'Анкета заблокирована' });
    }

    await this.prisma.specialist.update({ where: { id: current.id }, data: { status: 'HIDDEN' } });
    return (await this.findOwn(userId))!;
  }

  /** Возврат к публикации после самостоятельного скрытия. */
  async publish(userId: string): Promise<MySpecialistProfile> {
    const current = await this.prisma.specialist.findUnique({
      where: { userId },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!current) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Анкета не найдена' });
    if (current.status !== 'HIDDEN') {
      throw new BadRequestException({ code: 'NOT_HIDDEN', message: 'Анкета не скрыта' });
    }

    // Анкета, которая уже проходила модерацию, возвращается сразу.
    // Не публиковавшаяся — уходит на проверку.
    const status = current.publishedAt ? 'ACTIVE' : 'PENDING';
    await this.prisma.specialist.update({ where: { id: current.id }, data: { status } });
    return (await this.findOwn(userId))!;
  }

  // ─────────── Ответы на отзывы ───────────

  /**
   * Публичный ответ на отзыв о себе.
   *
   * Модерацию ответ не проходит: он привязан к конкретному отзыву, виден
   * рядом с ним и подписан именем специалиста — злоупотребление сразу
   * бьёт по самому автору. Пустой текст удаляет прежний ответ.
   */
  async replyToReview(userId: string, reviewId: string, text: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { specialist: { select: { userId: true } }, user: true },
    });

    if (!review || review.specialist.userId !== userId) {
      throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден' });
    }
    if (review.status !== 'APPROVED') {
      throw new BadRequestException({
        code: 'REVIEW_NOT_PUBLISHED',
        message: 'Отвечать можно только на опубликованные отзывы',
      });
    }

    const trimmed = text.trim();
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        replyText: trimmed || null,
        repliedAt: trimmed ? new Date() : null,
      },
      include: { user: true },
    });

    // Автор отзыва должен узнать об ответе — иначе диалога не выйдет.
    if (trimmed) {
      this.notifications.notify(
        review.userId,
        '💬 <b>Специалист ответил на ваш отзыв</b>',
        this.notifications.miniAppUrl,
      );
    }

    return updated;
  }

  // ─────────── Фотографии ───────────

  /**
   * Загрузка снимка работы в галерею. Файл уже проверен и сохранён
   * в хранилище — сюда приходят его адрес и ключ.
   */
  async addPhoto(userId: string, file: { url: string; key: string }, caption: string | null) {
    const specialist = await this.prisma.specialist.findUnique({
      where: { userId },
      select: { id: true, _count: { select: { photos: true } } },
    });
    if (!specialist) {
      // Файл уже в хранилище: без карточки он останется мусором, убираем.
      await this.storage.remove(file.key);
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Сначала заполните анкету' });
    }
    if (specialist._count.photos >= MAX_GALLERY_PHOTOS) {
      await this.storage.remove(file.key);
      throw new BadRequestException({
        code: 'TOO_MANY_PHOTOS',
        message: `В галерее не больше ${MAX_GALLERY_PHOTOS} фотографий`,
      });
    }

    return this.prisma.specialistPhoto.create({
      data: {
        specialistId: specialist.id,
        url: file.url,
        storageKey: file.key,
        caption,
        sortOrder: specialist._count.photos,
      },
    });
  }

  async removePhoto(userId: string, photoId: string): Promise<void> {
    const photo = await this.prisma.specialistPhoto.findUnique({
      where: { id: photoId },
      include: { specialist: { select: { userId: true } } },
    });
    if (!photo || photo.specialist.userId !== userId) {
      throw new NotFoundException({ code: 'PHOTO_NOT_FOUND', message: 'Фотография не найдена' });
    }

    await this.prisma.specialistPhoto.delete({ where: { id: photoId } });
    // Запись удалена — файл больше не нужен. Порядок именно такой: если
    // упадёт удаление файла, в базе не останется ссылки на несуществующий снимок.
    await this.storage.remove(photo.storageKey);
  }

  /** Смена аватара: прежний файл удаляется, чтобы не копить мусор в бакете. */
  async setAvatar(userId: string, file: { url: string; key: string }) {
    const specialist = await this.prisma.specialist.findUnique({
      where: { userId },
      select: { id: true, photoKey: true },
    });
    if (!specialist) {
      await this.storage.remove(file.key);
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Сначала заполните анкету' });
    }

    const previousKey = specialist.photoKey;
    const updated = await this.prisma.specialist.update({
      where: { id: specialist.id },
      data: { photoUrl: file.url, photoKey: file.key },
    });
    await this.storage.remove(previousKey);
    return updated;
  }

  /**
   * Готовит данные анкеты, вычищая контакты из свободных текстов.
   *
   * Без этого правило обходится за секунду: телефон пишется в описании
   * услуг, и каталог снова превращается в доску объявлений с номерами.
   * Возвращает признак, были ли контакты — по нему решаем, предупреждать ли.
   */
  // Тип возвращаемого объекта выводится: явная аннотация Record<string, unknown>
  // стёрла бы форму данных, и Prisma перестала бы видеть обязательные поля.
  private toData(dto: SpecialistApplicationDto) {
    let hadContacts = false;

    const clean = (value: string | null | undefined): string | null => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      const { text, hasContacts } = maskContacts(trimmed);
      if (hasContacts) hadContacts = true;
      return text || null;
    };

    const orNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

    const data = {
      // Имя тоже чистим: «Иван +79001234567» — рабочий способ обойти правило.
      displayName: clean(dto.displayName) ?? dto.displayName.trim(),
      headline: clean(dto.headline),
      about: clean(dto.about),
      // photoUrl приходит из формы; загруженный аватар меняется отдельным
      // методом и приносит с собой photoKey.
      photoUrl: orNull(dto.photoUrl),
      city: dto.city.trim(),
      address: orNull(dto.address),
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
    };

    return { data, hadContacts };
  }

  /** Услуги переписываются целиком: так форма и база всегда совпадают. */
  private async replaceServices(
    tx: Prisma.TransactionClient,
    specialistId: string,
    services: SpecialistApplicationDto['services'],
  ): Promise<void> {
    await tx.service.deleteMany({ where: { specialistId } });
    if (services.length === 0) return;

    await tx.service.createMany({
      data: services.map((service, index) => ({
        specialistId,
        name: service.name.trim(),
        description: service.description?.trim() || null,
        // В форме цена в рублях, в базе — в копейках.
        priceAmount: service.price === null || service.price === undefined ? null : service.price * 100,
        priceIsFrom: service.priceIsFrom,
        sortOrder: index,
      })),
    });
  }

  private async assertCategoriesExist(ids: string[]): Promise<void> {
    const found = await this.prisma.category.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) {
      throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND', message: 'Выбрана недоступная категория' });
    }
  }

  /**
   * Адрес карточки из имени. Специалист его не задаёт: иначе можно было бы
   * занять чужой или вводящий в заблуждение адрес.
   */
  private async generateSlug(displayName: string): Promise<string> {
    const base = transliterate(displayName) || 'master';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.specialist.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }

    // Полсотни тёзок — исключительный случай; добавляем метку времени.
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

/** Экранирование пользовательского текста для parse_mode: HTML. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
