import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SERVICE_REQUEST_MINUTES, SERVICE_REQUEST_NOTE_MAX } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { Rating, RatingBreakdown } from '../components/Rating';
import { ReviewForm, ReviewList } from '../components/Reviews';
import { formatDistance, formatPrice, pluralize } from '../lib/format';
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
 * Обращение к мастеру — через заявку, а не сразу перепиской.
 *
 * Открытый чат обещает ответ, а обещать за мастера нельзя: обращения
 * оставались без ответа, и виноватой выглядела площадка. Теперь заказчик
 * просит, мастер соглашается, и только тогда появляется переписка —
 * согласие становится видимым событием, а не догадкой.
 *
 * У мастера на ответ полчаса. Заказчику видно, сколько осталось: ждать
 * непонятно чего хуже, чем получить отказ.
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
  const state = useAsync(
    () => (isAuthenticated && canChat ? api.serviceRequestFor(specialistId) : Promise.resolve(null)),
    [specialistId, isAuthenticated, canChat],
  );

  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = useMinutesLeft(state.data?.status === 'PENDING' ? state.data.expiresAt : null);

  if (!isAuthenticated) {
    return (
      <div className="contact-note">
        Откройте приложение в Telegram, чтобы обратиться к специалисту.
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

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      const created = await api.requestService(specialistId, note.trim() || null);
      haptic.success();
      setComposing(false);
      setNote('');
      // Мастер мог согласиться раньше — тогда заявка не нужна и заказчик
      // сразу попадает в переписку.
      if (created.status === 'ACCEPTED' && created.conversationId) {
        navigate(`/chat/${created.conversationId}`);
        return;
      }
      state.reload();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  };

  const request = state.data;

  if (request?.status === 'ACCEPTED' && request.conversationId) {
    return (
      <div style={{ marginBottom: 18 }}>
        <button
          type="button"
          className="button"
          onClick={() => {
            haptic.tap();
            navigate(`/chat/${request.conversationId}`);
          }}
        >
          💬 Открыть переписку
        </button>
        <div className="contact-note">Мастер принял заявку — договаривайтесь о деталях в чате</div>
      </div>
    );
  }

  if (request?.status === 'PENDING') {
    return (
      <div className="request-wait">
        <div className="request-wait__title">⏳ Заявка отправлена</div>
        <div className="request-wait__text">
          {left > 0
            ? `Мастер отвечает. Осталось ${left} ${pluralize(left, ['минута', 'минуты', 'минут'])} — как ответит, придёт уведомление.`
            : 'Время на ответ истекло. Обновите страницу или напишите другому мастеру.'}
        </div>
      </div>
    );
  }

  const wasRefused = request?.status === 'DECLINED';
  const wasIgnored = request?.status === 'EXPIRED';

  return (
    <div style={{ marginBottom: 18 }}>
      {/*
        Отказ и молчание называем прямо. Скрыть их — значит оставить
        человека гадать, почему кнопка снова предлагает то же самое.
      */}
      {wasRefused && (
        <div className="alert alert--warning" style={{ marginBottom: 10 }}>
          Мастер отказался от прошлой заявки. Можно попробовать ещё раз или поискать другого.
        </div>
      )}
      {wasIgnored && (
        <div className="alert alert--warning" style={{ marginBottom: 10 }}>
          На прошлую заявку мастер не ответил вовремя. Попробуйте снова или выберите другого.
        </div>
      )}

      {composing ? (
        <>
          <textarea
            className="textarea"
            value={note}
            maxLength={SERVICE_REQUEST_NOTE_MAX}
            placeholder="Что нужно сделать? Необязательно, но так мастер быстрее решит"
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="my-listing__actions">
            <button type="button" className="button" disabled={busy} onClick={() => void send()}>
              {busy ? 'Отправляем...' : 'Отправить заявку'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setComposing(false)}
            >
              Отмена
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="button"
          disabled={state.loading}
          onClick={() => {
            haptic.tap();
            setComposing(true);
          }}
        >
          🤝 Воспользоваться услугой
        </button>
      )}

      {error && <div className="field__error" style={{ marginTop: 6 }}>{error}</div>}
      <div className="contact-note">
        Мастер ответит в течение {SERVICE_REQUEST_MINUTES} минут. Переписка откроется, когда он примет заявку
      </div>
    </div>
  );
}

/** Сколько минут осталось у мастера. Пересчитывается на месте, без перезагрузки. */
function useMinutesLeft(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    // Раз в полминуты: чаще незачем — показываем минуты, а не секунды.
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
}
