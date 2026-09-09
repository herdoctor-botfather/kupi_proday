import type {
  ApiError,
  AuthResponse,
  Category,
  ChatMessage,
  ConversationSummary,
  ConversationThread,
  CategoryKind,
  CreateInvoiceDto,
  CreateReportDto,
  CreateReviewDto,
  ListingDetail,
  ListingDto,
  ListingListItem,
  MyListing,
  CurrentUser,
  MapBoundsQuery,
  MySpecialistProfile,
  Onboarding,
  Paginated,
  ProfileViewItem,
  Review,
  SpecialistApplicationDto,
  SpecialistDetail,
  SpecialistListItem,
} from '@app/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'tgspec.token';

/** Ошибка API с машиночитаемым кодом — по нему интерфейс решает, что показать. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

let token: string | null = readToken();

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Приватный режим браузера может запрещать localStorage — работаем без сохранения.
    return null;
  }
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* см. readToken */
  }
}

export const getToken = (): string | null => token;

/**
 * Отправка файла. Content-Type не выставляем: браузер добавит его сам
 * вместе с boundary, а заданный вручную заголовок сломает разбор на сервере.
 */
async function upload<T>(path: string, file: Blob, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.append('file', file, 'photo.jpg');
  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${BASE_URL}/api${path}`, { method: 'POST', body: form, headers });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as Partial<ApiError>;
    if (response.status === 401) setToken(null);
    throw new ApiRequestError(response.status, error.message ?? 'Не удалось загрузить файл', error.code);
  }

  return payload as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${BASE_URL}/api${path}`, { ...init, headers });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as Partial<ApiError>;
    // Токен протух — стираем, чтобы следующий запуск прошёл авторизацию заново.
    if (response.status === 401) setToken(null);
    throw new ApiRequestError(response.status, error.message ?? 'Не удалось выполнить запрос', error.code);
  }

  return payload as T;
}

const qs = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

export interface SpecialistFilters {
  q?: string;
  categorySlug?: string;
  city?: string;
  minRating?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: 'rating' | 'reviews' | 'distance' | 'new';
  page?: number;
  pageSize?: number;
}

export const api = {
  authTelegram: (initData: string) =>
    request<AuthResponse>('/auth/telegram', { method: 'POST', body: JSON.stringify({ initData }) }),

  categories: (kind: CategoryKind = 'SERVICE') => request<Category[]>(`/categories${qs({ kind })}`),

  /** Города с опубликованными карточками — для подсказки в поле города. */
  cities: (q?: string) => request<{ name: string; count: number }[]>(`/specialists/cities${qs({ q })}`),

  specialists: (filters: SpecialistFilters) =>
    request<Paginated<SpecialistListItem>>(`/specialists${qs(filters as Record<string, unknown>)}`),

  specialist: (idOrSlug: string) => request<SpecialistDetail>(`/specialists/${idOrSlug}`),

  specialistsOnMap: (bounds: MapBoundsQuery) =>
    request<SpecialistListItem[]>(`/specialists/map${qs(bounds as unknown as Record<string, unknown>)}`),

  reviews: (specialistId: string, page = 1) =>
    request<Paginated<Review>>(`/specialists/${specialistId}/reviews${qs({ page })}`),

  createReview: (specialistId: string, dto: CreateReviewDto) =>
    request<Review>(`/specialists/${specialistId}/reviews`, { method: 'POST', body: JSON.stringify(dto) }),

  /** Сохраняет выбор со стартового экрана. */
  setOnboarding: (role: Onboarding) =>
    request<CurrentUser>('/auth/onboarding', { method: 'PATCH', body: JSON.stringify({ role }) }),

  // ─── Своя анкета специалиста ───
  myProfile: () => request<MySpecialistProfile | null>('/me/specialist'),
  createProfile: (dto: SpecialistApplicationDto) =>
    request<MySpecialistProfile>('/me/specialist', { method: 'POST', body: JSON.stringify(dto) }),
  updateProfile: (dto: SpecialistApplicationDto) =>
    request<MySpecialistProfile>('/me/specialist', { method: 'PUT', body: JSON.stringify(dto) }),
  replyToReview: (reviewId: string, text: string) =>
    request<MySpecialistProfile>(`/me/specialist/reviews/${reviewId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  createReport: (dto: CreateReportDto) =>
    request<{ id: string }>('/reports', { method: 'POST', body: JSON.stringify(dto) }),

  uploadAvatar: (file: Blob) => upload<MySpecialistProfile>('/me/specialist/avatar', file),
  addPhoto: (file: Blob, caption?: string) =>
    upload<MySpecialistProfile>('/me/specialist/photos', file, caption ? { caption } : {}),
  removePhoto: (photoId: string) =>
    request<void>(`/me/specialist/photos/${photoId}`, { method: 'DELETE' }),

  hideProfile: () => request<MySpecialistProfile>('/me/specialist/hide', { method: 'POST' }),
  publishProfile: () => request<MySpecialistProfile>('/me/specialist/publish', { method: 'POST' }),

  // ─── Объявления ───
  listings: (filters: Record<string, unknown>) =>
    request<Paginated<ListingListItem>>(`/listings${qs(filters)}`),
  listing: (idOrSlug: string) => request<ListingDetail>(`/listings/${idOrSlug}`),
  listingCities: (kind?: string, q?: string) =>
    request<{ name: string; count: number }[]>(`/listings/cities${qs({ kind, q })}`),

  myListings: () => request<MyListing[]>('/me/listings'),
  myListing: (id: string) => request<MyListing>(`/me/listings/${id}`),
  createListing: (dto: ListingDto) =>
    request<MyListing>('/me/listings', { method: 'POST', body: JSON.stringify(dto) }),
  updateListing: (id: string, dto: ListingDto) =>
    request<MyListing>(`/me/listings/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
  markListingSold: (id: string) => request<MyListing>(`/me/listings/${id}/sold`, { method: 'POST' }),
  hideListing: (id: string) => request<MyListing>(`/me/listings/${id}/hide`, { method: 'POST' }),
  publishListing: (id: string) => request<MyListing>(`/me/listings/${id}/publish`, { method: 'POST' }),
  deleteListing: (id: string) => request<void>(`/me/listings/${id}`, { method: 'DELETE' }),
  addListingPhoto: (id: string, file: Blob) => upload<MyListing>(`/me/listings/${id}/photos`, file),
  removeListingPhoto: (photoId: string) =>
    request<void>(`/me/listings/photos/${photoId}`, { method: 'DELETE' }),

  // ─── Переписка ───
  conversations: () => request<ConversationSummary[]>('/chat/conversations'),
  unreadCount: () => request<{ count: number }>('/chat/unread'),
  startConversation: (specialistId: string) =>
    request<ConversationSummary>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ specialistId }),
    }),
  startListingConversation: (listingId: string) =>
    request<ConversationSummary>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),
  thread: (conversationId: string, before?: string) =>
    request<ConversationThread>(`/chat/conversations/${conversationId}${qs({ before })}`),
  sendMessage: (conversationId: string, text: string) =>
    request<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  history: () => request<ProfileViewItem[]>('/me/history'),
  clearHistory: () => request<void>('/me/history', { method: 'DELETE' }),
  myReviews: () => request<Review[]>('/me/reviews'),
  favorites: () => request<SpecialistListItem[]>('/me/favorites'),
  toggleFavorite: (specialistId: string) =>
    request<{ isFavorite: boolean }>(`/me/favorites/${specialistId}`, { method: 'POST' }),

  // ─── Оплата ───

  createInvoice: (dto: CreateInvoiceDto) =>
    request<{ url: string; paymentId: string }>('/payments/invoice', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  listingQuota: () => request<ListingQuota>('/payments/listing-quota'),

  paymentHistory: () => request<PaymentHistoryItem[]>('/payments/my'),
};

/** Сколько объявлений человек может разместить прямо сейчас. */
export interface ListingQuota {
  freePerMonth: number;
  usedThisMonth: number;
  paidSlots: number;
  left: number;
  extraStars: number;
}

export interface PaymentHistoryItem {
  id: string;
  purpose: 'SPECIALIST_SUBSCRIPTION' | 'LISTING_SLOT' | 'LISTING_PROMOTION';
  plan: string | null;
  stars: number;
  status: 'PAID' | 'REFUNDED';
  paidAt: string | null;
  listing: { title: string; slug: string } | null;
}
