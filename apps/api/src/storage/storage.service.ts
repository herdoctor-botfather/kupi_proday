import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { BadRequestException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { config } from '../config';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  detectImageType,
  type StorageDriver,
  type StoredFile,
} from './storage.types';

/** Куда кладём файл — влияет только на префикс ключа, для порядка в бакете. */
export type UploadPurpose = 'avatar' | 'gallery';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;

  constructor() {
    this.driver = config.storage.driver === 's3'
      ? new S3StorageDriver(config.storage.s3)
      : new LocalStorageDriver(resolve(config.storage.localDir), config.storage.localPublicPrefix);

    this.logger.log(`Хранилище файлов: ${this.driver.name}`);
    if (this.driver.name === 'local' && config.isProduction) {
      this.logger.warn(
        'В production используется локальное хранилище. Файлы пропадут при пересоздании контейнера — ' +
          'задайте STORAGE_DRIVER=s3 и параметры бакета.',
      );
    }
  }

  /**
   * Принимает картинку: проверяет размер и настоящий тип, затем сохраняет
   * под случайным именем. Исходное имя файла не используется — в нём могут
   * быть недопустимые символы, путь или чужое расширение.
   */
  async putImage(buffer: Buffer, purpose: UploadPurpose, ownerId: string): Promise<StoredFile> {
    if (buffer.length === 0) {
      throw new BadRequestException({ code: 'EMPTY_FILE', message: 'Файл пуст' });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`,
      });
    }

    const mime = detectImageType(buffer);
    if (!mime) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE',
        message: 'Поддерживаются только изображения JPEG, PNG и WebP',
      });
    }

    const { extension } = ALLOWED_IMAGE_TYPES[mime]!;
    // Владелец в ключе помогает разбирать бакет и находить файлы конкретного
    // специалиста; случайная часть исключает угадывание чужих адресов.
    const key = `${purpose}/${ownerId}/${randomBytes(12).toString('hex')}.${extension}`;

    return this.driver.put(key, buffer, mime);
  }

  async remove(key: string | null | undefined): Promise<void> {
    if (!key) return;
    await this.driver.delete(key);
  }
}
