import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config';

/**
 * Актуальный адрес Mini App.
 *
 * В production значение берётся из конфигурации один раз: адрес там постоянный,
 * а чтение файла на каждое сообщение — лишняя работа и лишний риск.
 *
 * В разработке адрес меняется при каждом переподключении туннеля
 * (см. scripts/dev-tunnel.sh). Если бы бот держал значение с момента запуска,
 * после обрыва он продолжал бы слать кнопку на мёртвый адрес, и пользователь
 * видел бы «no tunnel here». Поэтому вне production .env перечитывается,
 * когда файл изменился.
 */

let cachedUrl = config.MINIAPP_URL;
let cachedMtimeMs = 0;

const ENV_PATH = findEnvFile();

export function currentMiniAppUrl(): string {
  if (config.NODE_ENV === 'production' || !ENV_PATH) return cachedUrl;

  try {
    const mtimeMs = statSync(ENV_PATH).mtimeMs;
    if (mtimeMs === cachedMtimeMs) return cachedUrl;
    cachedMtimeMs = mtimeMs;

    const match = readFileSync(ENV_PATH, 'utf8').match(/^MINIAPP_URL="?([^"\n]+)"?/m);
    if (match?.[1] && match[1] !== cachedUrl) {
      cachedUrl = match[1];
      console.log(`Адрес Mini App изменился: ${cachedUrl}`);
    }
  } catch {
    // Файл могли переписать в этот момент — вернём последнее известное значение.
  }

  return cachedUrl;
}

function findEnvFile(): string | null {
  let current = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(current, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}
