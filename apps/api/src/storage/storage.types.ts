/**
 * Хранилище файлов, отвязанное от конкретного провайдера.
 *
 * Приложению нужно ровно три операции, и все они выражаются одинаково
 * и для диска, и для S3. Благодаря этому проект запускается локально
 * без единого внешнего аккаунта, а переезд в облако меняет одну переменную.
 */
export interface StoredFile {
  /** Ключ внутри хранилища: по нему файл удаляется. */
  key: string;
  /** Публичный адрес, который попадает в базу и отдаётся клиенту. */
  url: string;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  /** Собирает публичный адрес по ключу — нужен при смене домена. */
  urlFor(key: string): string;
}

/** Типы, которые принимаются на загрузку, и их сигнатуры в первых байтах файла. */
export const ALLOWED_IMAGE_TYPES: Record<string, { extension: string; magic: number[][] }> = {
  'image/jpeg': { extension: 'jpg', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { extension: 'png', magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  // WebP: "RIFF" .... "WEBP" — проверяем обе части, они разнесены по смещению.
  'image/webp': { extension: 'webp', magic: [[0x52, 0x49, 0x46, 0x46]] },
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Определяет тип по содержимому файла, а не по заголовку запроса.
 *
 * Content-Type присылает клиент, и доверять ему нельзя: подменив заголовок,
 * можно было бы загрузить что угодно под видом картинки.
 */
export function detectImageType(buffer: Buffer): string | null {
  for (const [mime, { magic }] of Object.entries(ALLOWED_IMAGE_TYPES)) {
    for (const signature of magic) {
      if (signature.every((byte, index) => buffer[index] === byte)) {
        // У WebP после RIFF идёт размер, а на смещении 8 — метка формата.
        if (mime === 'image/webp') {
          const label = buffer.subarray(8, 12).toString('ascii');
          if (label !== 'WEBP') continue;
        }
        return mime;
      }
    }
  }
  return null;
}
