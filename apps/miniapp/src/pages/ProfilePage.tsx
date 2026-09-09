import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import { AsyncContent, EmptyState } from '../components/states';
import { SpecialistCard } from '../components/SpecialistCard';
import { AvatarUpload } from '../components/PhotoUpload';
import { ReviewCard } from '../components/Reviews';
import { formatDate } from '../lib/format';
import { Link, useNavigate } from 'react-router-dom';
import { resetRoleChoice } from '../lib/session';
import { haptic, tg } from '../lib/telegram';

type Tab = 'history' | 'reviews' | 'favorites';

const TAB_LABELS: Record<Tab, string> = {
  history: 'Просмотры',
  reviews: 'Мои отзывы',
  favorites: 'Избранное',
};

/** Личный кабинет: профиль из Telegram, история просмотров и отзывы. */
export function ProfilePage() {
  const { user, status, error } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('history');

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    return (
      <div className="page">
        <EmptyState
          icon="👋"
          title="Откройте приложение в Telegram"
          hint={
            error ??
            'Личный кабинет доступен только внутри Telegram — оттуда приходят данные вашего профиля.'
          }
        />
      </div>
    );
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <div className="page">
      <div className="profile__header">
        <ProfileAvatar telegramPhotoUrl={user.photoUrl} hasCard={user.hasSpecialistProfile} />
        <h1 className="profile__name">{fullName}</h1>
        {user.username && <div className="profile__headline">@{user.username}</div>}
        {user.role !== 'USER' && <span className="badge-promoted">{user.role}</span>}
      </div>

      <Link
        to={user.hasSpecialistProfile ? '/profile/my-card' : '/profile/application'}
        className="profile-cta"
        onClick={() => haptic.tap()}
      >
        <span className="profile-cta__icon" aria-hidden>
          🛠
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">
            {user.hasSpecialistProfile ? 'Моя анкета специалиста' : 'Разместить свою анкету'}
          </span>
          <span className="profile-cta__text">
            {user.hasSpecialistProfile
              ? 'Статус публикации, просмотры и редактирование'
              : 'Расскажите о своих услугах — вас будут находить клиенты'}
          </span>
        </span>
        <span className="profile-cta__chevron" aria-hidden>
          ›
        </span>
      </Link>

      <button
        type="button"
        className="role-switch"
        onClick={() => {
          haptic.tap();
          // Снимаем отметку сеанса, иначе редирект вернёт обратно в кабинет.
          resetRoleChoice();
          navigate('/onboarding');
        }}
      >
        <span aria-hidden>🔄</span>
        Сменить роль
        <span className="role-switch__current">
          {user.onboardedAs === 'SPECIALIST' ? 'сейчас: исполнитель' : 'сейчас: заказчик'}
        </span>
      </button>

      <div className="chips">
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`chip${tab === key ? ' chip--active' : ''}`}
            onClick={() => {
              haptic.tap();
              setTab(key);
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {tab === 'history' && <HistoryTab />}
      {tab === 'reviews' && <MyReviewsTab />}
      {tab === 'favorites' && <FavoritesTab />}
    </div>
  );
}

function HistoryTab() {
  const state = useAsync(() => api.history(), []);

  const clear = () => {
    tg()?.showConfirm('Очистить историю просмотров?', (confirmed) => {
      if (!confirmed) return;
      void api.clearHistory().then(() => state.reload());
    });
  };

  return (
    <AsyncContent state={state}>
      {(items) =>
        items.length === 0 ? (
          <EmptyState icon="🕘" title="История пуста" hint="Здесь появятся профили, которые вы открывали" />
        ) : (
          <>
            <div className="card-list">
              {items.map((item) => (
                <div key={item.specialist.id}>
                  <SpecialistCard specialist={item.specialist} />
                  <div style={{ fontSize: 12, color: 'var(--text-hint)', padding: '4px 12px' }}>
                    Просмотрено {formatDate(item.viewedAt)}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="button button--secondary" style={{ marginTop: 16 }} onClick={clear}>
              Очистить историю
            </button>
          </>
        )
      }
    </AsyncContent>
  );
}

function MyReviewsTab() {
  const state = useAsync(() => api.myReviews(), []);

  return (
    <AsyncContent state={state}>
      {(items) =>
        items.length === 0 ? (
          <EmptyState icon="💬" title="Вы ещё не оставляли отзывов" />
        ) : (
          <div>
            {items.map((review) => (
              <ReviewCard key={review.id} review={review} showStatus />
            ))}
          </div>
        )
      }
    </AsyncContent>
  );
}

function FavoritesTab() {
  const state = useAsync(() => api.favorites(), []);

  return (
    <AsyncContent state={state}>
      {(items) =>
        items.length === 0 ? (
          <EmptyState icon="⭐" title="В избранном пусто" hint="Сохраняйте специалистов, чтобы не искать заново" />
        ) : (
          <div className="card-list">
            {items.map((specialist) => (
              <SpecialistCard key={specialist.id} specialist={specialist} />
            ))}
          </div>
        )
      }
    </AsyncContent>
  );
}

/**
 * Фотография в шапке профиля.
 *
 * У кого есть анкета — правит фотографию анкеты: именно её видят
 * в каталоге, на карте и в переписке, и именно она обычно оказывается
 * не той. Своё фото из Telegram здесь только показывается: приложение
 * перечитывает его при каждом входе, и любая наша замена не пережила бы
 * следующий запуск. Менять его нужно в самом Telegram.
 */
function ProfileAvatar({
  telegramPhotoUrl,
  hasCard,
}: {
  telegramPhotoUrl: string | null;
  hasCard: boolean;
}) {
  const card = useAsync(() => (hasCard ? api.myProfile() : Promise.resolve(null)), [hasCard]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const shown = photoUrl ?? card.data?.photoUrl ?? telegramPhotoUrl;

  if (!hasCard) {
    return shown ? (
      <img className="profile__avatar" src={shown} alt="" />
    ) : (
      <div className="profile__avatar" />
    );
  }

  return (
    <div className="profile__avatar-edit">
      <AvatarUpload photoUrl={shown} onUploaded={(profile) => setPhotoUrl(profile.photoUrl)} />
      <span className="profile__avatar-hint">Фотография анкеты — её видят клиенты</span>
    </div>
  );
}