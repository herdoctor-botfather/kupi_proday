import type {
  ApiError,
  AuthResponse,
  CurrentUser,
  ModerateReviewDto,
  ModerateSpecialistDto,
  Paginated,
  ReportStatus,
  ReportTarget,
  ResolveReportDto,
  Review,
  SpecialistStatus,
  UpsertCategoryDto,
  UpsertSpecialistDto,
  UpsertSubscriptionDto,
} from '@app/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'tgspec.admin.token';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

let token: string | null = read();

function read(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* приватный режим браузера */
  }
}

export const getToken = (): string | null => token;

/** Вызывается при 401, чтобы приложение вернуло пользователя на экран входа. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: () => void): void => {
  onUnauthorized = handler;
};

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
    if (response.status === 401) {
      setToken(null);
      onUnauthorized?.();
    }
    throw new ApiRequestError(response.status, error.message ?? 'Ошибка запроса', error.code);
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

// ─────────── Типы ответов, которых нет в общем пакете ───────────

export interface AdminStats {
  users: { total: number; newLast30Days: number };
  specialists: { total: number; active: number; pending: number; changed: number };
  reviews: { total: number; pending: number };
  subscriptions: { active: number };
  topViewed: { id: string; displayName: string; viewCount: number; ratingAvg: number; ratingCount: number }[];
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  _count: { specialists: number };
}

export interface AdminSpecialistRow {
  id: string;
  slug: string;
  displayName: string;
  city: string;
  status: SpecialistStatus;
  ratingAvg: number;
  ratingCount: number;
  viewCount: number;
  isPromoted: boolean;
  subscriptionUntil: string | null;
  phone: string | null;
  createdAt: string;
  categories: { category: { id: string; name: string; icon: string } }[];
}

/** Полная карточка из админ-API — со всеми связями, в «сыром» виде Prisma. */
export interface AdminSpecialistDetail extends AdminSpecialistRow {
  headline: string | null;
  about: string | null;
  photoUrl: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  telegram: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
  services: { id: string; name: string; priceAmount: number | null; currency: string; priceIsFrom: boolean }[];
  photos: { id: string; url: string; caption: string | null }[];
}

/** Анкета в очереди: со связями и данными подавшего её пользователя. */
export interface ApplicationRow extends AdminSpecialistDetail {
  isSelfRegistered: boolean;
  needsReview: boolean;
  rejectionReason: string | null;
  updatedAt: string;
  user: { firstName: string; lastName: string | null; username: string | null; photoUrl: string | null } | null;
}

export interface ApplicationsQueue {
  /** Новые анкеты: пока не видны в каталоге, человек ждёт. */
  pending: ApplicationRow[];
  /** Правки уже опубликованных карточек: остаются в каталоге. */
  changed: ApplicationRow[];
  total: number;
}

/** Жалоба вместе с объектом, на который она подана. */
export interface ReportRow {
  id: string;
  target: ReportTarget;
  targetId: string;
  reason: string;
  comment: string | null;
  status: ReportStatus;
  createdAt: string;
  reporter: { firstName: string; lastName: string | null; username: string | null };
  specialist: { id: string; displayName: string; slug: string; status: string; city: string } | null;
  review: {
    id: string;
    rating: number;
    text: string | null;
    status: string;
    specialist: { id: string; displayName: string };
  } | null;
}

export interface AdminSubscription {
  id: string;
  plan: string;
  startsAt: string;
  endsAt: string;
  amount: number | null;
  currency: string;
  note: string | null;
  createdAt: string;
}

export const api = {
  loginWithWidget: (payload: Record<string, unknown>) =>
    request<AuthResponse>('/auth/telegram-login', { method: 'POST', body: JSON.stringify(payload) }),

  loginWithDevToken: (devToken: string) =>
    request<AuthResponse>('/auth/dev', { method: 'POST', body: JSON.stringify({ token: devToken }) }),

  me: () => request<CurrentUser>('/auth/me'),

  stats: () => request<AdminStats>('/admin/stats'),

  pendingReviews: (page = 1) => request<Paginated<Review>>(`/admin/reviews/pending${qs({ page })}`),
  moderateReview: (id: string, dto: ModerateReviewDto) =>
    request<Review>(`/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  applications: () => request<ApplicationsQueue>('/admin/applications'),

  reports: () => request<ReportRow[]>('/admin/reports'),
  resolveReport: (id: string, dto: ResolveReportDto) =>
    request<ReportRow>(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  moderateSpecialist: (id: string, dto: ModerateSpecialistDto) =>
    request<AdminSpecialistRow>(`/admin/specialists/${id}/moderate`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  specialists: (params: { q?: string; status?: string; page?: number }) =>
    request<Paginated<AdminSpecialistRow>>(`/admin/specialists${qs(params)}`),
  specialist: (id: string) => request<AdminSpecialistDetail>(`/admin/specialists/${id}`),
  createSpecialist: (dto: UpsertSpecialistDto) =>
    request<AdminSpecialistDetail>('/admin/specialists', { method: 'POST', body: JSON.stringify(dto) }),
  updateSpecialist: (id: string, dto: UpsertSpecialistDto) =>
    request<AdminSpecialistDetail>(`/admin/specialists/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
  deleteSpecialist: (id: string) => request<void>(`/admin/specialists/${id}`, { method: 'DELETE' }),

  categories: () => request<AdminCategory[]>('/admin/categories'),
  createCategory: (dto: UpsertCategoryDto) =>
    request<AdminCategory>('/admin/categories', { method: 'POST', body: JSON.stringify(dto) }),
  updateCategory: (id: string, dto: UpsertCategoryDto) =>
    request<AdminCategory>(`/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
  deleteCategory: (id: string) => request<void>(`/admin/categories/${id}`, { method: 'DELETE' }),

  subscriptions: (specialistId: string) =>
    request<AdminSubscription[]>(`/admin/specialists/${specialistId}/subscriptions`),
  addSubscription: (specialistId: string, dto: UpsertSubscriptionDto) =>
    request<AdminSubscription>(`/admin/specialists/${specialistId}/subscriptions`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  expireSubscriptions: () => request<{ expired: number }>('/admin/subscriptions/expire', { method: 'POST' }),
};
