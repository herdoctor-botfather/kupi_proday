import { useState } from 'react';
import { REPORT_REASONS, createReportSchema, type ReportTarget } from '@app/shared';
import { api } from '../lib/api';
import { useIsAuthenticated } from '../lib/auth';
import { haptic } from '../lib/telegram';

/**
 * Кнопка «пожаловаться» с выбором причины.
 *
 * Причина выбирается из списка, а не пишется свободно: так жалобы можно
 * группировать, а человеку не приходится формулировать претензию под
 * давлением. Свободное поле остаётся для варианта «Другое».
 */
export function ReportButton({
  target,
  targetId,
  label = 'Пожаловаться',
}: {
  target: ReportTarget;
  targetId: string;
  label?: string;
}) {
  const isAuthenticated = useIsAuthenticated();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!isAuthenticated) return null;

  if (done) {
    return <div className="report-done">Спасибо, мы разберёмся</div>;
  }

  const submit = async () => {
    setError(null);

    const parsed = createReportSchema.safeParse({
      target,
      targetId,
      reason,
      comment: comment.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверьте поля');
      return;
    }

    setBusy(true);
    try {
      await api.createReport(parsed.data);
      haptic.success();
      setOpen(false);
      setDone(true);
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="report-trigger" onClick={() => setOpen(true)}>
        ⚑ {label}
      </button>
    );
  }

  return (
    <div className="report-form">
      <div className="report-form__title">Что не так?</div>

      <div className="report-form__reasons">
        {REPORT_REASONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${reason === option ? ' chip--active' : ''}`}
            onClick={() => setReason(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <textarea
        className="form-input form-textarea"
        style={{ minHeight: 70 }}
        value={comment}
        maxLength={1000}
        onChange={(event) => setComment(event.target.value)}
        placeholder={reason === 'Другое' ? 'Опишите, что не так' : 'Подробности (необязательно)'}
      />

      {error && <div className="field__error">{error}</div>}

      <div className="report-form__actions">
        <button type="button" className="button button--secondary" onClick={() => setOpen(false)}>
          Отмена
        </button>
        <button type="button" className="button" onClick={submit} disabled={busy}>
          {busy ? 'Отправляем...' : 'Отправить'}
        </button>
      </div>
    </div>
  );
}
