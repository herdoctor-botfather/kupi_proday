/** Типы сущностей в том виде, в каком их отдаёт API. */

export type Role = 'USER' | 'MODERATOR' | 'ADMIN';

/** Что пользователь выбрал на стартовом экране. */
export type Onboarding = 'CLIENT' | 'SPECIALIST';
export type SpecialistStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'HIDDEN' | 'BLOCKED';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CurrentUser {
  id: string;
  telegramId: string; // строкой: BigInt не переживает JSON
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  role: Role;
  /** null — выбор роли ещё не сделан, показываем стартовый экран. */
  onboardedAs: Onboarding | null;
  /** Есть ли у пользователя своя анкета специалиста. */
  hasSpecialistProfile: boolean;
}

export interface AuthResponse {
  token: string;
  user: CurrentUser;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  /** Сколько активных специалистов в категории — показываем в каталоге. */
  specialistCount: number;
}

/** Контакты специалиста. Любое поле может отсутствовать. */
export interface SpecialistContacts {
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
}

/** Урезанная карточка для списков и маркеров карты. */
export interface SpecialistListItem {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
  photoUrl: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  ratingAvg: number;
  ratingCount: number;
  isPromoted: boolean;
  categories: Pick<Category, 'id' | 'slug' | 'name' | 'icon'>[];
  /** Расстояние в километрах от точки поиска. Есть только в ответе на гео-запрос. */
  distanceKm?: number;
  /** Есть ли карточка в избранном у текущего пользователя. Для гостя всегда false. */
  isFavorite?: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  /** В минимальных единицах валюты (копейках). */
  priceAmount: number | null;
  currency: string;
  priceIsFrom: boolean;
}

export interface SpecialistPhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface SpecialistDetail extends SpecialistListItem {
  about: string | null;
  address: string | null;
  contacts: SpecialistContacts;
  services: Service[];
  photos: SpecialistPhoto[];
  /** Разбивка оценок: сколько отзывов на каждую звезду. Ключи '1'..'5'. */
  ratingBreakdown: Record<string, number>;
  /** Отзыв текущего пользователя, если он уже оставлял его. */
  myReview: Review | null;
}

export type ReportTarget = 'SPECIALIST' | 'REVIEW';
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface Review {
  id: string;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  createdAt: string;
  /** Публичный ответ специалиста, если он его дал. */
  reply: { text: string; createdAt: string } | null;
  author: {
    firstName: string;
    lastName: string | null;
    photoUrl: string | null;
  };
  /** Причина отклонения — видна только автору отзыва. */
  moderationNote?: string | null;
}

/**
 * Собственная анкета специалиста — то, что владелец видит в личном кабинете.
 * В отличие от публичной карточки включает статус и причину отклонения.
 */
export interface MySpecialistProfile extends SpecialistDetail {
  status: SpecialistStatus;
  needsReview: boolean;
  rejectionReason: string | null;
  viewCount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ProfileViewItem {
  specialist: SpecialistListItem;
  viewedAt: string;
}

/** Форма ошибки, единая для всего API. */
export interface ApiError {
  statusCode: number;
  message: string;
  /** Машиночитаемый код: 'REVIEW_ALREADY_EXISTS', 'SPECIALIST_NOT_FOUND', ... */
  code?: string;
}
