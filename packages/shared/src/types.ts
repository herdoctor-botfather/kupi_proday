/** Типы сущностей в том виде, в каком их отдаёт API. */

export type Role = 'USER' | 'MODERATOR' | 'ADMIN';

/** Что пользователь выбрал на стартовом экране. */
export type Onboarding = 'CLIENT' | 'SPECIALIST' | 'MARKET' | 'WANTED';

export type CategoryKind = 'SERVICE' | 'PRODUCT';
export type ListingStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'SOLD' | 'HIDDEN' | 'REJECTED';
export type ListingCondition = 'NEW' | 'USED_PERFECT' | 'USED';
/** SELL — продаю вещь, BUY — ищу вещь и жду предложений от продавцов. */
export type ListingKind = 'SELL' | 'BUY';
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
  kind: CategoryKind;
  /** Сколько активных карточек или объявлений в категории. */
  itemCount: number;
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
  /**
   * Можно ли написать этому специалисту.
   *
   * У карточки, заведённой администратором вручную, нет привязанного
   * Telegram-аккаунта — сообщение отправлять некому. Показывать кнопку,
   * которая гарантированно откажет, нечестно.
   */
  canChat: boolean;
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
  /**
   * До какого момента оплачен показ анкеты. null — подписки нет.
   * Хранится датой, а не признаком «активна»: экран должен показывать
   * не только факт, но и срок, иначе человек не знает, когда платить.
   */
  subscriptionEndsAt: string | null;
}

/** Объявление в списке — краткая карточка витрины. */
export interface ListingListItem {
  id: string;
  slug: string;
  kind: ListingKind;
  title: string;
  priceAmount: number;
  currency: string;
  isNegotiable: boolean;
  /**
   * Что автор запроса готов отдать взамен. Только у запросов на покупку;
   * null — сделка только за деньги.
   */
  exchangeFor: string | null;
  condition: ListingCondition;
  city: string;
  /** Первое фото: в списке показывается только оно. */
  coverUrl: string | null;
  createdAt: string;
  categories: Pick<Category, 'id' | 'slug' | 'name' | 'icon'>[];
}

export interface ListingDetail extends ListingListItem {
  description: string | null;
  photos: { id: string; url: string }[];
  viewCount: number;
  /** Автор объявления: продавец у SELL и покупатель у BUY. */
  seller: {
    /** Идентификатор автора — по нему открывается страница с его объявлениями. */
    id: string;
    name: string;
    photoUrl: string | null;
    /**
     * Адрес анкеты специалиста, если она есть и опубликована. Тогда
     * из объявления ведём сразу в неё: там отзывы, услуги и цены,
     * то есть куда больше, чем на странице с одними объявлениями.
     */
    specialistSlug: string | null;
  };
  /** Объявление принадлежит текущему пользователю — писать себе не нужно. */
  isMine: boolean;
}

/** Своё объявление в личном кабинете — со статусом и причиной отклонения. */
export interface MyListing extends ListingDetail {
  status: ListingStatus;
  needsReview: boolean;
  rejectionReason: string | null;
  soldAt: string | null;
}

/** Собеседник в списке диалогов. */
export interface ConversationParty {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface ConversationSummary {
  id: string;
  /** С кем переписка — противоположная сторона, а не сам пользователь. */
  peer: ConversationParty;
  /**
   * О чём разговор: карточка специалиста или объявление.
   * Ровно одно из полей заполнено.
   */
  specialist: { id: string; slug: string; displayName: string } | null;
  listing: {
    id: string;
    slug: string;
    title: string;
    /** Продажа или запрос: разговоры о них ведут по-разному. */
    kind: ListingKind;
    priceAmount: number;
    currency: string;
  } | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unread: number;
  isBlocked: boolean;
  /** Текущий пользователь в этом диалоге — специалист или заказчик. */
  role: 'CLIENT' | 'SPECIALIST';
}

/**
 * Чужое дело, в котором пользователь участвует: анкета мастера, товар
 * или запрос на покупку, куда он написал.
 *
 * Своё лежит в «Моих объявлениях», и смешивать не нужно: там человек
 * управляет, а здесь — участвует. Вопрос, на который отвечает этот
 * список, один: «во что я ввязался и чем оно кончилось».
 */
export interface Involvement {
  /** Идентификатор переписки: по ней и открывается это участие. */
  id: string;
  /** Из какой двери пришло участие. */
  kind: 'SERVICE' | 'SELL' | 'BUY';
  title: string;
  subtitle: string | null;
  /** Куда ведёт карточка внутри приложения. */
  href: string;
  coverUrl: string | null;
  priceAmount: number | null;
  currency: string | null;
  /** Предмет снят или продан: писать туда уже поздно. */
  isClosed: boolean;
  /** Чьё это дело. */
  owner: ConversationParty;
  lastMessageAt: string | null;
  unread: number;
  /**
   * Сделка отмечена второй стороной. Тогда участие превращается в право
   * оценить человека — до этого момента его нет.
   */
  dealId: string | null;
  /** Отзыв по этой сделке уже оставлен. */
  isReviewed: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  createdAt: string;
  /** Сообщение отправлено текущим пользователем. */
  isMine: boolean;
  /** В сообщении были контакты, и они скрыты. */
  hasMaskedContacts: boolean;
}

export interface ConversationThread {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  /** Есть ли сообщения старше показанных. */
  hasMore: boolean;
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
