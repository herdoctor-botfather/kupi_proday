import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ReportRow } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../lib/format';

/**
 * Жалобы пользователей.
 *
 * Жалоба сама по себе ничего не меняет: карточка остаётся в каталоге,
 * отзыв — на месте. Автоматическое скрытие по числу жалоб превратило бы
 * их в оружие против конкурентов, поэтому решение всегда за человеком.
 */
export function ReportsPage() {
  const queue = useAsync(() => api.reports(), []);
  const [resolving, setResolving] = useState<{ report: ReportRow; action: 'resolve' | 'dismiss' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (report: ReportRow, action: 'resolve' | 'dismiss', note: string) => {
    setBusyId(report.id);
    setError(null);
    try {
      await api.resolveReport(report.id, { action, note: note.trim() || undefined });
      setResolving(null);
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Жалобы</h1>
          <p>Обращения пользователей на карточки и отзывы. Решение принимает человек</p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <AsyncContent state={queue}>
        {(reports) =>
          reports.length === 0 ? (
            <EmptyState icon="✅" title="Жалоб нет" hint="Всё разобрано" />
          ) : (
            reports.map((report) => (
              <div key={report.id} className="review-card">
                <div className="review-card__head">
                  <div style={{ flex: 1 }}>
                    <span className="badge badge--danger">{report.reason}</span>
                    <div style={{ fontWeight: 620, marginTop: 6 }}>
                      {report.target === 'SPECIALIST' ? 'Жалоба на анкету' : 'Жалоба на отзыв'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="cell-muted">{formatDateTime(report.createdAt)}</div>
                    <div className="cell-muted">
                      от {report.reporter.username ? `@${report.reporter.username}` : report.reporter.firstName}
                    </div>
                  </div>
                </div>

                {report.comment && <div className="review-card__text">{report.comment}</div>}

                <div className="card" style={{ marginBottom: 14 }}>
                  <div className="card__body">
                    {report.specialist ? (
                      <>
                        <div className="cell-muted" style={{ marginBottom: 4 }}>
                          На кого жалуются
                        </div>
                        <Link to={`/specialists/${report.specialist.id}`} className="cell-primary">
                          {report.specialist.displayName}
                        </Link>
                        <span className="cell-muted"> · {report.specialist.city}</span>
                      </>
                    ) : report.review ? (
                      <>
                        <div className="cell-muted" style={{ marginBottom: 4 }}>
                          Отзыв о специалисте «{report.review.specialist.displayName}», оценка{' '}
                          {report.review.rating} из 5
                        </div>
                        <div>{report.review.text ?? <span className="cell-muted">без текста</span>}</div>
                      </>
                    ) : (
                      <span className="cell-muted">Объект жалобы удалён</span>
                    )}
                  </div>
                </div>

                <div className="review-card__actions">
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => setResolving({ report, action: 'resolve' })}
                    disabled={busyId === report.id}
                  >
                    Нарушение подтверждено
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setResolving({ report, action: 'dismiss' })}
                    disabled={busyId === report.id}
                  >
                    Отклонить жалобу
                  </button>
                </div>
              </div>
            ))
          )
        }
      </AsyncContent>

      {resolving && (
        <ResolveDialog
          action={resolving.action}
          target={resolving.report.target}
          busy={busyId === resolving.report.id}
          onCancel={() => setResolving(null)}
          onConfirm={(note) => apply(resolving.report, resolving.action, note)}
        />
      )}
    </>
  );
}

function ResolveDialog({
  action,
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  action: 'resolve' | 'dismiss';
  target: ReportRow['target'];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const confirming = action === 'resolve';

  return (
    <Modal
      title={confirming ? 'Подтвердить нарушение' : 'Отклонить жалобу'}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className={confirming ? 'button button--danger' : 'button'}
            onClick={() => onConfirm(note)}
            disabled={busy}
          >
            {busy ? 'Сохраняем...' : 'Готово'}
          </button>
        </>
      }
    >
      <p className="cell-muted" style={{ marginTop: 0 }}>
        {confirming ? (
          <>
            Жалоба закроется как обоснованная. Само нарушение это не устранит — карточку нужно скрыть
            или заблокировать{target === 'REVIEW' ? ', а отзыв отклонить' : ''} отдельно, в своём разделе.
            Так сделано намеренно: решение о санкции должно быть осознанным действием.
          </>
        ) : (
          'Жалоба закроется как необоснованная. Объект останется без изменений.'
        )}
      </p>

      <div className="field">
        <label className="field__label" htmlFor="resolution-note">
          Комментарий для журнала
        </label>
        <textarea
          id="resolution-note"
          className="textarea"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Необязательно, но помогает при разборе спорных случаев"
        />
      </div>
    </Modal>
  );
}
