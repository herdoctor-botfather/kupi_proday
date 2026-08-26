import { Link } from 'react-router-dom';
import type { SpecialistListItem } from '@app/shared';
import { Rating } from './Rating';
import { formatDistance } from '../lib/format';
import { haptic } from '../lib/telegram';
import { categoryStyle } from '../lib/category-colors';
import { FavoriteButton } from './FavoriteButton';

export function SpecialistCard({ specialist }: { specialist: SpecialistListItem }) {
  const distance = formatDistance(specialist.distanceKm);
  const category = specialist.categories[0];

  return (
    <Link to={`/specialist/${specialist.slug}`} className="card" onClick={() => haptic.tap()}>
      {specialist.photoUrl ? (
        <img className="card__avatar" src={specialist.photoUrl} alt="" loading="lazy" />
      ) : (
        <div className="card__avatar" aria-hidden>
          {specialist.displayName.charAt(0)}
        </div>
      )}

      <div className="card__body">
        <div className="card__name">
          <span className="card__name-text">{specialist.displayName}</span>
          {specialist.isPromoted && <span className="badge-promoted">Топ</span>}
          <FavoriteButton specialistId={specialist.id} initial={specialist.isFavorite ?? false} />
        </div>

        {specialist.headline && <div className="card__headline">{specialist.headline}</div>}

        <div className="card__meta">
          <Rating value={specialist.ratingAvg} count={specialist.ratingCount} />
        </div>

        <div className="card__meta">
          {category && (
            <span className="tag" style={categoryStyle(category.slug)}>
              {category.icon} {category.name}
            </span>
          )}
          <span className="card__headline">
            {specialist.city}
            {distance && ` · ${distance}`}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Заглушка на время загрузки — список не должен «прыгать». */
export function SpecialistCardSkeleton() {
  return <div className="skeleton" style={{ height: 96 }} />;
}
