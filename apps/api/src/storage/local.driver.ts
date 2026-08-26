import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import type { StorageDriver, StoredFile } from './storage.types';

/**
 * Файлы на диске рядом с приложением. Режим для разработки: позволяет
 * запустить проект без облачных аккаунтов.
 *
 * Для продакшена не годится — при нескольких экземплярах API каждый увидит
 * только свои файлы, а пересоздание контейнера сотрёт всё, что не лежит
 * на подключённом томе.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageDriver.name);

  constructor(
    private readonly rootDir: string,
    private readonly publicPrefix: string,
  ) {}

  async put(key: string, body: Buffer, _contentType: string): Promise<StoredFile> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch (error) {
      // Отсутствие файла — не повод ронять удаление записи в базе.
      this.logger.warn(`Не удалось удалить ${key}: ${String(error)}`);
    }
  }

  urlFor(key: string): string {
    return `${this.publicPrefix}/${key}`;
  }

  /** Не даём ключу вывести запись за пределы каталога хранилища. */
  private pathFor(key: string): string {
    const path = resolve(join(this.rootDir, key));
    if (!path.startsWith(resolve(this.rootDir))) {
      throw new Error(`Недопустимый ключ файла: ${key}`);
    }
    return path;
  }
}
