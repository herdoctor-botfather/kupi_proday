import { z } from 'zod';
import {
  NEARBY_RADIUS_DEFAULT_KM,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  RATING_MAX,
  RATING_MIN,
  REVIEW_TEXT_MAX,
} from './constants.js';

/**
 * Схемы запросов. Один источник правды: API валидирует ими входящие данные,
 * фронтенд — формы. Рассинхрон между клиентом и сервером становится невозможен.
 */

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});

export const specialistSortSchema = z.enum(['rating', 'reviews', 'distance', 'new']);
export type SpecialistSort = z.infer<typeof specialistSortSchema>;

/** Параметры экрана списка специалистов: поиск, фильтры, сортировка. */
export const specialistQuerySchema = paginationSchema.extend({
  /** Поиск по имени, заголовку и названиям услуг. */
  q: z.string().trim().max(100).optional(),
  categorySlug: z.string().trim().max(64).optional(),
  city: z.string().trim().max(100).optional(),
  minRating: z.coerce.number().min(RATING_MIN).max(RATING_MAX).optional(),
  /** Координаты пользователя для режима «Найти рядом». */
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(200).default(NEARBY_RADIUS_DEFAULT_KM),
  sort: specialistSortSchema.default('rating'),
})
  // Сортировка и фильтр по расстоянию бессмысленны без точки отсчёта.
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: 'lat и lng задаются только вместе',
    path: ['lat'],
  })
  .refine((v) => v.sort !== 'distance' || v.lat !== undefined, {
    message: 'Сортировка по расстоянию требует координат',
    path: ['sort'],
  });

export type SpecialistQuery = z.infer<typeof specialistQuerySchema>;

/** Границы видимой области карты — грузим только те маркеры, что попадают в кадр. */
export const mapBoundsQuerySchema = z.object({
  north: z.coerce.number().min(-90).max(90),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
  categorySlug: z.string().trim().max(64).optional(),
  /** Верхняя граница числа маркеров, чтобы не уронить карту на плотном городе. */
  limit: z.coerce.number().int().min(1).max(500).default(300),
}).refine((v) => v.north > v.south, {
  message: 'north должен быть больше south',
  path: ['north'],
});

export type MapBoundsQuery = z.infer<typeof mapBoundsQuerySchema>;

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(RATING_MIN).max(RATING_MAX),
  text: z.string().trim().max(REVIEW_TEXT_MAX).optional().nullable(),
});
export type CreateReviewDto = z.infer<typeof createReviewSchema>;

export const onboardingSchema = z.object({
  role: z.enum(['CLIENT', 'SPECIALIST']),
});
export type OnboardingDto = z.infer<typeof onboardingSchema>;

/** Позиция прайс-листа в форме анкеты. Цена вводится в рублях, хранится в копейках. */
export const serviceInputSchema = z.object({
  name: z.string().trim().min(2, 'Название услуги слишком короткое').max(120),
  description: z.string().trim().max(300).nullable().optional(),
  price: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  priceIsFrom: z.boolean().default(false),
});
export type ServiceInputDto = z.infer<typeof serviceInputSchema>;

/**
 * Анкета специалиста, которую заполняет он сам.
 *
 * Отличается от админской upsertSpecialistSchema: здесь нет полей, которыми
 * распоряжается только администрация — статуса, продвижения и slug.
 * Slug генерируется на сервере, иначе один специалист смог бы занять
 * чужой адрес или выбрать вводящий в заблуждение.
 */
export const specialistApplicationSchema = z.object({
  displayName: z.string().trim().min(2, 'Укажите имя').max(100),
  headline: z.string().trim().max(160).nullable().optional(),
  about: z.string().trim().max(5000).nullable().optional(),
  photoUrl: z.string().trim().url('Нужна полная ссылка на изображение').max(500).nullable().optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Укажите город').max(100),
  address: z.string().trim().max(255).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  categoryIds: z.array(z.string()).min(1, 'Выберите хотя бы одну категорию').max(5, 'Не больше пяти категорий'),
  services: z.array(serviceInputSchema).max(30, 'Не больше тридцати услуг').default([]),
  phone: z.string().trim().max(32).nullable().optional(),
  telegram: z.string().trim().max(64).nullable().optional(),
  whatsapp: z.string().trim().max(32).nullable().optional(),
  instagram: z.string().trim().max(128).nullable().optional(),
  website: z.string().trim().url('Нужна полная ссылка').max(255).nullable().optional().or(z.literal('')),
})
  // Каталог без способа связаться бесполезен — это главное, зачем сюда приходят.
  .refine(
    (v) => Boolean(v.phone?.trim() || v.telegram?.trim() || v.whatsapp?.trim() || v.instagram?.trim()),
    { message: 'Укажите хотя бы один способ связи: телефон, Telegram, WhatsApp или Instagram', path: ['phone'] },
  )
  // Координаты задаются только парой, иначе точку на карте не поставить.
  .refine((v) => (v.lat === undefined || v.lat === null) === (v.lng === undefined || v.lng === null), {
    message: 'Координаты задаются вместе: и широта, и долгота',
    path: ['lat'],
  });

export type SpecialistApplicationDto = z.infer<typeof specialistApplicationSchema>;

/** Решение администратора по поданной анкете. */
export const moderateSpecialistSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
}).refine((v) => v.action !== 'reject' || !!v.reason, {
  message: 'При отклонении нужно указать причину',
  path: ['reason'],
});
export type ModerateSpecialistDto = z.infer<typeof moderateSpecialistSchema>;

/** Ответ специалиста на отзыв. Пустая строка удаляет прежний ответ. */
export const replyToReviewSchema = z.object({
  text: z.string().trim().max(1000, 'Ответ не длиннее 1000 символов'),
});
export type ReplyToReviewDto = z.infer<typeof replyToReviewSchema>;

/**
 * Жалоба на карточку или отзыв.
 *
 * Причина выбирается из списка, а не пишется свободно: так жалобы можно
 * группировать, а человеку не приходится формулировать под давлением.
 */
export const REPORT_REASONS = [
  'Недостоверные сведения',
  'Оскорбления или нецензурная лексика',
  'Реклама или спам',
  'Мошенничество',
  'Персональные данные третьих лиц',
  'Другое',
] as const;

export const createReportSchema = z.object({
  target: z.enum(['SPECIALIST', 'REVIEW']),
  targetId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  comment: z.string().trim().max(1000).nullable().optional(),
}).refine((v) => v.reason !== 'Другое' || Boolean(v.comment?.trim()), {
  message: 'Опишите, что не так',
  path: ['comment'],
});
export type CreateReportDto = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z.object({
  action: z.enum(['resolve', 'dismiss']),
  note: z.string().trim().max(500).optional(),
});
export type ResolveReportDto = z.infer<typeof resolveReportSchema>;

export const authSchema = z.object({
  /** Сырая строка window.Telegram.WebApp.initData. */
  initData: z.string().min(1),
});
export type AuthDto = z.infer<typeof authSchema>;

// ─────────── Админка ───────────

export const moderateReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  /** Причина отклонения — обязательна, автор отзыва должен понимать, что не так. */
  note: z.string().trim().max(500).optional(),
}).refine((v) => v.action !== 'reject' || !!v.note, {
  message: 'При отклонении нужно указать причину',
  path: ['note'],
});
export type ModerateReviewDto = z.infer<typeof moderateReviewSchema>;

const contactsShape = {
  phone: z.string().trim().max(32).nullable().optional(),
  telegram: z.string().trim().max(64).nullable().optional(),
  whatsapp: z.string().trim().max(32).nullable().optional(),
  instagram: z.string().trim().max(128).nullable().optional(),
  website: z.string().trim().url().max(255).nullable().optional().or(z.literal('')),
};

export const upsertSpecialistSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'Только латиница, цифры и дефис').min(2).max(80),
  headline: z.string().trim().max(160).nullable().optional(),
  about: z.string().trim().max(5000).nullable().optional(),
  photoUrl: z.string().trim().url().max(500).nullable().optional().or(z.literal('')),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().max(255).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'HIDDEN', 'BLOCKED']).default('PENDING'),
  isPromoted: z.boolean().default(false),
  categoryIds: z.array(z.string()).min(1, 'Выберите хотя бы одну категорию'),
  ...contactsShape,
});
export type UpsertSpecialistDto = z.infer<typeof upsertSpecialistSchema>;

export const upsertCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).min(2).max(60),
  icon: z.string().trim().min(1).max(16).default('🔧'),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type UpsertCategoryDto = z.infer<typeof upsertCategorySchema>;

export const upsertSubscriptionSchema = z.object({
  plan: z.string().trim().min(1).max(32),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  amount: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.string().trim().length(3).default('RUB'),
  note: z.string().trim().max(500).nullable().optional(),
}).refine((v) => v.endsAt > v.startsAt, {
  message: 'Дата окончания должна быть позже даты начала',
  path: ['endsAt'],
});
export type UpsertSubscriptionDto = z.infer<typeof upsertSubscriptionSchema>;
