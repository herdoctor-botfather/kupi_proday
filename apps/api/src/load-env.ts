import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Ищет .env, поднимаясь вверх по дереву каталогов.
 *
 * Фиксированный относительный путь здесь не годится: в разработке код
 * выполняется из src/, а после сборки — из dist/src/, и глубина вложенности
 * разная. Поиск вверх работает одинаково в обоих случаях и переживает
 * изменение раскладки сборки.
 */
export function loadEnvFile(startDir = __dirname): string | null {
  let current = startDir;

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(current, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break; // дошли до корня файловой системы
    current = parent;
  }

  // Переменные могут приходить из окружения контейнера — это штатный случай.
  return null;
}
