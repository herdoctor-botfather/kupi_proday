import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ListingCard } from '../components/ListingCard';
import { pluralize } from '../lib/format';

/**
 * Товары и запросы человека.
 *
 * Один человек может чинить проводку, продавать плиту и искать велосипед.
 * Раньше это жило на разных страницах, и посетитель анкеты не знал, что
 * у мастера есть что купить, а покупатель плиты — что её хозяин берётся
 * за работу. Поэтому блок один и вставляется всюду, где показывают
 * человека: анкета и профиль перестают быть разными людьми.
 */
export function PersonListings({ userId }: { userId: string }) {
  const sell = useAsync(() => api.listings({ kind: 'SELL', sellerId: userId, pageSize: 50 }), [userId]);
  const wanted = useAsync(() => api.listings({ kind: 'BUY', sellerId: userId, pageSize: 50 }), [userId]);

  const forSale = sell.data?.items ?? [];
  const looking = wanted.data?.items ?? [];

  if (forSale.length === 0 && looking.length === 0) return null;

  return (
    <>
      {forSale.length > 0 && (
        <>
          <h2 className="section-title">
            {forSale.length} {pluralize(forSale.length, ['объявление', 'объявления', 'объявлений'])}
          </h2>
          <div className="listing-grid">
            {forSale.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </>
      )}

      {looking.length > 0 && (
        <>
          <h2 className="section-title">Ищет</h2>
          <div className="listing-grid">
            {looking.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
