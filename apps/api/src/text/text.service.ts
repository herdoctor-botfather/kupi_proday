import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { TextDraftDto } from '@app/shared';
import { config } from '../config';

/**
 * Сколько черновиков один человек может попросить за сутки.
 *
 * Текст стоит копейки, поэтому денег за него не берём: хорошее описание
 * выгодно самой площадке — по объявлению без слов никто не пишет. Предел
 * нужен не ради экономии, а чтобы нас не использовали как бесплатный
 * чат: попросить можно только описание к своему объявлению.
 */
const DAILY_LIMIT = 20;

/**
 * Задание модели.
 *
 * Главное здесь — запрет выдумывать. На пробе модель сама дописала
 * «б/у, есть следы эксплуатации» к плите, о состоянии которой ей никто
 * не говорил. В объявлении это не украшение, а ложные сведения, за
 * которые отвечать придётся продавцу.
 */
const SYSTEM = [
  'Ты помогаешь составить текст для доски объявлений.',
  'Пиши по-русски, простым человеческим языком, без рекламных восклицаний,',
  'без «спешите» и «уникальное предложение».',
  'Не выдумывай сведений, которых тебе не дали: состояние вещи, комплектность,',
  'причину продажи, опыт работы, цены. Если данных мало — напиши короче.',
  'Три-четыре предложения, без заголовка и без списков.',
].join(' ');

/** Из чего складывается просьба — по каждому поводу своя. */
function compose(dto: TextDraftDto): string {
  const lines: string[] = [];

  if (dto.purpose === 'SPECIALIST') {
    lines.push('Текст «о себе» для анкеты мастера.');
    lines.push(`Имя или название: ${dto.title}.`);
    if (dto.categories?.length) lines.push(`Чем занимается: ${dto.categories.join(', ')}.`);
    if (dto.city) lines.push(`Город: ${dto.city}.`);
  } else {
    lines.push(
      dto.purpose === 'LISTING_BUY'
        ? 'Запрос на покупку: человек ищет вещь и ждёт предложений.'
        : 'Объявление о продаже вещи.',
    );
    lines.push(`Заголовок: ${dto.title}.`);
    if (dto.categories?.length) lines.push(`Категория: ${dto.categories.join(', ')}.`);
    if (dto.city) lines.push(`Город: ${dto.city}.`);
    if (dto.price) {
      lines.push(
        dto.purpose === 'LISTING_BUY' ? `Готов заплатить до: ${dto.price}.` : `Цена: ${dto.price}.`,
      );
    }
  }

  if (dto.extra) lines.push(`Что ещё важно: ${dto.extra}`);

  return lines.join('\n');
}

/**
 * Черновик описания.
 *
 * Человек получает не готовый текст, а заготовку, которую правит. Поэтому
 * модели дают только те сведения, которые он уже ввёл в форму: всё
 * остальное она сочинит, а отвечать за сочинённое будет он.
 */
@Injectable()
export class TextService {
  private readonly logger = new Logger(TextService.name);

  /**
   * Счётчик просьб за сутки. Живёт в памяти: предел нужен от баловства,
   * а не от злоумышленника, и переживать перезапуск ему незачем.
   */
  private readonly used = new Map<string, { day: string; count: number }>();

  async draft(userId: string, dto: TextDraftDto): Promise<{ text: string }> {
    const { baseUrl, apiKey, textModel } = config.images;
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'TEXT_DISABLED',
        message: 'Подсказка текста пока не подключена',
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const seen = this.used.get(userId);
    const count = seen && seen.day === today ? seen.count : 0;
    if (count >= DAILY_LIMIT) {
      throw new BadRequestException({
        code: 'DAILY_LIMIT',
        message: `За сутки можно попросить ${DAILY_LIMIT} черновиков. Попробуйте завтра.`,
      });
    }
    this.used.set(userId, { day: today, count: count + 1 });

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: textModel,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: compose(dto) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(`Черновик не составлен: ${response.status} ${body.slice(0, 200)}`);
      throw new ServiceUnavailableException({
        code: 'TEXT_FAILED',
        message: 'Не получилось составить текст. Попробуйте ещё раз.',
      });
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new ServiceUnavailableException({
        code: 'TEXT_EMPTY',
        message: 'Модель ответила пустотой. Попробуйте ещё раз.',
      });
    }

    return { text };
  }

  /**
   * Объявление по фотографии.
   *
   * Самое дорогое в размещении — не деньги, а минуты: форму из семи
   * полей человек с диваном в прихожей заполнять не станет, а
   * фотография у него уже есть. Модель смотрит на снимок и заполняет
   * заготовку, которую остаётся поправить и отправить.
   *
   * Цену модель называет осторожно и только как ориентир: она не видит
   * ни состояния вещи вблизи, ни местного рынка, и ошибка здесь стоит
   * человеку денег. Поле в форме остаётся за ним.
   */
  async fromPhoto(userId: string, images: string[], categories: string[]): Promise<PhotoDraft> {
    const { baseUrl, apiKey, textModel } = config.images;
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'TEXT_DISABLED',
        message: 'Распознавание фотографий пока не подключено',
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const seen = this.used.get(userId);
    const count = seen && seen.day === today ? seen.count : 0;
    if (count >= DAILY_LIMIT) {
      throw new BadRequestException({
        code: 'DAILY_LIMIT',
        message: `За сутки можно распознать ${DAILY_LIMIT} фотографий. Попробуйте завтра.`,
      });
    }
    this.used.set(userId, { day: today, count: count + 1 });

    /*
     * Описание — о вещи, а не о снимке.
     *
     * Первая версия просила «три-четыре предложения о том, что видно на
     * снимке», и модель честно описывала фотографию: «на фото видны
     * капюшон и карманы, костюм надет на человеке, снято на природе».
     * Покупателю это ничего не даёт — фотографию он видит и сам. Ему
     * нужно то, что написал бы продавец: что за вещь, из чего, чем
     * удобна, кому подойдёт. Поэтому модель пишет от лица продавца,
     * а про снимок, фон и человека в кадре молчит.
     */
    const instruction = [
      'На снимках — одна и та же вещь, которую человек продаёт на доске объявлений; снимков может быть несколько, с разных сторон и крупным планом. Собери сведения со всех: марку с бирки, детали, изъяны.',
      'Ты пишешь объявление от лица продавца. Пиши о самой вещи, а не о фотографии.',
      'Ответь ТОЛЬКО объектом JSON, без пояснений и без разметки, с полями:',
      '"title" — заголовок объявления, как пишут люди: что это, марка и модель, если видно; до 60 знаков;',
      '"description" — 2–4 коротких живых предложения, как пишет продавец: что за вещь, цвет, материал и фасон,' +
        ' заметные детали и чем они удобны, для чего или кому подойдёт.' +
        ' Нельзя упоминать фото, снимок, кадр, фон, место съёмки, человека или модель на фото.' +
        ' Нельзя писать пустые фразы вроде «подробности по запросу», «уточняю в личке», «видно на фото».' +
        ' Пример хорошего описания: «Городской рюкзак из чёрной экокожи, одно большое отделение' +
        ' на молнии и карман спереди. Лёгкий, помещается ноутбук до 14 дюймов. Удобен для учёбы и работы.»;',
      '"category" — один слаг из списка ниже, самый подходящий;',
      '"condition" — одно из: NEW, USED_PERFECT, USED;',
      '"price" — примерная цена в рублях числом, если узнаёшь вещь; иначе null.',
      'Не выдумывай того, чего на снимке не видно: комплектность, срок службы, причину продажи.',
      `Слаги категорий: ${categories.join(', ')}.`,
    ].join(' ');

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: textModel,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: instruction },
              ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(`Фото не распознано: ${response.status} ${body.slice(0, 200)}`);
      throw new ServiceUnavailableException({
        code: 'PHOTO_FAILED',
        message: 'Не получилось разобрать фотографию. Попробуйте другую или заполните вручную.',
      });
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = payload.choices?.[0]?.message?.content?.trim() ?? '';

    return parseDraft(raw, categories);
  }
}

/** Что модель разглядела на снимке — заготовка для формы. */
export type PhotoDraft = {
  title: string;
  description: string;
  category: string | null;
  condition: 'NEW' | 'USED_PERFECT' | 'USED' | null;
  price: number | null;
};

/**
 * Разбор ответа модели.
 *
 * Модель просят ответить чистым JSON, но она нет-нет да обернёт его
 * в ```json — поэтому скобки ищем в тексте, а не доверяем формату.
 * Всё, чего не поняли, остаётся пустым: половина заполненной формы
 * полезнее, чем отказ целиком.
 */
function parseDraft(raw: string, categories: string[]): PhotoDraft {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const empty: PhotoDraft = { title: '', description: '', category: null, condition: null, price: null };
  if (start < 0 || end <= start) return empty;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return empty;
  }

  const text = (value: unknown, limit: number): string =>
    typeof value === 'string' ? value.trim().slice(0, limit) : '';

  const category = text(data.category, 64);
  const condition = text(data.condition, 16).toUpperCase();
  const price = Number(data.price);

  return {
    title: text(data.title, 120),
    description: text(data.description, 2000),
    // Выдуманный слаг отбрасываем: категория должна существовать.
    category: categories.includes(category) ? category : null,
    condition: condition === 'NEW' || condition === 'USED_PERFECT' || condition === 'USED' ? condition : null,
    price: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
  };
}
