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
 *
 * Первым был YandexART: он понимает русский и платится рублями. От него
 * пришлось отказаться — облаку, оформленному на физическое лицо, доступ
 * к модели не выдают, и никакими настройками это не обходится. Текстовые
 * модели при этом работают, поэтому Яндекс остался как переводчик
 * (см. translate ниже).
 */
export interface ImageProvider {
  readonly name: string;
  draw(prompt: string): Promise<Buffer>;
}

/**
 * Рисовалка, говорящая на языке OpenAI.
 *
 * Этот протокол стал общим: по нему работают и сам OpenAI, и российские
 * посредники, через которых у нас проходит оплата рублями. Поэтому
 * поставщик задаётся тремя настройками — адрес, ключ, модель, — и смена
 * одного на другого не требует ни строчки кода.
 */
class OpenAiImagesProvider implements ImageProvider {
  readonly name: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.name = `${new URL(baseUrl).host}:${model}`;
  }

  async draw(prompt: string): Promise<Buffer> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        n: 1,
        size: '1024x1024',
        // Просим картинку содержимым, а не ссылкой: ссылки у посредников
        // живут считаные минуты, а нам файл нужен свой и навсегда.
        response_format: 'b64_json',
      }),
      // Рисование занимает секунды, но зависать навсегда оно не должно:
      // человек ждёт ответа, а звёзды уже списаны.
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'PROVIDER_FAILED',
        message: 'Рисовалка не ответила. Звёзды вернулись на баланс, попробуйте ещё раз.',
        detail: `${response.status} ${body.slice(0, 200)}`,
      });
    }

    const payload = (await response.json()) as {
      data?: { b64_json?: string; url?: string }[];
    };
    const first = payload.data?.[0];

    if (first?.b64_json) return Buffer.from(first.b64_json, 'base64');

    // Не все модели умеют отдавать содержимое; тогда забираем по ссылке,
    // пока она жива.
    if (first?.url) {
      const file = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
      if (file.ok) return Buffer.from(await file.arrayBuffer());
    }

    throw new ServiceUnavailableException({
      code: 'PROVIDER_EMPTY',
      message: 'Рисовалка вернула пустой ответ. Звёзды вернулись на баланс.',
    });
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

  async draw(): Promise<Buffer> {
    throw new ServiceUnavailableException({
      code: 'IMAGES_DISABLED',
      message: 'Рисование картинок пока не подключено',
    });
  }
}

const logger = new Logger('ImageProvider');

export function createImageProvider(): ImageProvider {
  const { baseUrl, apiKey, model } = config.images;

  if (!apiKey || !baseUrl) {
    logger.warn('Рисование выключено: не заданы IMAGE_API_KEY и IMAGE_API_URL');
    return new MissingProvider();
  }

  const provider = new OpenAiImagesProvider(baseUrl, apiKey, model);
  logger.log(`Рисование картинок: ${provider.name}`);
  return provider;
}
