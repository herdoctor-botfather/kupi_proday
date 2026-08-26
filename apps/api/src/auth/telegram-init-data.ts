import { createHmac, timingSafeEqual } from 'node:crypto';
import { INIT_DATA_MAX_AGE_SEC } from '@app/shared';

/**
 * Проверка подлинности данных, которые Telegram передаёт в Mini App.
 *
 * Это единственная точка авторизации приложения: initData подписана токеном
 * бота, поэтому подделать её, не зная токен, нельзя. Алгоритм зафиксирован
 * Telegram и менять его нельзя — см. «Validating data received via the Mini App».
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ParsedInitData {
  user: TelegramUser;
  authDate: Date;
  queryId?: string;
  startParam?: string;
}

export class InitDataError extends Error {}

/**
 * @param initData сырая строка из window.Telegram.WebApp.initData
 * @param botToken токен бота от @BotFather
 * @param maxAgeSec максимальный возраст подписи; 0 отключает проверку (только для тестов)
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number = INIT_DATA_MAX_AGE_SEC,
): ParsedInitData {
  const params = new URLSearchParams(initData);

  const hash = params.get('hash');
  if (!hash) throw new InitDataError('В initData отсутствует hash');
  // Из строки проверки исключается только hash. Поле signature (подпись Ed25519
  // для сторонней проверки) в неё ВХОДИТ — Telegram считает hash по всем
  // остальным полям, включая его. Проверено на реальных данных клиента.
  params.delete('hash');

  // Строка проверки: пары key=value, отсортированные по ключу, через перевод строки.
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!safeEqualHex(computedHash, hash)) {
    // Разбор расхождения подписи почти невозможен без самих данных, поэтому
    // за флагом DEBUG_INIT_DATA=1 выводим строку проверки в лог сервера.
    // По умолчанию выключено: строка содержит профиль пользователя.
    // Разбор расхождения подписи невозможен без самих данных, поэтому за флагом
    // DEBUG_INIT_DATA=1 выводим строку проверки в лог сервера. По умолчанию
    // выключено: строка содержит профиль пользователя.
    if (process.env.DEBUG_INIT_DATA === '1') {
      console.error('[initData] поля:', [...params.keys()].sort().join(', '));
      console.error('[initData] строка проверки:', JSON.stringify(dataCheckString));
      console.error('[initData] ожидали:', computedHash, 'получили:', hash);
    }
    // Подпись ставится токеном бота, поэтому расхождение почти всегда значит,
    // что приложение открыто из другого бота, а не из того, которому оно принадлежит.
    throw new InitDataError(
      'Не удалось подтвердить вход. Откройте приложение из того бота, которому оно принадлежит.',
    );
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) throw new InitDataError('В initData отсутствует auth_date');
  const authDateSec = Number(authDateRaw);
  if (!Number.isFinite(authDateSec)) throw new InitDataError('Некорректный auth_date');

  // Отсекаем повторное использование давно перехваченной строки.
  if (maxAgeSec > 0) {
    const ageSec = Math.floor(Date.now() / 1000) - authDateSec;
    if (ageSec > maxAgeSec) throw new InitDataError('Срок действия initData истёк, переоткройте приложение');
    // Небольшой запас на расхождение часов клиента и сервера.
    if (ageSec < -300) throw new InitDataError('auth_date из будущего');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new InitDataError('В initData отсутствует user (приложение открыто не из Telegram?)');

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    throw new InitDataError('Не удалось разобрать поле user');
  }
  if (typeof user.id !== 'number' || !user.first_name) {
    throw new InitDataError('Поле user заполнено некорректно');
  }

  return {
    user,
    authDate: new Date(authDateSec * 1000),
    queryId: params.get('query_id') ?? undefined,
    startParam: params.get('start_param') ?? undefined,
  };
}

/** Сравнение за постоянное время — чтобы по времени ответа нельзя было подобрать хеш. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
