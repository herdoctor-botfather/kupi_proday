import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { Rating, RatingBreakdown } from '../components/Rating';
import { ReviewForm, ReviewList } from '../components/Reviews';
import { formatDistance, formatPrice } from '../lib/format';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';
import { FavoriteButton } from '../components/FavoriteButton';
import { ReportButton } from '../components/ReportButton';
import { ShareButton } from '../components/ShareButton';

/** Полный профиль специалиста: контакты, услуги, галерея, отзывы. */
export function SpecialistPage() {
  const { idOrSlug = '' } = useParams();
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const [reviewsVersion, setReviewsVersion] = useState(0);

  const state = useAsync(() => api.specialist(idOrSlug), [idOrSlug, reviewsVersion]);

  return (
    <div className="page">
      <AsyncContent state={state}>
        {(specialist) => (
          <>
            <div className="profile__header">
              {specialist.photoUrl ? (
                <img className="profile__avatar" src={specialist.photoUrl} alt="" />
              ) : (
                <div className="profile__avatar" />
              )}
              <div className="profile__name-row">
                <h1 className="profile__name">{specialist.displayName}</h1>
                <FavoriteButton
                  specialistId={specialist.id}
                  initial={specialist.isFavorite ?? false}
                  size="large"
                />
              </div>
              {specialist.headline && <div className="profile__headline">{specialist.headline}</div>}
              <Rating value={specialist.ratingAvg} count={specialist.ratingCount} />
              <div className="profile__headline">
                {specialist.categories.map((c) => `${c.icon} ${c.name}`).join(' · ')}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <ShareButton slug={specialist.slug} displayName={specialist.displayName} />
            </div>

            <ContactAction
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

            {specialist.services.length > 0 && (
              <>
                <h2 className="section-title">Услуги и цены</h2>
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
                    onClick={() => navigate(`/map?focus=${specialist.id}`)}
                  >
                    🗺 Показать на карте
                  </button>
                )}
              </>
            )}

            <h2 className="section-title">Отзывы</h2>
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

            <div className="profile__footer">
              <ReportButton target="SPECIALIST" targetId={specialist.id} label="Пожаловаться на анкету" />
            </div>
          </>
        )}
      </AsyncContent>
    </div>
  );
}

/**
 * Единственный способ связаться — чат внутри приложения.
 *
 * Контакты в карточке больше не показываются: общение остаётся на площадке,
 * поэтому видно, о чём договорились, и спорную ситуацию можно разобрать.
 */
function ContactAction({
  specialistId,
  isAuthenticated,
  canChat,
}: {
  specialistId: string;
  isAuthenticated: boolean;
  canChat: boolean;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="contact-note">
        Откройте приложение в Telegram, чтобы написать специалисту.
      </div>
    );
  }

  // Кнопка, которая заведомо откажет, хуже её отсутствия: человек нажимает,
  // получает ошибку и не понимает, что сделал не так.
  if (!canChat) {
    return (
      <div className="contact-note" style={{ marginBottom: 18 }}>
        Этот специалист ещё не подключил чат. Карточка размещена администрацией,
        и написать по ней пока нельзя.
      </div>
    );
  }

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      const conversation = await api.startConversation(specialistId);
      navigate(`/chat/${conversation.id}`);
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось открыть переписку');
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <button type="button" className="button" onClick={write} disabled={busy}>
        {busy ? 'Открываем...' : '💬 Написать специалисту'}
      </button>
      {error && <div className="field__error" style={{ marginTop: 6 }}>{error}</div>}
      <div className="contact-note">
        Общение внутри приложения: переписка сохраняется, и в спорной ситуации есть на что сослаться
      </div>
    </div>
  );
}
