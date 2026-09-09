import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ChipsRow } from '../components/ChipsRow';
import { useAuth } from '../lib/auth';
import { AsyncContent, EmptyState } from '../components/states';
import { SpecialistCard } from '../components/SpecialistCard';
import { ImageError, prepareImage } from '../lib/image';
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
        <ProfileAvatar photoUrl={user.photoUrl} />
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

      {/* Размещение объявления — такое же частое намерение, как анкета,
          и искать его через раздел товаров человек не обязан. */}
      <Link to="/market/sell" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          🏷
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Разместить своё объявление</span>
          <span className="profile-cta__text">Название, цена, фотографии — и на витрину</span>
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

      <ChipsRow>
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
      </ChipsRow>

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
 * Фотография профиля — своя, а не телеграмная.
 *
 * Телеграмная приходит при каждом входе и любую замену затирает,
 * поэтому у человека есть отдельная: он выбирает её сам, и меняется
 * она здесь же, нажатием.
 *
 * Фотография анкеты специалиста живёт отдельно и правится в «Моей
 * анкете»: это разные вещи — одна про человека, другая про его дело,
 * и совмещать их значит заставлять выбирать между собой и вывеской.
 */
function ProfileAvatar({ photoUrl }: { photoUrl: string | null }) {
  const [shown, setShown] = useState<string | null>(photoUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Сбрасываем значение: иначе повторный выбор того же файла не вызовет событие.
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    let localUrl: string | null = null;

    try {
      const blob = await prepareImage(file);
      // Показываем выбранное сразу, не дожидаясь сервера: ожидание
      // с прежней фотографией выглядит так, будто нажатие не сработало.
      localUrl = URL.createObjectURL(blob);
      setShown(localUrl);

      const { photoUrl: saved } = await api.uploadMyAvatar(blob);
      haptic.success();
      setShown(saved);
    } catch (err) {
      haptic.error();
      setShown(photoUrl);
      setError(err instanceof ImageError ? err.message : 'Не удалось загрузить фотографию');
    } finally {
      if (localUrl) URL.revokeObjectURL(localUrl);
      setBusy(false);
    }
  };

  return (
    <div className="profile__avatar-edit">
      <button
        type="button"
        className="profile__avatar-button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Сменить фотографию профиля"
      >
        {shown ? (
          <img className="profile__avatar" src={shown} alt="" />
        ) : (
          <div className="profile__avatar" />
        )}
        <span className="profile__avatar-badge" aria-hidden>
          {busy ? '…' : '✎'}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void pick(event)}
      />

      {error && <span className="profile__avatar-error">{error}</span>}
    </div>
  );
}
