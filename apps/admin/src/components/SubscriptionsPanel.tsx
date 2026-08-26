import { useState } from 'react';
import { upsertSubscriptionSchema } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from './states';
import { Modal } from './Modal';
import { formatDate, formatPrice, toDateInput } from '../lib/format';

/** Готовые сроки: администратор выбирает тариф, а не считает даты вручную. */
const PLANS = [
  { key: 'month', label: 'Месяц', months: 1 },
  { key: 'quarter', label: '3 месяца', months: 3 },
  { key: 'year', label: 'Год', months: 12 },
];

/**
 * Отметки об оплате размещения. Платежи проходят мимо приложения —
 * здесь фиксируется только факт и срок, на который карточка продвигается.
 */
export function SubscriptionsPanel({
  specialistId,
  onChanged,
}: {
  specialistId: string;
  onChanged: () => void;
}) {
  const list = useAsync(() => api.subscriptions(specialistId), [specialistId]);
  const [adding, setAdding] = useState(false);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card__body" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Подписки</h2>
          <p className="cell-muted" style={{ margin: 0 }}>
            Оплата принимается вне приложения. Новая запись продлевает срок продвижения,
            если её дата окончания позже текущей.
          </p>
        </div>
        <button type="button" className="button button--secondary button--sm" onClick={() => setAdding(true)}>
          + Отметить оплату
        </button>
      </div>

      <AsyncContent state={list}>
        {(items) =>
          items.length === 0 ? (
            <div className="card__body cell-muted" style={{ paddingTop: 0 }}>
              Оплат ещё не было.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Тариф</th>
                    <th>Период</th>
                    <th>Сумма</th>
                    <th>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const isActive = new Date(row.endsAt) > new Date();
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.plan}{' '}
                          {isActive && <span className="badge badge--success">активна</span>}
                        </td>
                        <td className="cell-muted">
                          {formatDate(row.startsAt)} — {formatDate(row.endsAt)}
                        </td>
                        <td>{formatPrice(row.amount, row.currency)}</td>
                        <td className="cell-muted">{row.note ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </AsyncContent>

      {adding && (
        <AddSubscriptionDialog
          specialistId={specialistId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function AddSubscriptionDialog({
  specialistId,
  onClose,
  onSaved,
}: {
  specialistId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date();
  const [plan, setPlan] = useState(PLANS[0]!);
  const [startsAt, setStartsAt] = useState(toDateInput(today));
  const [endsAt, setEndsAt] = useState(toDateInput(addMonths(today, PLANS[0]!.months)));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Смена тарифа пересчитывает дату окончания от выбранной даты начала. */
  const choosePlan = (key: string) => {
    const next = PLANS.find((p) => p.key === key) ?? PLANS[0]!;
    setPlan(next);
    setEndsAt(toDateInput(addMonths(new Date(startsAt), next.months)));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const parsed = upsertSubscriptionSchema.safeParse({
      plan: plan.key,
      startsAt,
      endsAt,
      // Сумма вводится в рублях, а хранится в копейках.
      amount: amount.trim() ? Math.round(Number(amount) * 100) : null,
      currency: 'RUB',
      note: note.trim() || null,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверьте поля');
      return;
    }

    setSaving(true);
    try {
      await api.addSubscription(specialistId, parsed.data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Отметить оплату"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="button" onClick={submit} disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert--error">{error}</div>}

      <form onSubmit={submit}>
        <div className="field">
          <span className="field__label">Тариф</span>
          <select className="select" value={plan.key} onChange={(event) => choosePlan(event.target.value)}>
            {PLANS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <span className="field__label">Начало</span>
            <input
              className="input"
              type="date"
              value={startsAt}
              onChange={(event) => {
                setStartsAt(event.target.value);
                setEndsAt(toDateInput(addMonths(new Date(event.target.value), plan.months)));
              }}
            />
          </div>
          <div className="field">
            <span className="field__label">Окончание</span>
            <input className="input" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <span className="field__label">Сумма, ₽</span>
          <input
            className="input"
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="необязательно"
          />
          <span className="field__hint">Нужна только для отчётности</span>
        </div>

        <div className="field">
          <span className="field__label">Комментарий</span>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="способ оплаты, номер чека"
          />
        </div>
      </form>
    </Modal>
  );
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
