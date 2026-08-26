import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { InitDataError } from './telegram-init-data';

/**
 * Проверка данных Telegram Login Widget — входа в веб-админку.
 *
 * Важно: алгоритм отличается от того, которым подписана initData у Mini App.
 * Здесь секретный ключ — это SHA-256 от токена бота, тогда как у Mini App это
 * HMAC от строки «WebAppData». Перепутать их нельзя: подпись просто не сойдётся,
 * поэтому проверки живут в разных функциях, а не в одной с флагом.
 *
 * Документация: https://core.telegram.org/widgets/login#checking-authorization
 */

export interface LoginWidgetUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/** Виджет живёт на странице входа, поэтому окно доверия короче, чем у Mini App. */
const LOGIN_MAX_AGE_SEC = 60 * 60;

export function verifyLoginWidget(
  payload: Record<string, unknown>,
  botToken: string,
  maxAgeSec: number = LOGIN_MAX_AGE_SEC,
): LoginWidgetUser {
  const { hash, ...fields } = payload as Record<string, string | number>;

  if (typeof hash !== 'string' || !hash) {
    throw new InitDataError('В данных входа отсутствует hash');
  }

  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');

  const secretKey = createHash('sha256').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!safeEqualHex(computedHash, hash)) {
    throw new InitDataError('Подпись данных входа не совпадает');
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate)) {
    throw new InitDataError('Некорректный auth_date');
  }

  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (maxAgeSec > 0 && ageSec > maxAgeSec) {
    throw new InitDataError('Данные входа устарели, авторизуйтесь заново');
  }

  const id = Number(fields.id);
  const firstName = fields.first_name;
  if (!Number.isFinite(id) || typeof firstName !== 'string' || !firstName) {
    throw new InitDataError('Данные пользователя заполнены некорректно');
  }

  return {
    id,
    first_name: firstName,
    last_name: typeof fields.last_name === 'string' ? fields.last_name : undefined,
    username: typeof fields.username === 'string' ? fields.username : undefined,
    photo_url: typeof fields.photo_url === 'string' ? fields.photo_url : undefined,
    auth_date: authDate,
    hash,
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
