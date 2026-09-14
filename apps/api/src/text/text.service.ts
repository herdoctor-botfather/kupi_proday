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
}
