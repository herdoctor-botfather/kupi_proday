import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { usePagedFeed } from '../lib/usePagedFeed';
import { EmptyState } from '../components/states';
import { ListingCard } from '../components/ListingCard';
import { FeedMore } from '../components/Feed';
import { haptic } from '../lib/telegram';

/** Сколько карточек показывает витрина за раз. */
const PAGE_SIZE = 12;

/**
 * Витрина срочного.
 *
 * Отдельный раздел, а не пометка на общей витрине. Причина не в оформлении:
 * сюда приходят с готовым намерением успеть, и здесь каждое объявление —
 * повод поторопиться. На общей витрине такая вещь теряется среди тех,
 * что висят месяцами.
 *
 * Срочность истекает через неделю сама. Раздел, где «срочное» месячной
 * давности, перестаёт что-либо значить, и вместе с ним обесценивается
 * пометка на всех остальных.
 */
export function UrgentSalePage() {
  const navigate = useNavigate();
  const feed = usePagedFeed(
    (page) => api.listings({ kind: 'SELL', urgent: true, pageSize: PAGE_SIZE, page }),
    [],
  );

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">⚡️ Надо продать срочно</div>
        <p className="hero__subtitle">
          Вещи, которые отдают быстрее и дешевле. Продавец торопится — значит,
          торопиться выгодно и вам
        </p>
      </header>

      {feed.items.length === 0 && !feed.loading ? (
        <>
          <EmptyState
            icon="⚡️"
            title="Пока никто не торопится"
            hint="Здесь появятся вещи, которые продают срочно. Загляните позже — или выставьте своё."
          />
          <button
            type="button"
            className="button"
            onClick={() => {
              haptic.tap();
              navigate('/market/sell');
            }}
          >
            Продать своё срочно
          </button>
        </>
      ) : (
        <>
          <div className="listing-grid">
            {feed.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          <FeedMore feed={feed} />
        </>
      )}
    </div>
  );
}
