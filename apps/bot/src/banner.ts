import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { InputFile } from 'grammy';
import type { Context } from 'grammy';
import type { InlineKeyboard } from 'grammy';

/**
 * Отправка сообщения с картинкой.
 *
 * Telegram, приняв файл, возвращает его идентификатор — по нему тот же
 * снимок отправляется повторно без загрузки. Без этого каждый /start
 * заливал бы на серверы Telegram одну и ту же картинку заново: лишний
 * трафик и заметная задержка перед ответом.
 *
 * Если картинки на диске нет или Telegram её не принял, сообщение
 * уходит текстом. Баннер — украшение, и терять из-за него ответ бота
 * недопустимо.
 */

// Каталог с картинками лежит рядом со сборкой: dist/../assets.
// __dirname, а не import.meta: бот собирается в CommonJS.
const ASSETS = resolve(__dirname, '..', 'assets');

/** Идентификаторы уже загруженных картинок, по имени файла. */
const uploaded = new Map<string, string>();

/** Имя файла без расширения в apps/bot/assets. */
export type BannerName = string;

export async function replyWithBanner(
  ctx: Context,
  banner: BannerName,
  caption: string,
  keyboard: InlineKeyboard,
  fallbackText: string,
): Promise<void> {
  const cached = uploaded.get(banner);
  const file = join(ASSETS, `${banner}.jpg`);
  const photo = cached ?? (existsSync(file) ? new InputFile(file) : null);

  if (photo) {
    try {
      const sent = await ctx.replyWithPhoto(photo, {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });

      // Берём самый крупный размер: его идентификатор годится для повтора.
      const id = sent.photo.at(-1)?.file_id;
      if (id) uploaded.set(banner, id);
      return;
    } catch {
      // Идентификатор мог протухнуть, файл — испортиться. Пробуем текстом.
      uploaded.delete(banner);
    }
  }

  await ctx.reply(fallbackText, { parse_mode: 'HTML', reply_markup: keyboard });
}
