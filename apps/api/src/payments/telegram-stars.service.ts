import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { STARS_CURRENCY } from '@app/shared';
import { config } from '../config';

/**
 * Обращения к Telegram по поводу денег.
 *
 * Счёт выставляет сервер, а не бот: цену и назначение платежа знает
 * только он, и передавать их боту, чтобы тот вернул их обратно, значило бы
 * умножать места, где цену можно подменить.
 *
 * Ответ Telegram на неудачу — это HTTP 200 с полем ok: false, поэтому
 * проверять только код ответа недостаточно.
 */
@Injectable()
export class TelegramStarsService {
  private readonly logger = new Logger(TelegramStarsService.name);
  private readonly apiUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

  /**
   * Ссылка на счёт. Приложение открывает её через Telegram.WebApp.openInvoice.
   *
   * У звёзд нет платёжного провайдера, поэтому provider_token не передаётся,
   * а валюта всегда XTR. Сумма указывается прямо в звёздах — в отличие от
   * обычных валют, здесь нет копеек и умножать на сто не нужно.
   */
  async createInvoiceLink(input: {
    title: string;
    description: string;
    payload: string;
    stars: number;
  }): Promise<string> {
    const response = await this.call<string>('createInvoiceLink', {
      title: input.title,
      description: input.description,
      payload: input.payload,
      currency: STARS_CURRENCY,
      prices: [{ label: input.title, amount: input.stars }],
    });

    return response;
  }

  /**
   * Возврат звёзд. Telegram возвращает их покупателю целиком, частичный
   * возврат не предусмотрен, поэтому и у нас его нет.
   */
  async refund(telegramUserId: string, telegramChargeId: string): Promise<void> {
    await this.call('refundStarPayment', {
      user_id: Number(telegramUserId),
      telegram_payment_charge_id: telegramChargeId,
    });
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // Без ограничения запрос может висеть минутами, а на том конце
        // человек ждёт кнопку оплаты.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(`${method}: сеть недоступна — ${String(error)}`);
      throw new ServiceUnavailableException('Telegram сейчас недоступен, попробуйте позже');
    }

    const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      this.logger.error(`${method}: Telegram отказал — ${data.description ?? 'без объяснения'}`);
      throw new ServiceUnavailableException('Не удалось выставить счёт, попробуйте позже');
    }

    return data.result as T;
  }
}
