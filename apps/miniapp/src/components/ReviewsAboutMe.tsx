import { useState } from 'react';
import type { Review } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from './states';
import { formatDate } from '../lib/format';
import { haptic } from '../lib/telegram';

/**
 * Отзывы о специалисте в его собственном кабинете — с возможностью ответить.
 *
 * Ответ доступен только на опубликованные отзывы: отвечать на то, чего ещё
 * никто не видел, незачем, а отклонённое и вовсе не появится в каталоге.
 */
export function ReviewsAboutMe({ specialistId }: { specialistId: string }) {
  const state = useAsync(() => api.reviews(specialistId), [specialistId]);

  return (
    <AsyncContent state={state}>
      {(page) =>
        page.items.length === 0 ? (
          <EmptyState
            icon="💬"
            title="Отзывов пока нет"
            hint="Они появятся, когда клиенты оценят вашу работу"
          />
        ) : (
          <div>
            {page.items.map((review) => (
              <ReviewWithReply key={review.id} review={review} onChanged={() => state.reload()} />
            ))}
          </div>
        )
      }
    </AsyncContent>
  );
}

function ReviewWithReply({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.reply?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.replyToReview(review.id, text);
      haptic.success();
      setEditing(false);
      onChanged();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось сохранить ответ');
    } finally {
      setBusy(false);
    }
  };

  const author = [review.author.firstName, review.author.lastName].filter(Boolean).join(' ');

  return (
    <div className="review">
      <div className="review__head">
        {review.author.photoUrl ? (
          <img className="review__avatar" src={review.author.photoUrl} alt="" loading="lazy" />
        ) : (
          <div className="review__avatar" />
        )}
        <div style={{ flex: 1 }}>
          <div className="review__author">{author}</div>
          <div className="review__date">{formatDate(review.createdAt)}</div>
        </div>
        <div className="rating">
          <span className="rating__star">{'★'.repeat(review.rating)}</span>
          <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - review.rating)}</span>
        </div>
      </div>

      {review.text && <div style={{ whiteSpace: 'pre-line' }}>{review.text}</div>}

      {review.reply && !editing && (
        <div className="review__reply">
          <div className="review__reply-label">Ваш ответ</div>
          <div style={{ whiteSpace: 'pre-line' }}>{review.reply.text}</div>
        </div>
      )}

      <div className="reply-box">
        {editing ? (
          <div className="reply-box__form">
            <textarea
              className="form-input form-textarea"
              style={{ minHeight: 80 }}
              value={text}
              maxLength={1000}
              onChange={(event) => setText(event.target.value)}
              placeholder="Спокойный ответ по существу убеждает лучше, чем спор"
            />
            {error && <div className="field__error">{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="button button--secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setEditing(false);
                  setText(review.reply?.text ?? '');
                }}
              >
                Отмена
              </button>
              <button type="button" className="button" style={{ flex: 1 }} onClick={save} disabled={busy}>
                {busy ? 'Сохраняем...' : text.trim() ? 'Ответить' : 'Удалить ответ'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="report-trigger" onClick={() => setEditing(true)}>
            {review.reply ? '✏️ Изменить ответ' : '💬 Ответить'}
          </button>
        )}
      </div>
    </div>
  );
}
