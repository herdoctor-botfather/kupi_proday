import { LAUNCH_FREE_LABEL, isLaunchFree } from '@app/shared';
import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';

/**
 * Рисование картинок прямо в переписке с ботом.
 *
 * Зачем в боте, если есть приложение: описание — это текст, а текст
 * человек пишет в переписке естественнее, чем в поле на экране. К тому же
 * картинка нужна не только для анкеты: её часто хотят просто получить
 * и положить куда-нибудь самому.
 *
 * Состояние — «ждём описание от этого человека» — живёт в памяти
 * процесса. Потерять его при перезапуске не страшно: человек просто
 * нажмёт кнопку заново, а списания не произошло — деньги берутся
 * в момент рисования, а не в момент нажатия.
 */

/** Кто сейчас должен прислать описание. Ключ — id пользователя Telegram. */
const awaiting = new Set<number>();

/**
 * Цена картинки. Та же, что в packages/shared/src/pricing.ts: бот
 * не подключён к общему пакету, поэтому число здесь повторено — и менять
 * его надо в обоих местах, иначе человек увидит одну цену, а спишется
 * другая.
 */
const STARS = 10;

async function ask<T>(path: string, body: unknown): Promise<T | { error: string }> {
  if (!config.INTERNAL_API_SECRET) return { error: 'Рисование не настроено' };

  try {
    const response = await fetch(`${config.API_PROXY_TARGET}/api/internal${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.INTERNAL_API_SECRET,
      },
      body: JSON.stringify(body),
      // Рисование идёт десятки секунд — ждём дольше обычного.
      signal: AbortSignal.timeout(120_000),
    });

    if (response.ok) return (await response.json()) as T;

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return { error: payload?.message ?? 'Не получилось. Попробуйте позже.' };
  } catch {
    return { error: 'Рисовалка не ответила. Звёзды не списаны, попробуйте ещё раз.' };
  }
}

const isError = <T>(value: T | { error: string }): value is { error: string } =>
  typeof value === 'object' && value !== null && 'error' in value;

export function registerDraw(bot: Bot, appUrl: (startParam?: string) => string): void {
  const INVITE =
    `🎨 <b>Нарисовать картинку</b>\n\n` +
    `Напишите, что нарисовать — своими словами, по-русски. Например: ` +
    `«вывеска мастерской по ремонту обуви, тёплый свет, вечер».\n\n` +
    (isLaunchFree()
      ? `Бесплатно до ${LAUNCH_FREE_LABEL} — до трёх картинок в сутки.`
      : `Одна картинка — ${STARS} ★ с баланса.`);

  const inviteExtra = {
    parse_mode: 'HTML' as const,
    reply_markup: new InlineKeyboard().text('Отмена', 'draw:cancel'),
  };

  bot.callbackQuery('draw:start', async (ctx) => {
    awaiting.add(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply(INVITE, inviteExtra);
  });

  bot.callbackQuery('draw:cancel', async (ctx) => {
    awaiting.delete(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Отменено' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  });

  bot.command('draw', async (ctx) => {
    awaiting.add(ctx.from!.id);
    await ctx.reply(INVITE, inviteExtra);
  });

  /**
   * Описание приходит обычным сообщением. Обработчик стоит до общей
   * заглушки «вернитесь к кнопкам», иначе она перехватила бы текст
   * и человек получил бы совет вместо картинки.
   */
  bot.on('message:text', async (ctx, next) => {
    if (!awaiting.has(ctx.from.id)) return next();
    awaiting.delete(ctx.from.id);

    const prompt = ctx.message.text.trim();
    const waiting = await ctx.reply('Рисую, это займёт около минуты...');

    const drawn = await ask<{ id: string; url: string }>('/draw', {
      telegramId: String(ctx.from.id),
      prompt,
    });

    await ctx.api.deleteMessage(ctx.chat.id, waiting.message_id).catch(() => {});

    if (isError(drawn)) {
      await ctx.reply(drawn.error, {
        reply_markup: new InlineKeyboard()
          .text('Попробовать снова', 'draw:start')
          .row()
          .text('В кабинет', 'cab:open'),
      });
      return;
    }

    // Картинку отдаём файлом, а не ссылкой: ссылку надо открывать,
    // а картинку видно сразу — ради этого её и рисовали.
    await ctx.replyWithPhoto(drawn.url, {
      caption: isLaunchFree()
        ? `Готово, бесплатно\n\n«${prompt}»`
        : `Готово. Списано ${STARS} ★\n\n«${prompt}»`,
      reply_markup: new InlineKeyboard()
        .text('Нарисовать ещё', 'draw:start')
        .row()
        .webApp('Поставить в анкету', appUrl('apply')),
    });
  });
}
