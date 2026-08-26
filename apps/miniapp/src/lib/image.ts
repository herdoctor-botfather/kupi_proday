/**
 * Подготовка снимка к отправке прямо в браузере.
 *
 * Фотография с телефона весит 5–10 МБ при разрешении, которое каталогу
 * не нужно: карточка показывает картинку шириной в несколько сотен пикселей.
 * Сжатие на устройстве экономит трафик пользователя, ускоряет загрузку
 * на мобильной сети и снимает нагрузку с сервера — обработка картинок
 * на бэкенде потребовала бы нативных зависимостей вроде sharp.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
/** Верхняя граница на стороне сервера — 5 МБ; оставляем запас. */
const TARGET_MAX_BYTES = 4 * 1024 * 1024;

export class ImageError extends Error {}

export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new ImageError('Это не изображение');
  }

  const bitmap = await loadBitmap(file);

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new ImageError('Браузер не поддерживает обработку изображений');

    // Белая подложка: у PNG с прозрачностью иначе получится чёрный фон,
    // потому что JPEG альфа-канала не хранит.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    let quality = JPEG_QUALITY;
    let blob = await toBlob(canvas, quality);

    // Крупные снимки иногда не укладываются с первого раза — снижаем качество,
    // но не бесконечно: три попытки покрывают все реальные случаи.
    for (let attempt = 0; attempt < 3 && blob.size > TARGET_MAX_BYTES; attempt += 1) {
      quality -= 0.15;
      blob = await toBlob(canvas, Math.max(quality, 0.4));
    }

    if (blob.size > TARGET_MAX_BYTES) {
      throw new ImageError('Изображение слишком большое, попробуйте другое');
    }

    return blob;
  } finally {
    // ImageBitmap держит память до явного освобождения.
    if ('close' in bitmap) bitmap.close();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    // createImageBitmap сам разворачивает снимок по EXIF-ориентации,
    // иначе фотографии с телефона оказываются лежащими на боку.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('Не удалось прочитать изображение');
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageError('Не удалось обработать изображение'))),
      'image/jpeg',
      quality,
    );
  });
}
