import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { config } from '../config';

/**
 * Кто рисует картинку.
 *
 * Поставщик вынесен за отдельную дверь намеренно. Их несколько, они
 * различаются ценой, языком запроса и способом оплаты, и выбор между
 * ними — вопрос не программы, а обстоятельств: какой картой можно
 * заплатить и открывается ли сервис из России. Всё остальное —
 * списание звёзд, хранение, кнопки — от этого не зависит и переписываться
 * при смене поставщика не должно.
 */
export interface ImageProvider {
  readonly name: string;
  /** Понимает ли поставщик русский запрос без перевода. */
  readonly understandsRussian: boolean;
  draw(prompt: string): Promise<Buffer>;
}

/**
 * YandexART.
 *
 * Выбран за то, что понимает русский родным образом: пользователь пишет
 * «плитка в ванной, светлая», и это работает без перевода. Заграничные
 * модели дешевле и рисуют лучше, но на русское описание отвечают
 * посторонней картинкой, а перевод — ещё один сервис, который может
 * отказать посреди оплаченного действия.
 */
class YandexArtProvider implements ImageProvider {
  readonly name = 'yandex-art';
  readonly understandsRussian = true;

  private readonly url = 'https://ai.api.cloud.yandex.net/v1/images/generations';

  constructor(
    private readonly apiKey: string,
    private readonly folderId: string,
  ) {}

  async draw(prompt: string): Promise<Buffer> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${this.apiKey}`,
        'OpenAI-Project': this.folderId,
      },
      body: JSON.stringify({
        model: `art://${this.folderId}/yandex-art/latest`,
        prompt,
        size: '1024x1024',
      }),
      // Рисование занимает секунды, но зависать навсегда оно не должно:
      // человек ждёт ответа, а звёзды уже списаны.
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'PROVIDER_FAILED',
        message: 'Рисовалка не ответила. Звёзды вернулись на баланс, попробуйте ещё раз.',
        detail: `${response.status} ${body.slice(0, 200)}`,
      });
    }

    const payload = (await response.json()) as { data?: { b64_json?: string }[] };
    const encoded = payload.data?.[0]?.b64_json;

    if (!encoded) {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_EMPTY',
        message: 'Рисовалка вернула пустой ответ. Звёзды вернулись на баланс.',
      });
    }

    return Buffer.from(encoded, 'base64');
  }
}

/**
 * Заглушка на случай ненастроенного ключа.
 *
 * Отказывает сразу и словами, а не падает где-то в середине оплаты:
 * функция просто выключена, и человек должен узнать об этом до того,
 * как с него спишут звёзды.
 */
class MissingProvider implements ImageProvider {
  readonly name = 'none';
  readonly understandsRussian = false;

  async draw(): Promise<Buffer> {
    throw new ServiceUnavailableException({
      code: 'IMAGES_DISABLED',
      message: 'Рисование картинок пока не подключено',
    });
  }
}

const logger = new Logger('ImageProvider');

export function createImageProvider(): ImageProvider {
  const { apiKey, folderId } = config.images;

  if (!apiKey || !folderId) {
    logger.warn('Рисование выключено: не заданы YANDEX_ART_API_KEY и YANDEX_ART_FOLDER_ID');
    return new MissingProvider();
  }

  logger.log('Рисование картинок: yandex-art');
  return new YandexArtProvider(apiKey, folderId);
}
