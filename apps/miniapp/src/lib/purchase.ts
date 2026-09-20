import type { CreateInvoiceDto } from '@app/shared';
import { api } from './api';
import { openInvoice } from './telegram';

/**
 * Платное действие одним движением.
 *
 * Раньше платное бралось только с внутреннего счёта, а пополнить его
 * можно было от полусотни звёзд: человек, желавший картинку за десять,
 * упирался в «сначала пополните кошелёк» — ступень, которой он не просил.
 *
 * Теперь действие выполняется сразу: у кого есть запас на счету, для
 * того ничего не изменилось. Если звёзд не хватило, выставляем счёт
 * ровно на недостающее и, как только он оплачен, повторяем действие —
 * человек видит привычное «нажал, заплатил, получил».
 *
 * Кошелёк никуда не делся: он остаётся для тех, кому удобно держать
 * запас заранее, и для возвратов с кешбэком.
 */
export async function withPayment<T>(dto: CreateInvoiceDto, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isNoFunds(error)) throw error;

    const { url } = await api.invoiceForPurchase(dto);
    const status = await openInvoice(url);

    if (status === 'paid') return run();

    throw new Error(
      status === 'cancelled'
        ? 'Оплата отменена'
        : 'Оплата не прошла. Попробуйте ещё раз или напишите в поддержку',
    );
  }
}

/** Денег не хватило — это не поломка, а повод предложить оплату. */
function isNoFunds(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'NO_FUNDS'
  );
}
