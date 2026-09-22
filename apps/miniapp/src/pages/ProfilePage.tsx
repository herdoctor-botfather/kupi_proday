import { useRef, useState } from 'react';
import type { Involvement } from '@app/shared';
import { api, type PendingDeal } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ChipsRow } from '../components/ChipsRow';
import { useAuth } from '../lib/auth';
import { ProfileToolbar } from '../components/ProfileToolbar';
import { AsyncContent, EmptyState } from '../components/states';
import { SpecialistCard } from '../components/SpecialistCard';
import { ImageError, prepareImage } from '../lib/image';
import { Stars } from '../components/Rating';
import { REVIEW_TEXT_MAX } from '@app/shared';
import { ReviewCard } from '../components/Reviews';
import { formatDate, formatPrice, pluralize } from '../lib/format';
import { Link, useNavigate } from 'react-router-dom';
import { resetRoleChoice } from '../lib/session';
import { haptic, tg } from '../lib/telegram';

type Tab = 'deals' | 'history' | 'reviews' | 'favorites';

const TAB_LABELS: Record<Tab, string> = {
  deals: 'Сделки',
  history: 'Просмотры',
  reviews: 'Мои отзывы',
  favorites: 'Избранное',
};

/** Личный кабинет: профиль из Telegram, история просмотров и отзывы. */
export function ProfilePage() {
  const { user, status, error } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('deals');

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
      {/* Поддержка и помощь — в углах экрана, а не строками в списке:
          это не разделы, в которые ходят, а выход на случай «я не понял». */}
      <ProfileToolbar />

      <div className="profile__header">
        <ProfileAvatar photoUrl={user.photoUrl} />
        <h1 className="profile__name">{fullName}</h1>
        {user.username && <div className="profile__headline">@{user.username}</div>}
        {user.role !== 'USER' && <span className="badge-promoted">{user.role}</span>}
      </div>

      {/* Заявки — первым делом: у них срок, и всё остальное в кабинете подождёт. */}
      {user.hasSpecialistProfile && <IncomingRequests />}

      {/*
        Первым — то, что человек проверяет чаще всего: как дела у его
        объявлений. Анкету заводят однажды, а размещённое перечитывают,
        правят и снимают, и путь к нему через раздел товаров человек
        помнить не обязан.
      */}
      <Link to="/market/my" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          📋
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Мои объявления и запросы</span>
          <span className="profile-cta__text">
            Что на витрине, что на проверке и что вы ищете сами
          </span>
        </span>
        <span className="profile-cta__chevron" aria-hidden>
          ›
        </span>
      </Link>

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

      {/* Отдельной кнопки размещения здесь больше нет: она вела туда же,
          куда и «Мои объявления», где такая кнопка и так стоит первой.
          Два входа в одно место на одном экране — выбор без выбора. */}

      {/* Охота за спросом — то, ради чего продавцу стоит держать
          приложение установленным: работает и при пустой витрине. */}
      <Link to="/profile/demand" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          🔔
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Когда кто-то ищет</span>
          <span className="profile-cta__text">
            Сообщим, если появится запрос на то, что вы продаёте или делаете
          </span>
        </span>
        <span className="profile-cta__chevron" aria-hidden>
          ›
        </span>
      </Link>

      <Link to="/profile/referrals" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          🎁
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Реферальная система</span>
          <span className="profile-cta__text">
            Приглашайте друзей — за каждый рубеж подарок
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

      {tab === 'deals' && <DealsTab />}
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

/**
 * Заявки, ждущие ответа мастера.
 *
 * Заявка живёт полчаса, поэтому она стоит выше всего остального в кабинете
 * и показывает, сколько осталось. Отказ здесь — такое же законное действие,
 * как согласие: занятому мастеру важно уметь освободить человека, а не
 * молчать до истечения срока.
 */
function IncomingRequests() {
  const navigate = useNavigate();
  const state = useAsync(() => api.incomingRequests(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = state.data ?? [];
  if (items.length === 0) return null;

  const answer = async (id: string, action: 'accept' | 'decline') => {
    setBusyId(id);
    setError(null);
    try {
      const result = await api.answerRequest(id, action);
      haptic.success();
      if (action === 'accept' && result.conversationId) {
        navigate(`/chat/${result.conversationId}`);
        return;
      }
      state.reload();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось ответить');
      state.reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="section-title">Заявки на услугу</div>
      {error && <div className="alert alert--error">{error}</div>}

      {items.map((item) => (
        <div key={item.id} className="deal-card">
          <div className="deal-card__head">
            {item.client.photoUrl ? (
              <img className="seller__avatar" src={item.client.photoUrl} alt="" />
            ) : (
              <div className="seller__avatar" aria-hidden>
                {item.client.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="seller__name">{item.client.name}</div>
              <div className="card__headline">Хочет воспользоваться услугой</div>
            </div>
          </div>

          {item.note && <div style={{ whiteSpace: 'pre-line', marginTop: 8 }}>{item.note}</div>}

          <div className="my-listing__actions">
            <button
              type="button"
              className="button button--sm"
              disabled={busyId === item.id}
              onClick={() => void answer(item.id, 'accept')}
            >
              Принять запрос
            </button>
            <button
              type="button"
              className="button button--secondary button--sm"
              disabled={busyId === item.id}
              onClick={() => void answer(item.id, 'decline')}
            >
              Отказать
            </button>
          </div>

          <button
            type="button"
            className="button button--secondary button--sm"
            style={{ marginTop: 8 }}
            onClick={() => {
              haptic.tap();
              navigate(`/seller/${item.client.id}?request=${item.id}`);
            }}
          >
            👤 Профиль заказчика
          </button>

          <p className="form-hint">
            Переписка откроется сразу после согласия. Если промолчать, заявка сгорит.
          </p>
        </div>
      ))}
    </>
  );
}

/** Заголовки разделов участия — по дверям, из которых человек пришёл. */
const INVOLVEMENT_SECTIONS: { kind: Involvement['kind']; title: string; icon: string }[] = [
  { kind: 'SERVICE', title: 'Услуги', icon: '🛠' },
  { kind: 'SELL', title: 'Товары', icon: '📦' },
  { kind: 'BUY', title: 'Запросы', icon: '🔎' },
  // Отклики на чужие вакансии и резюме: сервер их отдавал, но без
  // своих разделов они здесь не показывались вовсе.
  { kind: 'JOB', title: 'Вакансии', icon: '💼' },
  { kind: 'RESUME', title: 'Резюме', icon: '🙋' },
];

/** Как назвать состояние своей вакансии или резюме одним словом. */
const CAREER_STATUS: Record<string, string> = {
  PENDING: '⏳ На проверке',
  ACTIVE: '✅ Опубликовано',
  HIDDEN: '🙈 Скрыто',
  REJECTED: '✖️ Отклонено',
  SOLD: '✔️ Закрыто',
};

/**
 * Сделки: что человек ждёт оценить и во что он ввязался.
 *
 * Сверху — состоявшиеся сделки, по которым он ещё не высказался: это
 * дело со сроком, и откладывать его в конец списка нельзя. Ниже — чужие
 * анкеты, товары и запросы, куда он написал: участие начинается с первого
 * сообщения и заканчивается сделкой, и до сделки его больше нигде не видно.
 *
 * Оценить можно только состоявшуюся сделку — это и есть защита от мести
 * и накруток: написать «мошенник» первому встречному нельзя, потому что
 * права на отзыв без сделки не возникает.
 */
function DealsTab() {
  const pending = useAsync(() => api.pendingDeals(), []);
  const involved = useAsync(() => api.involvements(), []);
  /*
   * Своё резюме — соискателю, свои вакансии — работодателю.
   *
   * Карьера — это ожидание: разместил и ждёшь, напишут ли. Место, где
   * человек смотрит «что у меня в процессе», должно показывать и это,
   * а не только чужое, куда он написал сам.
   */
  const mine = useAsync(() => api.myListings(), []);
  const navigate = useNavigate();

  const deals = pending.data ?? [];
  const items = involved.data ?? [];
  const career = (mine.data ?? []).filter((listing) => listing.kind === 'JOB' || listing.kind === 'RESUME');

  return (
    <>
      {career.length > 0 && (
        <>
          <div className="section-title">💼 Моя карьера</div>
          <div className="card-list">
            {career.map((listing) => (
              <button
                key={listing.id}
                type="button"
                className="my-listing career-own"
                onClick={() => {
                  haptic.tap();
                  navigate(`/market/sell?id=${listing.id}`);
                }}
              >
                <div className="card__headline">{listing.kind === 'JOB' ? 'Моя вакансия' : 'Моё резюме'}</div>
                <div className="my-listing__title">{listing.title}</div>
                <div className="card__headline">
                  {CAREER_STATUS[listing.status] ?? listing.status} · {listing.viewCount}{' '}
                  {pluralize(listing.viewCount, ['просмотр', 'просмотра', 'просмотров'])}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {deals.length > 0 && (
        <>
          <div className="section-title">Ждут вашей оценки</div>
          {deals.map((deal) => (
            <DealReviewForm
              key={deal.id}
              deal={deal}
              onDone={() => {
                pending.reload();
                involved.reload();
              }}
            />
          ))}
        </>
      )}

      <AsyncContent state={involved}>
        {() =>
          items.length === 0 && deals.length === 0 && career.length === 0 ? (
            <EmptyState
              icon="🤝"
              title="Участий пока нет"
              hint="Напишите мастеру, продавцу или откликнитесь на чужой запрос — всё это соберётся здесь"
            />
          ) : (
            <>
              {INVOLVEMENT_SECTIONS.map((section) => {
                const group = items.filter((item) => item.kind === section.kind);
                if (group.length === 0) return null;
                return (
                  <div key={section.kind}>
                    <div className="section-title">
                      {section.icon} {section.title}
                    </div>
                    <div className="card-list">
                      {group.map((item) => (
                        <InvolvementCard key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )
        }
      </AsyncContent>
    </>
  );
}

/**
 * Одно участие.
 *
 * Карточка ведёт в предмет разговора, а не в переписку: чаще всего человек
 * возвращается сюда, чтобы посмотреть, что это была за вещь и цела ли она
 * ещё. Переписка — отдельной ссылкой рядом, вместе с числом непрочитанного.
 */
function InvolvementCard({ item }: { item: Involvement }) {
  const navigate = useNavigate();
  const fallbackIcon = item.kind === 'SERVICE' ? '🛠' : item.kind === 'BUY' ? '🔎' : '📦';

  return (
    <div className="my-listing">
      <button
        type="button"
        className="my-listing__head involvement__open"
        onClick={() => {
          haptic.tap();
          navigate(item.href);
        }}
      >
        <div className="my-listing__photo">
          {item.coverUrl ? (
            <img src={item.coverUrl} alt="" loading="lazy" />
          ) : (
            <span aria-hidden>{fallbackIcon}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div className="my-listing__title">{item.title}</div>
          {item.priceAmount !== null && (
            <div className="my-listing__price">
              {item.kind === 'BUY' && <span className="card__headline">до </span>}
              {formatPrice(item.priceAmount, item.currency ?? 'RUB')}
            </div>
          )}
          {item.subtitle && <div className="card__headline">{item.subtitle}</div>}
          <div className="card__headline">{item.owner.name}</div>
        </div>
        {/*
          Снятое и проданное помечаем сразу: человек приходит сюда через
          неделю и должен понять, почему на письмо не отвечают, не открывая
          объявление.
        */}
        {item.isClosed && <span className="listing-status status--hidden">Уже нет</span>}
      </button>

      <div className="my-listing__actions">
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => {
            haptic.tap();
            navigate(`/chat/${item.id}`);
          }}
        >
          Переписка
          {item.unread > 0 && <span className="chat-row__badge" style={{ marginLeft: 6 }}>{item.unread}</span>}
        </button>

        {item.dealId && (
          <span className="listing-status status--active" style={{ marginLeft: 'auto' }}>
            {item.isReviewed ? '⭐️ Вы оценили' : '🤝 Сделка состоялась'}
          </span>
        )}
      </div>
    </div>
  );
}

function DealReviewForm({ deal, onDone }: { deal: PendingDeal; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (rating === 0) {
      setError('Поставьте оценку');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.reviewDeal(deal.id, rating, text.trim() || null);
      haptic.success();
      onDone();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось отправить');
      setBusy(false);
    }
  };

  return (
    <div className="deal-card">
      <div className="deal-card__head">
        {deal.counterpart.photoUrl ? (
          <img className="seller__avatar" src={deal.counterpart.photoUrl} alt="" />
        ) : (
          <div className="seller__avatar" aria-hidden>
            {deal.counterpart.name.charAt(0)}
          </div>
        )}
        <div>
          <div className="seller__name">{deal.counterpart.name}</div>
          <div className="card__headline">
            {deal.role === 'SELLER' ? 'Купил у вас' : 'Продал вам'} · {deal.listingTitle}
          </div>
        </div>
      </div>

      <Stars value={rating} onChange={setRating} />

      <textarea
        className="textarea"
        style={{ marginTop: 10 }}
        value={text}
        maxLength={REVIEW_TEXT_MAX}
        placeholder={deal.role === 'SELLER' ? 'Как прошла продажа?' : 'Как прошла покупка?'}
        onChange={(event) => setText(event.target.value)}
      />

      {error && <p className="form-error">{error}</p>}

      <button type="button" className="button" style={{ marginTop: 10 }} disabled={busy} onClick={() => void send()}>
        {busy ? 'Отправляем...' : 'Оценить'}
      </button>

      <p className="form-hint">
        Отзыв откроется, когда вторую сторону тоже оценят — или через две недели.
      </p>
    </div>
  );
}