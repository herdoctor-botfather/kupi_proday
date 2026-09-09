import { Link } from 'react-router-dom';
import type { ListingListItem } from '@app/shared';
import { formatPrice } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';
import { haptic } from '../lib/telegram';

/** Карточка товара для витрины и ленты на главной. */
export function ListingCard({ listing }: { listing: ListingListItem }) {
  const category = listing.categories[0];

  return (
    <Link to={`/listing/${listing.slug}`} className="listing-card" onClick={() => haptic.tap()}>
      {/* Без фотографии карточка берёт цвет и значок своей категории:
          сетка из одинаковых серых квадратов читается как ошибка
          загрузки, а не как витрина. */}
      <div
        className={`listing-card__photo${listing.coverUrl ? '' : ' listing-card__photo--tinted'}`}
        style={!listing.coverUrl && category ? categoryStyle(category.slug) : undefined}
      >
        {listing.coverUrl ? (
          <img src={listing.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="listing-card__no-photo" aria-hidden>
            {category?.icon ?? '📦'}
          </span>
        )}
      </div>

      {/* У запроса цена — потолок, который назвал покупатель, а не ценник.
          Без приставки «до» две витрины читались бы одинаково. */}
      <div className="listing-card__price">
        {listing.kind === 'BUY' && <span className="listing-card__negotiable">до</span>}
        {formatPrice(listing.priceAmount, listing.currency)}
        {listing.isNegotiable && <span className="listing-card__negotiable">торг</span>}
        {/* Готовность к обмену — на карточке пометкой, а не текстом:
            в списке её замечают, а строку «обменяю на…» читать некогда. */}
        {listing.exchangeFor && <span className="listing-card__exchange">обмен</span>}
      </div>
      <div className="listing-card__title">{listing.title}</div>
      <div className="listing-card__meta">
        {category && (
          <span className="tag" style={categoryStyle(category.slug)}>
            {category.icon}
          </span>
        )}
        {listing.city}
      </div>
    </Link>
  );
}
