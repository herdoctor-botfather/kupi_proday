import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';

/**
 * Ответ мастера на заявку прямо в переписке с ботом.
 *
 * Заявка живёт полчаса. Если бы принять её можно было только в приложении,
 * половина срока уходила бы на «открыть, дождаться, найти» — и заказчик
 * успевал бы уйти к другому. Кнопка под уведомлением отвечает за секунду.
 *
 * Решает всё равно сервер: бот передаёт нажатие и того, кто нажал, а
 * правила — чья это заявка, не сгорела ли она, был ли уже ответ — живут
 * в одном месте.
 */

async function respond(
  telegramId: number,
  requestId: string,
  action: 'accept' | 'decline',
): Promise<{ status: string } | { error: string }> {
  if (!config.INTERNAL_API_SECRET) return { error: 'Заявки не настроены' };

  try {
    const response = await fetch(`${config.API_PROXY_TARGET}/api/internal/service-request/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ telegramId: String(telegramId), requestId, action }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return (await response.json()) as { status: string };

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return { error: payload?.message ?? 'Не получилось. Попробуйте позже.' };
  } catch {
    return { error: 'Сервер не отвечает. Попробуйте через минуту.' };
  }
}

export function registerServiceRequests(bot: Bot, appUrl: (startParam?: string) => string): void {
  bot.callbackQuery(/^req:(accept|decline):(.+)$/, async (ctx) => {
    const action = ctx.match[1] as 'accept' | 'decline';
    const requestId = ctx.match[2];

    const result = await respond(ctx.from.id, requestId, action);

    if ('error' in result) {
      await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
      // Сгоревшую заявку убираем из-под сообщения: кнопка, которая больше
      // ничего не делает, выглядит как поломка.
      if (/сгорела/i.test(result.error)) {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      }
      return;
    }

    const accepted = result.status === 'ACCEPTED';

    await ctx.answerCallbackQuery({
      text: accepted ? 'Заявка принята — переписка открыта' : 'Вы отказались от заявки',
    });

    // Заменяем кнопки решением: в переписке остаётся видно, чем кончилось,
    // и нажать второй раз уже нечего.
    await ctx
      .editMessageReplyMarkup({
        reply_markup: accepted
          ? new InlineKeyboard().webApp('💬 Открыть переписку', appUrl('chats'))
          : undefined,
      })
      .catch(() => {});

    await ctx
      .reply(
        accepted
          ? '✅ Заявка принята. Заказчик уже получил уведомление — ответьте ему в приложении.'
          : '✖️ Заявка отклонена. Заказчику сообщили, он поищет другого мастера.',
      )
      .catch(() => {});
  });
}
