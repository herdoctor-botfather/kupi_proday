import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { ListingCard } from '../components/ListingCard';
import { formatDate, pluralize } from '../lib/format';
import { haptic } from '../lib/telegram';

/**
 * Публичный профиль пользователя.
 *
 * Отвечает на вопрос, который покупатель задаёт себе перед тем, как
 * написать: «кто это и что он ещё выставил». У случайного человека одно
 * объявление, у перекупщика — сорок одинаковых, и это видно сразу.
 *
 * Рейтинг и отзывы показываются, только если у человека есть анкета
 * специалиста: они существуют лишь там. У обычного продавца их нет,
 * и рисовать пустую пятёрку вместо честного «оценок пока нет» нельзя —
 * иначе рейтинг перестанет что-то значить у всех.
 */
export function SellerPage() {
  const { id = '' } = useParams();

  const profile = useAsync(() => api.publicProfile(id), [id]);
  const sell = useAsync(() => api.listings({ kind: 'SELL', sellerId: id, pageSize: 50 }), [id]);
  const wanted = useAsync(() => api.listings({ kind: 'BUY', sellerId: id, pageSize: 50 }), [id]);

  const reviews = useAsync(() => api.userReviews(id), [id]);
  const wantedItems = wanted.data?.items ?? [];

  return (
    <div className="page">
      <AsyncContent state={profile}>
        {(person) => (
          <>
            <div className="profile__header">
              {person.photoUrl ? (
                <img className="profile__avatar" src={person.photoUrl} alt="" />
              ) : (
                <div className="profile__avatar" />
              )}
              <h1 className="profile__name">{person.name}</h1>
              <div className="profile__headline">На площадке с {formatDate(person.joinedAt)}</div>
            </div>

            {person.specialist ? (
              <Link
                to={`/specialist/${person.specialist.slug}`}
                className="profile-cta"
                onClick={() => haptic.tap()}
              >
                <span className="profile-cta__icon" aria-hidden>
                  🛠
                </span>
                <span className="profile-cta__body">
                  <span className="profile-cta__title">
                    {person.specialist.ratingCount > 0
                      ? `★ ${person.specialist.ratingAvg.toFixed(1)} · ${person.specialist.ratingCount} ${pluralize(person.specialist.ratingCount, ['отзыв', 'отзыва', 'отзывов'])}`
                      : 'Анкета специалиста'}
                  </span>
                  <span className="profile-cta__text">
                    {person.specialist.headline ?? 'Услуги, цены и отзывы'}
                  </span>
                </span>
                <span className="profile-cta__chevron" aria-hidden>
                  ›
                </span>
              </Link>
            ) : null}

            {/*
              Оценка по сделкам. Пока сделок нет, прямо об этом говорим:
              молчание покупатель истолкует как угодно, и обычно не в
              пользу продавца.
            */}
            {reviews.data && reviews.data.ratingCount > 0 ? (
              <>
                <div className="seller-rating">
                  <span className="seller-rating__value">★ {reviews.data.ratingAvg.toFixed(1)}</span>
                  <span className="seller-rating__count">
                    {reviews.data.ratingCount}{' '}
                    {pluralize(reviews.data.ratingCount, ['оценка', 'оценки', 'оценок'])} по сделкам
                  </span>
                </div>

                {reviews.data.items.map((review) => (
                  <div key={review.id} className="review">
                    <div className="review__head">
                      {review.author.photoUrl ? (
                        <img className="review__avatar" src={review.author.photoUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="review__avatar" />
                      )}
                      <div style={{ flex: 1 }}>
                        <div className="review__author">{review.author.name}</div>
                        <div className="review__date">
                          {review.authorRole === 'BUYER' ? 'Купил' : 'Продал'} · {review.listingTitle}
                        </div>
                      </div>
                    </div>
                    <div className="rating" style={{ marginBottom: 4 }}>
                      <span className="rating__star">{'★'.repeat(review.rating)}</span>
                      <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - review.rating)}</span>
                    </div>
                    {review.text && <div style={{ whiteSpace: 'pre-line' }}>{review.text}</div>}
                  </div>
                ))}
              </>
            ) : (
              <p className="form-hint">
                Оценок пока нет: их ставят друг другу после состоявшейся сделки.
              </p>
            )}
          </>
        )}
      </AsyncContent>

      {/*
        Продаёт и ищет — два разных занятия одного человека, и пустота
        в одном не повод объявлять пустым весь профиль. «Объявлений нет»
        над списком из пяти запросов на покупку — прямая неправда.
      */}
      <AsyncContent state={sell}>
        {(page) =>
          page.items.length === 0 ? null : (
            <>
              <div className="section-title">
                {page.total} {pluralize(page.total, ['объявление', 'объявления', 'объявлений'])}
              </div>
              <div className="listing-grid">
                {page.items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            </>
          )
        }
      </AsyncContent>

      {wantedItems.length > 0 && (
        <>
          <div className="section-title">Ищет</div>
          <div className="listing-grid">
            {wantedItems.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </>
      )}

      {sell.data?.items.length === 0 && wantedItems.length === 0 && !wanted.loading && (
        <EmptyState
          icon="📦"
          title="Объявлений нет"
          hint="Здесь появятся товары и запросы этого человека"
        />
      )}
    </div>
  );
}
