import type { Bot } from 'grammy';
import { config } from './config';

/**
 * Оплата звёздами со стороны бота.
 *
 * Счёт выставляет API — он знает цену и назначение. Боту достаётся то,
 * что Telegram присылает только ему: запрос на списание и сообщение об
 * успешной оплате. Его задача — передать их серверу и ответить Telegram
 * вовремя.
 *
 * Почему не webhook на API: бот работает длинным опросом, второй
 * получатель обновлений тому же боту не положен. Поэтому бот здесь —
 * не место для логики, а только переносчик.
 */

const HEADERS = {
  'Content-Type': 'application/json',
  'x-internal-secret': config.INTERNAL_API_SECRET,
};

async function callApi<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  if (!config.INTERNAL_API_SECRET) {
    console.error('INTERNAL_API_SECRET не задан — оплата не будет подтверждена');
    return null;
  }

  try {
    const response = await fetch(`${config.API_PROXY_TARGET}/api${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.error(`API ответил ${response.status} на ${path}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`Не достучаться до API по ${path}:`, error);
    return null;
  }
}

export function registerPayments(bot: Bot): void {
  /**
   * Telegram спрашивает разрешение списать деньги и ждёт ответа
   * десять секунд; молчание он трактует как отказ. Поэтому и запас
   * по времени здесь короткий: лучше честно отказать, чем задержать
   * ответ и оставить человека без объяснения.
   */
  bot.on('pre_checkout_query', async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    const result = await callApi<{ ok: boolean }>('/payments/awaiting', { invoicePayload: payload }, 6000);

    if (result?.ok) {
      await ctx.answerPreCheckoutQuery(true);
      return;
    }

    await ctx.answerPreCheckoutQuery(false, {
      error_message: 'Счёт устарел. Откройте приложение и попробуйте ещё раз.',
    });
  });

  /**
   * Деньги уже списаны. Если сервер сейчас недоступен, купленное всё
   * равно не пропадёт: платёж записан в базе как ожидающий, и его видно
   * админу — но человеку нужно сказать правду сразу, а не делать вид,
   * что всё в порядке.
   */
  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;

    const result = await callApi<{ applied: boolean }>(
      '/payments/confirm',
      {
        invoicePayload: payment.invoice_payload,
        telegramChargeId: payment.telegram_payment_charge_id,
        stars: payment.total_amount,
        telegramUserId: String(ctx.from.id),
      },
      15_000,
    );

    if (result) {
      await ctx.reply('Оплата получена, спасибо. Всё, что купили, уже действует.');
      return;
    }

    await ctx.reply(
      'Оплата прошла, но подтвердить её на сервере сейчас не вышло. ' +
        'Мы уже знаем об этом и всё восстановим — напишите, если через час ничего не изменится.',
    );
  });
}
