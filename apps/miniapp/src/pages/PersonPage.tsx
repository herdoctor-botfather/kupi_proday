import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SpecialistDetail } from '@app/shared';
import { api, type PublicProfile } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState } from '../components/states';
import { Rating, RatingBreakdown } from '../components/Rating';
import { ReviewForm, ReviewList } from '../components/Reviews';
import { ServiceRequestAction } from '../components/ServiceRequestAction';
import { PersonListings } from '../components/PersonListings';
import { FavoriteButton } from '../components/FavoriteButton';
import { ReportButton } from '../components/ReportButton';
import { ShareButton } from '../components/ShareButton';
import { formatDate, formatDistance, formatPrice, pluralize } from '../lib/format';
import { useIsAuthenticated } from '../lib/auth';
import { haptic } from '../lib/telegram';

/**
 * Страница человека — одна для всех входов.
 *
 * Раньше их было две: анкета мастера из каталога услуг и профиль продавца
 * из объявления. Один и тот же Иван выглядел двумя разными людьми — в
 * анкете не было его плиты, в профиле не было его услуг, — и посетитель
 * не мог узнать, что это одно лицо. Теперь страница одна, и на неё ведут
 * оба адреса: и по адресу анкеты, и по идентификатору аккаунта.
 *
 * Порядок разделов отвечает поводу, с которым сюда приходят: сначала
 * услуги — за ними идут из каталога мастеров, — потом всё остальное.
 *
 * Услуга при этом остаётся особым случаем: переписка о работе открывается
 * только после того, как мастер сам принял заявку. О вещах ему пишут
 * прямо из объявления, потому что за свой товар продавец отвечает сразу,
 * а работу он берёт или не берёт.
 */
export function PersonPage({ by }: { by: 'slug' | 'user' }) {
  const params = useParams();
  const key = (by === 'slug' ? params.idOrSlug : params.id) ?? '';
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const [reviewsVersion, setReviewsVersion] = useState(0);

  /*
   * Каждый вход знает про человека своё, поэтому недостающее дозапрашиваем:
   * по адресу анкеты приходим за аккаунтом владельца, по аккаунту — за
   * анкетой. Оба запроса нужны в любом случае, потому что показываем всё.
   */
  const bySlug = useAsync(
    () => (by === 'slug' ? api.specialist(key) : Promise.resolve(null)),
    [by, key, reviewsVersion],
  );

  const ownerId = by === 'user' ? key : (bySlug.data?.userId ?? null);

  const profile = useAsync(
    () => (ownerId ? api.publicProfile(ownerId) : Promise.resolve(null)),
    [ownerId],
  );

  const cardSlug = by === 'user' ? (profile.data?.specialist?.slug ?? null) : null;

  const bySlugFromProfile = useAsync(
    () => (cardSlug ? api.specialist(cardSlug) : Promise.resolve(null)),
    [cardSlug, reviewsVersion],
  );

  const specialist: SpecialistDetail | null = bySlug.data ?? bySlugFromProfile.data;

  // Ждём то, ради чего пришли: по адресу анкеты — саму анкету, по
  // аккаунту — профиль. Второй запрос догоняет и дорисовывает страницу.
  const loading = by === 'slug' ? bySlug.loading : profile.loading;
  const failure = by === 'slug' ? bySlug.error : profile.error;

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 180 }} />
      </div>
    );
  }

  if (failure || (!profile.data && !specialist)) {
    return (
      <div className="page">
        <EmptyState
          icon="🤷"
          title="Человек не найден"
          hint={failure ?? 'Возможно, профиль скрыт или удалён'}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <>
              <PersonHeader profile={profile.data} specialist={specialist} />

              {specialist && (
                <div style={{ marginBottom: 16 }}>
                  <ShareButton slug={specialist.slug} displayName={specialist.displayName} />
                </div>
              )}

              {/* ─── Услуги: то, за чем приходят из каталога мастеров ─── */}
              {specialist && (
                <>
                  <h2 className="section-title">Услуги</h2>

                  {specialist.services.length > 0 ? (
                    <div className="services">
                      {specialist.services.map((service) => {
                        const price = formatPrice(service.priceAmount, service.currency, service.priceIsFrom);
                        return (
                          <div key={service.id} className="service">
                            <div>
                              <div>{service.name}</div>
                              {service.description && (
                                <div className="card__headline" style={{ whiteSpace: 'normal' }}>
                                  {service.description}
                                </div>
                              )}
                            </div>
                            {price && <div className="service__price">{price}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="form-hint" style={{ marginTop: 0 }}>
                      {specialist.categories.length > 0
                        ? specialist.categories.map((c) => `${c.icon} ${c.name}`).join(' · ')
                        : specialist.headline}
                      {' — цены обсуждаются по заявке.'}
                    </p>
                  )}

                  <ServiceRequestAction
                    specialistId={specialist.id}
                    isAuthenticated={isAuthenticated}
                    canChat={specialist.canChat}
                  />

                  {specialist.about && (
                    <>
                      <h2 className="section-title">О специалисте</h2>
                      <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{specialist.about}</p>
                    </>
                  )}

                  {specialist.photos.length > 0 && (
                    <>
                      <h2 className="section-title">Работы</h2>
                      <div className="gallery">
                        {specialist.photos.map((photo) => (
                          <img
                            key={photo.id}
                            className="gallery__item"
                            src={photo.url}
                            alt={photo.caption ?? ''}
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {(specialist.address || specialist.lat) && (
                    <>
                      <h2 className="section-title">Где принимает</h2>
                      <div style={{ color: 'var(--text-hint)' }}>
                        {specialist.city}
                        {specialist.address && `, ${specialist.address}`}
                        {specialist.distanceKm !== undefined && ` · ${formatDistance(specialist.distanceKm)}`}
                      </div>
                      {specialist.lat !== null && specialist.lng !== null && (
                        <button
                          type="button"
                          className="button button--secondary"
                          style={{ marginTop: 12 }}
                          onClick={() => {
                            haptic.tap();
                            navigate(`/map?focus=${specialist.id}`);
                          }}
                        >
                          🗺 Показать на карте
                        </button>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ─── Вещи: то, за чем приходят из объявления ─── */}
              {ownerId && <PersonListings userId={ownerId} />}

              {/* ─── Отзывы: о работе и о сделках ─── */}
              {specialist && (
                <>
                  <h2 className="section-title">Отзывы о работе</h2>
                  <RatingBreakdown breakdown={specialist.ratingBreakdown} total={specialist.ratingCount} />

                  {isAuthenticated ? (
                    <ReviewForm
                      specialistId={specialist.id}
                      existing={specialist.myReview}
                      onSaved={() => setReviewsVersion((v) => v + 1)}
                    />
                  ) : (
                    <div style={{ color: 'var(--text-hint)', fontSize: 13 }}>
                      Откройте приложение в Telegram, чтобы оставить отзыв.
                    </div>
                  )}

                  <ReviewList specialistId={specialist.id} version={reviewsVersion} />
                </>
              )}

              {ownerId && <DealReviews userId={ownerId} />}

              <div className="profile__footer">
                {specialist && (
                  <ReportButton
                    target="SPECIALIST"
                    targetId={specialist.id}
                    label="Пожаловаться на анкету"
                  />
                )}
              </div>
      </>
    </div>
  );
}

/**
 * Шапка: кто это.
 *
 * Имя берём из профиля аккаунта, а не из названия анкеты: человека зовут
 * так, как он назвался при регистрации, а «Иван — Электрик» это уже
 * вывеска. Название анкеты остаётся подписью под именем.
 */
function PersonHeader({
  profile,
  specialist,
}: {
  profile: PublicProfile | null;
  specialist: SpecialistDetail | null;
}) {
  const name = profile?.name ?? specialist?.displayName ?? '';
  const photoUrl = profile?.photoUrl ?? specialist?.photoUrl ?? null;

  return (
    <div className="profile__header">
      {photoUrl ? (
        <img className="profile__avatar" src={photoUrl} alt="" />
      ) : (
        <div className="profile__avatar" />
      )}

      <div className="profile__name-row">
        <h1 className="profile__name">{name}</h1>
        {/* Отметка исполнителя у самого имени: человек, продающий плиту,
            и человек, которого можно позвать чинить проводку, — один. */}
        {specialist && <span className="badge-role">🛠 Исполнитель</span>}
        {specialist && (
          <FavoriteButton
            specialistId={specialist.id}
            initial={specialist.isFavorite ?? false}
            size="large"
          />
        )}
      </div>

      {specialist?.headline && <div className="profile__headline">{specialist.headline}</div>}

      {specialist && <Rating value={specialist.ratingAvg} count={specialist.ratingCount} />}

      {specialist && specialist.categories.length > 0 && (
        <div className="profile__headline">
          {specialist.categories.map((c) => `${c.icon} ${c.name}`).join(' · ')}
        </div>
      )}

      {profile && (
        <div className="profile__headline">На площадке с {formatDate(profile.joinedAt)}</div>
      )}
    </div>
  );
}

/**
 * Оценки по сделкам — отдельно от отзывов о работе.
 *
 * Это разные вещи: отзыв о работе оставляет заказчик услуги, оценку по
 * сделке — вторая сторона купли-продажи, и право на неё даёт только
 * состоявшаяся сделка. Складывать их в одно среднее значит смешивать
 * «хорошо починил» с «вовремя отдал плиту».
 */
function DealReviews({ userId }: { userId: string }) {
  const reviews = useAsync(() => api.userReviews(userId), [userId]);

  if (!reviews.data || reviews.data.ratingCount === 0) return null;

  return (
    <>
      <h2 className="section-title">Оценки по сделкам</h2>
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
  );
}
