import { Link, useNavigate } from 'react-router-dom';
import type { MySpecialistProfile, SpecialistStatus } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { Rating } from '../components/Rating';
import { formatPrice, pluralize } from '../lib/format';
import { haptic, tg } from '../lib/telegram';
import { useState } from 'react';
import { AvatarUpload, GalleryUpload } from '../components/PhotoUpload';
import { DrawImage } from '../components/DrawImage';
import { ReviewsAboutMe } from '../components/ReviewsAboutMe';
import { ShareButton } from '../components/ShareButton';

/** Как объяснить владельцу текущее состояние его анкеты. */
const STATUS_VIEW: Record<SpecialistStatus, { icon: string; title: string; text: string; tone: string }> = {
  PENDING: {
    icon: '⏳',
    title: 'На проверке',
    text: 'Модератор посмотрит анкету и опубликует её в каталоге. Обычно это занимает несколько часов.',
    tone: 'status--pending',
  },
  ACTIVE: {
    icon: '✅',
    title: 'Опубликована',
    text: 'Анкета видна в каталоге, поиске и на карте. Клиенты могут с вами связаться.',
    tone: 'status--active',
  },
  HIDDEN: {
    icon: '🙈',
    title: 'Скрыта',
    text: 'Анкета не показывается в каталоге. Вы можете вернуть её в любой момент.',
    tone: 'status--hidden',
  },
  DRAFT: {
    icon: '📝',
    title: 'Черновик',
    text: 'Анкета сохранена, но ещё не отправлена на проверку.',
    tone: 'status--hidden',
  },
  BLOCKED: {
    icon: '🚫',
    title: 'Заблокирована',
    text: 'Анкета заблокирована администрацией. Свяжитесь с поддержкой, чтобы разобраться.',
    tone: 'status--blocked',
  },
};

/*
 * Одобрена, но не оплачена.
 *
 * Отдельного статуса в базе для этого нет: модерация и оплата — две
 * независимые вещи. Но для мастера разница главная. Раньше такая анкета
 * называлась «Опубликована — видна в каталоге», хотя в каталоге её не
 * было, и человек искал себя в ленте, не понимая, что не так.
 */
const UNPAID_VIEW = {
  icon: '💳',
  title: 'Одобрена, но пока не видна в каталоге',
  text: 'Модерация пройдена. Чтобы клиенты вас находили в каталоге, поиске и на карте, оплатите показ.',
  tone: 'status--pending',
};

/** Личная карточка специалиста: состояние, статистика, управление публикацией. */
export function MyCardPage() {
  const navigate = useNavigate();
  const state = useAsync(() => api.myProfile(), []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleVisibility = async (profile: MySpecialistProfile) => {
    const hiding = profile.status === 'ACTIVE';
    const confirmText = hiding
      ? 'Скрыть анкету из каталога? Клиенты перестанут вас находить.'
      : 'Вернуть анкету в каталог?';

    const run = async () => {
      setBusy(true);
      setActionError(null);
      try {
        if (hiding) await api.hideProfile();
        else await api.publishProfile();
        haptic.success();
        state.reload();
      } catch (err) {
        haptic.error();
        setActionError(err instanceof Error ? err.message : 'Не удалось выполнить');
      } finally {
        setBusy(false);
      }
    };

    const app = tg();
    if (app) app.showConfirm(confirmText, (ok) => ok && void run());
    else if (window.confirm(confirmText)) void run();
  };

  return (
    <div className="page">
      <h1 className="page__title">Моя анкета</h1>

      {actionError && <div className="alert alert--error">{actionError}</div>}

      {/* Пустое состояние передаём отдельно: AsyncContent не пускает null
          внутрь, и написанная там ветка «анкеты пока нет» не отрисовывалась
          никогда — вместо приглашения заполнить анкету человек видел
          безликое «Ничего не найдено» и упирался в тупик. */}
      <AsyncContent
        state={state}
        empty={
          <>
            <EmptyState
              icon="🛠"
              title="Анкеты пока нет"
              hint="Расскажите о своих услугах — и вас начнут находить клиенты"
            />
            <Link to="/profile/application" className="button">
              Заполнить анкету
            </Link>
          </>
        }
      >
        {(profile) => {
          if (!profile) return null;
          const paid = Boolean(profile.subscriptionEndsAt && new Date(profile.subscriptionEndsAt) > new Date());
          const view = profile.status === 'ACTIVE' && !paid ? UNPAID_VIEW : STATUS_VIEW[profile.status];
          return (
            <>
              <div className={`status-card ${view.tone}`}>
                <div className="status-card__icon" aria-hidden>
                  {view.icon}
                </div>
                <div>
                  <div className="status-card__title">{view.title}</div>
                  <div className="status-card__text">{view.text}</div>
                </div>
              </div>

              {profile.status === 'ACTIVE' && !paid && (
                <Link className="button subscription-cta" to="/profile/subscription">
                  Оплатить показ в каталоге
                </Link>
              )}

              {/*
                Подписка стоит сразу под состоянием анкеты: одобренная
                модератором, но неоплаченная анкета в каталоге не видна,
                и человек должен узнать об этом здесь, а не гадать,
                почему его не находят.
              */}
              {/* Цвет рамки отвечает на главный вопрос без чтения:
                  зелёная — клиенты вас видят, красная — нет. */}
              <Link
                className={`subscription-row ${paid ? 'subscription-row--paid' : 'subscription-row--unpaid'}`}
                to="/profile/subscription"
              >
                <span className="subscription-row__label">
                  {paid ? '✅' : '⛔'} Показ в каталоге
                </span>
                <span className="subscription-row__value">
                  {paid
                    ? `оплачен до ${new Date(profile.subscriptionEndsAt ?? '').toLocaleDateString('ru-RU')}`
                    : 'не оплачен — вас не видно'}
                </span>
              </Link>

              {profile.needsReview && profile.status === 'ACTIVE' && paid && (
                <div className="alert alert--info">
                  Изменения отправлены на проверку. Анкета остаётся в каталоге — из выдачи она не пропадёт.
                </div>
              )}

              {profile.rejectionReason && (
                <div className="alert alert--warning">
                  <strong>Что нужно поправить:</strong> {profile.rejectionReason}
                  <div style={{ marginTop: 6 }}>
                    Внесите изменения и сохраните — анкета снова уйдёт на проверку.
                  </div>
                </div>
              )}

              <div className="my-card">
                <div className="my-card__head">
                  {profile.photoUrl ? (
                    <img className="my-card__avatar" src={profile.photoUrl} alt="" />
                  ) : (
                    <div className="my-card__avatar" aria-hidden>
                      {profile.displayName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="my-card__name">{profile.displayName}</div>
                    {profile.headline && <div className="card__headline">{profile.headline}</div>}
                    <div className="card__headline">
                      {profile.categories.map((c) => `${c.icon} ${c.name}`).join(' · ')}
                    </div>
                  </div>
                </div>

                <div className="my-card__stats">
                  <div>
                    <div className="my-card__stat-value">{profile.viewCount}</div>
                    <div className="my-card__stat-label">
                      {pluralize(profile.viewCount, ['просмотр', 'просмотра', 'просмотров'])}
                    </div>
                  </div>
                  <div>
                    <div className="my-card__stat-value">
                      {profile.ratingCount > 0 ? profile.ratingAvg.toFixed(1) : '—'}
                    </div>
                    <div className="my-card__stat-label">рейтинг</div>
                  </div>
                  <div>
                    <div className="my-card__stat-value">{profile.ratingCount}</div>
                    <div className="my-card__stat-label">
                      {pluralize(profile.ratingCount, ['отзыв', 'отзыва', 'отзывов'])}
                    </div>
                  </div>
                </div>

                {profile.ratingCount > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <Rating value={profile.ratingAvg} count={profile.ratingCount} />
                  </div>
                )}
              </div>

              <h2 className="section-title">Фотография</h2>
              <AvatarUpload photoUrl={profile.photoUrl} onUploaded={() => state.reload()} />

              {/* Не у каждого мастера есть снимок, который не стыдно
                  поставить на вывеску. Нарисованная обложка здесь уместна:
                  она обещает услугу, а не изображает конкретную вещь. */}
              <div style={{ marginTop: 10 }}>
                <DrawImage
                  hint="Опишите вывеску или обложку анкеты. Себя рисовать не стоит — лучше то, чем вы занимаетесь."
                  onReady={async (image) => {
                    await api.uploadAvatar(image);
                    state.reload();
                  }}
                />
              </div>

              <h2 className="section-title">Ваши работы</h2>
              <GalleryUpload profile={profile} onChanged={() => state.reload()} />

              {profile.services.length > 0 && (
                <>
                  <h2 className="section-title">Ваши услуги</h2>
                  <div className="services">
                    {profile.services.map((service) => (
                      <div key={service.id} className="service">
                        <div>{service.name}</div>
                        <div className="service__price">
                          {formatPrice(service.priceAmount, service.currency, service.priceIsFrom) ?? '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {profile.status === 'ACTIVE' && (
                <>
                  <h2 className="section-title">Отзывы о вас</h2>
                  <ReviewsAboutMe specialistId={profile.id} />
                </>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => navigate('/profile/application')}
                >
                  Редактировать анкету
                </button>

                {profile.status === 'ACTIVE' && (
                  <>
                    <Link to={`/specialist/${profile.slug}`} className="button button--secondary">
                      Посмотреть как клиент
                    </Link>
                    {/* Мастер разошлёт ссылку сам — это дешевле любой рекламы. */}
                    <ShareButton slug={profile.slug} displayName={profile.displayName} />
                  </>
                )}

                {(profile.status === 'ACTIVE' || profile.status === 'HIDDEN') && (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => toggleVisibility(profile)}
                    disabled={busy}
                  >
                    {profile.status === 'ACTIVE' ? 'Скрыть из каталога' : 'Вернуть в каталог'}
                  </button>
                )}
              </div>
            </>
          );
        }}
      </AsyncContent>
    </div>
  );
}
