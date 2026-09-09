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
            ) : (
              /*
                Прямо говорим, что оценок нет, вместо того чтобы молчать:
                молчание покупатель истолкует как угодно, и обычно не в
                пользу продавца.
              */
              <p className="form-hint">
                Отзывов пока нет: их оставляют специалистам, а этот человек просто продаёт вещи.
              </p>
            )}
          </>
        )}
      </AsyncContent>

      <AsyncContent state={sell}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState icon="📦" title="Объявлений нет" hint="Здесь появятся товары этого человека" />
          ) : (
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
    </div>
  );
}
