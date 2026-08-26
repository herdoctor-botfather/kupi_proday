import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import type { StorageDriver, StoredFile } from './storage.types';

export interface S3Options {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Адрес, с которого файлы отдаются публично: CDN или сам бакет. */
  publicUrl: string;
  forcePathStyle: boolean;
}

/**
 * Любое S3-совместимое хранилище: Cloudflare R2, Yandex Object Storage,
 * Backblaze B2, MinIO. Отличаются только endpoint и регион.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly client: S3Client;

  constructor(private readonly options: S3Options) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      // MinIO и часть провайдеров не умеют адресацию по поддомену бакета.
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Картинки неизменяемы: имя содержит случайный идентификатор,
        // поэтому их можно кешировать надолго.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Не удалось удалить ${key}: ${String(error)}`);
    }
  }

  urlFor(key: string): string {
    return `${this.options.publicUrl.replace(/\/+$/, '')}/${key}`;
  }
}
