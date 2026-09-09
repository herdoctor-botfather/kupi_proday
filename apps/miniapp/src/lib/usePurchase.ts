import { useState } from 'react';
import type { CreateInvoiceDto } from '@app/shared';
import { api } from './api';
import { haptic, openInvoice } from './telegram';

export type PurchaseState = 'idle' | 'opening' | 'waiting' | 'done' | 'cancelled' | 'error';

/**
 * Покупка звёздами: счёт, окно оплаты, ожидание выдачи.
 *
 * Между «Telegram принял деньги» и «сервер выдал купленное» проходит
 * секунда-другая: подтверждение идёт к боту отдельным сообщением, а уже
 * бот сообщает серверу. Поэтому экран не рисует покупку сразу по ответу
 * Telegram, а спрашивает сервер, появилось ли купленное, — иначе человек
 * увидел бы то, чего на сервере ещё нет.
 *
 * @param confirmGranted перечитывает состояние и отвечает, выдано ли уже.
 */
export function usePurchase(confirmGranted: () => Promise<boolean>) {
  const [state, setState] = useState<PurchaseState>('idle');
  const [error, setError] = useState<string | null>(null);

  const buy = async (dto: CreateInvoiceDto) => {
    setError(null);
    setState('opening');
    haptic.tap();

    try {
      const { url } = await api.createInvoice(dto);
      const status = await openInvoice(url);

      if (status === 'cancelled') {
        setState('cancelled');
        return;
      }

      if (status !== 'paid') {
        setState('error');
        setError(
          status === 'pending'
            ? 'Платёж ещё обрабатывается. Загляните сюда через минуту.'
            : 'Оплатить не получилось. Попробуйте ещё раз.',
        );
        return;
      }

      setState('waiting');
      const granted = await waitForGrant(confirmGranted);
      if (granted) {
        haptic.success();
        setState('done');
        return;
      }

      // Деньги списаны, выдача задержалась. Пугать человека нельзя —
      // платёж записан и виден администратору, — но и делать вид, что
      // всё готово, тоже нельзя.
      setState('error');
      setError('Оплата прошла, но выдача задерживается. Она появится сама в течение нескольких минут.');
    } catch (err) {
      haptic.error();
      setState('error');
      setError(err instanceof Error ? err.message : 'Не удалось оформить оплату');
    }
  };

  return { state, error, buy, busy: state === 'opening' || state === 'waiting' };
}

/**
 * Спрашивает сервер с нарастающей паузой.
 *
 * Ровный опрос раз в секунду одинаково плох с обеих сторон: обычно
 * подтверждение приходит почти сразу, и частые запросы не нужны, а если
 * оно задержалось — секунды всё равно не хватит.
 */
async function waitForGrant(confirmGranted: () => Promise<boolean>): Promise<boolean> {
  for (const pause of [500, 1000, 2000, 3000, 5000]) {
    await new Promise((resolve) => setTimeout(resolve, pause));
    try {
      if (await confirmGranted()) return true;
    } catch {
      // Сеть моргнула — пробуем ещё раз, попыток хватает.
    }
  }
  return false;
}
