import { useState } from 'react';
import type { Review } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../lib/format';

/**
 * Очередь модерации. Отзывы идут от старых к новым, чтобы очередь
 * не застаивалась: свежие всегда видно, а забытые всплывут первыми.
 */
export function ReviewsPage() {
  const [page, setPage] = useState(1);
  const queue = useAsync(() => api.pendingReviews(page), [page]);
  const [rejecting, setRejecting] = useState<Review | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async (review: Review) => {
    setBusyId(review.id);
    setError(null);
    try {
      await api.moderateReview(review.id, { action: 'approve' });
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось одобрить отзыв');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (review: Review, note: string) => {
    setBusyId(review.id);
    setError(null);
    try {
      await api.moderateReview(review.id, { action: 'reject', note });
      setRejecting(null);
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отклонить отзыв');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Модерация отзывов</h1>
          <p>Отзыв не влияет на рейтинг специалиста, пока не одобрен</p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <AsyncContent state={queue}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState icon="✅" title="Очередь пуста" hint="Все отзывы проверены" />
          ) : (
            <>
              <p className="cell-muted" style={{ marginTop: 0 }}>
                Ожидают проверки: {data.total}
              </p>

              {data.items.map((review) => (
                <div key={review.id} className="review-card">
                  <div className="review-card__head">
                    {review.author.photoUrl ? (
                      <img className="review-card__avatar" src={review.author.photoUrl} alt="" />
                    ) : (
                      <div className="review-card__avatar" />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        {[review.author.firstName, review.author.lastName].filter(Boolean).join(' ')}
                      </div>
                      <div className="cell-muted">{formatDateTime(review.createdAt)}</div>
                    </div>
                    <div className="stars" style={{ fontSize: 17 }}>
                      {'★'.repeat(review.rating)}
                      <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - review.rating)}</span>
                    </div>
                  </div>

                  {review.text ? (
                    <div className="review-card__text">{review.text}</div>
                  ) : (
                    <div className="cell-muted" style={{ marginBottom: 14 }}>
                      Без текста — только оценка
                    </div>
                  )}

                  <div className="review-card__actions">
                    <button
                      type="button"
                      className="button button--success"
                      onClick={() => approve(review)}
                      disabled={busyId === review.id}
                    >
                      Одобрить
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => setRejecting(review)}
                      disabled={busyId === review.id}
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}

              {(page > 1 || data.hasMore) && (
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Назад
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!data.hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Вперёд →
                  </button>
                </div>
              )}
            </>
          )
        }
      </AsyncContent>

      {rejecting && (
        <RejectDialog
          review={rejecting}
          busy={busyId === rejecting.id}
          onCancel={() => setRejecting(null)}
          onConfirm={(note) => reject(rejecting, note)}
        />
      )}
    </>
  );
}

/** Причина отклонения обязательна: её увидит автор отзыва в личном кабинете. */
function RejectDialog({
  review,
  busy,
  onCancel,
  onConfirm,
}: {
  review: Review;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  const PRESETS = [
    'Персональные данные третьих лиц',
    'Оскорбления или нецензурная лексика',
    'Реклама или сторонние ссылки',
    'Нет признаков реального обращения к специалисту',
  ];

  return (
    <Modal
      title="Отклонить отзыв"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={busy || !note.trim()}
            onClick={() => onConfirm(note.trim())}
          >
            {busy ? 'Отклоняем...' : 'Отклонить'}
          </button>
        </>
      }
    >
      <p className="cell-muted" style={{ marginTop: 0 }}>
        Оценка {review.rating} из 5. Причина будет показана автору отзыва, поэтому формулируйте так,
        чтобы он понял, что исправить.
      </p>

      <div className="field">
        <label className="field__label" htmlFor="reject-note">
          Причина
        </label>
        <textarea
          id="reject-note"
          className="textarea"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Например: в тексте указан телефон другого человека"
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="button button--secondary button--sm"
            onClick={() => setNote(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
    </Modal>
  );
}
