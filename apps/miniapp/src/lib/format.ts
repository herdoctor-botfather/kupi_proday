/** Форматирование значений для интерфейса. */

/** Цены хранятся в копейках — переводим в рубли без дробной части. */
export function formatPrice(amount: number | null, currency = 'RUB', isFrom = false): string | null {
  if (amount === null) return null;
  const formatted = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
  return isFrom ? `от ${formatted}` : formatted;
}

export function formatDistance(km: number | undefined): string | null {
  if (km === undefined) return null;
  return km < 1 ? `${Math.round(km * 1000)} м` : `${km.toFixed(1)} км`;
}

/** «12 отзывов» — с правильным окончанием. */
export function pluralize(count: number, forms: [string, string, string]): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export const reviewsLabel = (count: number): string =>
  `${count} ${pluralize(count, ['отзыв', 'отзыва', 'отзывов'])}`;

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );
}

/** Приводит контакт к ссылке, по которой можно открыть внешний мессенджер. */
export function contactToUrl(kind: string, value: string): string | null {
  const clean = value.trim();
  if (!clean) return null;

  switch (kind) {
    case 'phone':
      return `tel:${clean.replace(/[^\d+]/g, '')}`;
    case 'telegram':
      return clean.startsWith('http') ? clean : `https://t.me/${clean.replace(/^@/, '')}`;
    case 'whatsapp':
      return `https://wa.me/${clean.replace(/\D/g, '')}`;
    case 'instagram':
      return clean.startsWith('http') ? clean : `https://instagram.com/${clean.replace(/^@/, '')}`;
    case 'website':
      return clean.startsWith('http') ? clean : `https://${clean}`;
    default:
      return null;
  }
}
