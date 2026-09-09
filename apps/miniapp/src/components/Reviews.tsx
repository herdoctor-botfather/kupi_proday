import { useState } from 'react';
import { REVIEW_TEXT_MAX, type Review } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Stars } from './Rating';
import { AsyncContent, EmptyState } from './states';
import { formatDate } from '../lib/format';
import { haptic } from '../lib/telegram';
import { ReportButton } from './ReportButton';

const STATUS_LABEL: Record<Review['status'], string> = {
  PENDING: 'На проверке',
  APPROVED: 'Опубликован',
  REJECTED: 'Отклонён',
};

/** Форма отзыва. Повторная отправка перезаписывает свой прежний отзыв. */
export function ReviewForm({
  specialistId,
  existing,
  onSaved,
}: {
  specialistId: string;
  existing: Review | null;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /*
   * Форма раскрыта только у того, кто ещё не оценивал.
   *
   * Раньше она разворачивалась всегда и подставляла в поля уже
   * оставленный отзыв. Человек, зашедший посмотреть карточку, видел
   * открытую форму со своим текстом — будто площадка требует от него
   * оценить ещё раз, а прежняя оценка не сохранилась. Теперь при
   * наличии отзыва показывается он сам, а форма открывается по просьбе.
   */
  const [editing, setEditing] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rating === 0) {
      setError('Поставьте оценку');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.createReview(specialistId, { rating, text: text.trim() || null });
      haptic.success();
      setDone(true);
      onSaved();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось отправить отзыв');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="state" style={{ padding: '24px 0' }}>
        <div className="state__icon">✅</div>
        <div style={{ color: 'var(--text)' }}>Спасибо! Отзыв отправлен на модерацию.</div>
      </div>
    );
  }

  if (existing && !editing) {
    return (
      <div className="my-review">
        <div className="my-review__head">
          <span className="my-review__label">Ваш отзыв</span>
          <span className="my-review__status">{STATUS_LABEL[existing.status]}</span>
        </div>

        {/* Те же звёзды, что и в карточке отзыва: своя оценка не должна
            выглядеть иначе, чем чужая. */}
        <div className="rating">
          <span className="rating__star">{'★'.repeat(existing.rating)}</span>
          <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - existing.rating)}</span>
        </div>

        {existing.text && <p className="my-review__text">{existing.text}</p>}

        {existing.status === 'REJECTED' && existing.moderationNote && (
          <p className="my-review__note">Причина отклонения: {existing.moderationNote}</p>
        )}

        <button
          type="button"
          className="button button--secondary"
          style={{ marginTop: 12 }}
          onClick={() => setEditing(true)}
        >
          Изменить отзыв
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ margin: '8px 0 20px' }}>
      {existing && (
        <div style={{ fontSize: 13, color: 'var(--text-hint)', marginBottom: 8 }}>
          Новый отзыв заменит прежний и снова уйдёт на проверку.
        </div>
      )}

      <Stars value={rating} onChange={setRating} />

      <textarea
        className="textarea"
        style={{ marginTop: 12 }}
        value={text}
        maxLength={REVIEW_TEXT_MAX}
        placeholder="Расскажите, как всё прошло. Это поможет другим."
        onChange={(event) => setText(event.target.value)}
      />

      {error && <div style={{ color: 'var(--destructive)', fontSize: 13, marginTop: 8 }}>{error}</div>}

      <button type="submit" className="button" style={{ marginTop: 12 }} disabled={saving}>
        {saving ? 'Отправляем...' : existing ? 'Обновить отзыв' : 'Оставить отзыв'}
      </button>
    </form>
  );
}

/** Опубликованные отзывы. version меняется после отправки своего — список перезагружается. */
export function ReviewList({ specialistId, version }: { specialistId: string; version: number }) {
  const state = useAsync(() => api.reviews(specialistId), [specialistId, version]);

  return (
    <AsyncContent state={state}>
      {(page) =>
        page.items.length === 0 ? (
          <EmptyState icon="💬" title="Отзывов пока нет" hint="Станьте первым, кто оставит отзыв" />
        ) : (
          <div>
            {page.items.map((review) => (
              <ReviewCard key={review.id} review={review} canReport />
            ))}
          </div>
        )
      }
    </AsyncContent>
  );
}

export function ReviewCard({
  review,
  showStatus = false,
  canReport = false,
}: {
  review: Review;
  showStatus?: boolean;
  canReport?: boolean;
}) {
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
        {showStatus && <span className="review__status">{STATUS_LABEL[review.status]}</span>}
      </div>

      <div className="rating" style={{ marginBottom: 4 }}>
        <span className="rating__star">{'★'.repeat(review.rating)}</span>
        <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - review.rating)}</span>
      </div>

      {review.text && <div style={{ whiteSpace: 'pre-line' }}>{review.text}</div>}

      {review.reply && (
        <div className="review__reply">
          <div className="review__reply-label">Ответ специалиста</div>
          <div style={{ whiteSpace: 'pre-line' }}>{review.reply.text}</div>
        </div>
      )}

      {review.status === 'REJECTED' && review.moderationNote && (
        <div style={{ color: 'var(--destructive)', fontSize: 13, marginTop: 6 }}>
          Отклонён: {review.moderationNote}
        </div>
      )}

      {canReport && (
        <div style={{ marginTop: 8 }}>
          <ReportButton target="REVIEW" targetId={review.id} label="Пожаловаться на отзыв" />
        </div>
      )}
    </div>
  );
}
