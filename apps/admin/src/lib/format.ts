import type { SpecialistStatus } from '@app/shared';

/** Цены хранятся в копейках. */
export function formatPrice(amount: number | null, currency = 'RUB'): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    amount / 100,
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Значение для <input type="date">. */
export const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

export const STATUS_LABELS: Record<SpecialistStatus, string> = {
  DRAFT: 'Черновик',
  PENDING: 'На проверке',
  ACTIVE: 'Опубликован',
  HIDDEN: 'Скрыт',
  BLOCKED: 'Заблокирован',
};

/** Класс метки статуса: цвет должен сразу показывать, требует ли строка внимания. */
export const STATUS_BADGE: Record<SpecialistStatus, string> = {
  DRAFT: 'badge',
  PENDING: 'badge badge--warning',
  ACTIVE: 'badge badge--success',
  HIDDEN: 'badge',
  BLOCKED: 'badge badge--danger',
};

/** Транслитерация для автоматической генерации slug из названия. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
