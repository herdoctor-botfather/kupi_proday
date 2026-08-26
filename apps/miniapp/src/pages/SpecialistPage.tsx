import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SpecialistContacts } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { Rating, RatingBreakdown } from '../components/Rating';
import { ReviewForm, ReviewList } from '../components/Reviews';
import { contactToUrl, formatDistance, formatPrice } from '../lib/format';
import { haptic, openExternal, tg } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';
import { FavoriteButton } from '../components/FavoriteButton';
import { ReportButton } from '../components/ReportButton';
import { ShareButton } from '../components/ShareButton';

const CONTACT_META: Record<keyof SpecialistContacts, { icon: string; label: string }> = {
  phone: { icon: '📞', label: 'Позвонить' },
  telegram: { icon: '✈️', label: 'Написать в Telegram' },
  whatsapp: { icon: '💬', label: 'Написать в WhatsApp' },
  instagram: { icon: '📷', label: 'Instagram' },
  website: { icon: '🌐', label: 'Сайт' },
};

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

            <div className="contacts">
              {(Object.keys(CONTACT_META) as (keyof SpecialistContacts)[]).map((kind) => {
                const value = specialist.contacts[kind];
                if (!value) return null;
                return <ContactRow key={kind} kind={kind} value={value} />;
              })}
            </div>

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

/** Строка контакта: тап открывает мессенджер, долгий тап копирует значение. */
function ContactRow({ kind, value }: { kind: keyof SpecialistContacts; value: string }) {
  const [copied, setCopied] = useState(false);
  const meta = CONTACT_META[kind];
  const url = contactToUrl(kind, value);

  const open = () => {
    if (!url) return;
    haptic.tap();
    // tel: обрабатывает сама система, остальное — через SDK Telegram.
    if (url.startsWith('tel:')) window.location.href = url;
    else openExternal(url);
  };

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      haptic.success();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер обмена может быть недоступен — показываем значение в системном окне.
      tg()?.showAlert(value);
    }
  };

  return (
    <button type="button" className="contact" onClick={open}>
      <span className="contact__icon" aria-hidden>
        {meta.icon}
      </span>
      <span className="contact__value">
        <div>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{meta.label}</div>
      </span>
      <span className="contact__action" onClick={copy} role="button" tabIndex={0}>
        {copied ? 'Скопировано' : 'Копировать'}
      </span>
    </button>
  );
}
