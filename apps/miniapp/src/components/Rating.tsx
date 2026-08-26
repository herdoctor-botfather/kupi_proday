import { RATING_MAX } from '@app/shared';
import { reviewsLabel } from '../lib/format';

/** Компактный рейтинг для карточек: «4.8 · 12 отзывов». */
export function Rating({ value, count }: { value: number; count: number }) {
  if (count === 0) return <span className="rating__count">Нет отзывов</span>;
  return (
    <span className="rating">
      <span className="rating__star">★</span>
      {value.toFixed(1)}
      <span className="rating__count">· {reviewsLabel(count)}</span>
    </span>
  );
}

/** Крупные звёзды. Без onChange — только отображение. */
export function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange?: (rating: number) => void;
}) {
  const readOnly = !onChange;

  return (
    <div className="stars" role={readOnly ? 'img' : 'radiogroup'} aria-label={`Оценка ${value} из ${RATING_MAX}`}>
      {Array.from({ length: RATING_MAX }, (_, index) => {
        const rating = index + 1;
        const filled = rating <= value;
        const className = `stars__item${filled ? ' stars__item--filled' : ''}`;

        if (readOnly) {
          return (
            <span key={rating} className={className} aria-hidden>
              ★
            </span>
          );
        }
        return (
          <button
            key={rating}
            type="button"
            className={className}
            role="radio"
            aria-checked={rating === value}
            aria-label={`${rating} из ${RATING_MAX}`}
            onClick={() => onChange(rating)}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

/** Разбивка оценок по звёздам в профиле специалиста. */
export function RatingBreakdown({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  if (total === 0) return null;

  return (
    <div className="rating-bars">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = breakdown[String(star)] ?? 0;
        const percent = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={star} className="rating-bar">
            <span>{star} ★</span>
            <span className="rating-bar__track">
              <span className="rating-bar__fill" style={{ width: `${percent}%` }} />
            </span>
            <span>{count}</span>
          </div>
        );
      })}
    </div>
  );
}
