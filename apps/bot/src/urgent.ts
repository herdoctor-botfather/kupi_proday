import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';

/**
 * «Беру» прямо в переписке с ботом.
 *
 * Вызов срочный: когда прорвало трубу, заказчик ждёт не час, а минуты.
 * Путь «открыть приложение — найти экран — нажать» съедает как раз их,
 * поэтому согласие принимается одним нажатием под уведомлением.
 *
 * Побеждает первый нажавший. Остальным бот говорит об этом прямо — это
 * не вежливость, а избавление от поездки к занятому заказу.
 */
async function take(telegramId: number, id: string): Promise<{ ok: true } | { error: string }> {
  if (!config.INTERNAL_API_SECRET) return { error: 'Срочные вызовы не настроены' };

  try {
    const response = await fetch(`${config.API_PROXY_TARGET}/api/internal/urgent/take`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ telegramId: String(telegramId), requestId: id }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { ok: true };

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return { error: payload?.message ?? 'Не получилось взять вызов' };
  } catch {
    return { error: 'Сервер не отвечает. Попробуйте через минуту.' };
  }
}

export function registerUrgent(bot: Bot, appUrl: (startParam?: string) => string): void {
  bot.callbackQuery(/^urg:take:(.+)$/, async (ctx) => {
    const result = await take(ctx.from.id, ctx.match[1]);

    if ('error' in result) {
      await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
      // Кнопку убираем: вызов уже не взять, и оставлять её значит
      // предлагать нажать ещё раз с тем же исходом.
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Вызов ваш — переписка открыта' });
    await ctx
      .editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().webApp('💬 Открыть переписку', appUrl('chats')),
      })
      .catch(() => {});
  });
}
