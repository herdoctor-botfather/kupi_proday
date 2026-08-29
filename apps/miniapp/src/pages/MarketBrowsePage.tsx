import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LISTING_CONDITIONS, type ListingListItem } from '@app/shared';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { ListingCard } from '../components/ListingCard';
import { haptic } from '../lib/telegram';

const SORT_LABELS = { new: 'Новые', cheap: 'Сначала дешёвые', expensive: 'Сначала дорогие' } as const;
type Sort = keyof typeof SORT_LABELS;

/** Витрина объявлений с поиском и фильтрами. Фильтры живут в адресной строке. */
export function MarketBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categorySlug = searchParams.get('category') ?? undefined;
  const city = searchParams.get('city') ?? undefined;
  const condition = searchParams.get('condition') ?? undefined;
  const sort = (searchParams.get('sort') as Sort | null) ?? 'new';

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<ListingListItem[]>([]);

  const categories = useAsync(() => api.categories('PRODUCT'), []);
  const filterKey = [debouncedQuery, categorySlug, city, condition, sort].join('|');

  useEffect(() => {
    setPage(1);
    setLoaded([]);
  }, [filterKey]);

  const result = useAsync(
    () =>
      api.listings({
        q: debouncedQuery.trim() || undefined,
        categorySlug,
        city,
        condition,
        sort,
        page,
      }),
    [filterKey, page],
  );

  useEffect(() => {
    if (!result.data) return;
    setLoaded((prev) => (result.data!.page === 1 ? result.data!.items : [...prev, ...result.data!.items]));
  }, [result.data]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="page">
      <SearchInput value={query} onChange={setQuery} placeholder="Что ищете?" />

      {categories.data && categories.data.length > 0 && (
        <div className="chips">
          <button
            type="button"
            className={`chip${!categorySlug ? ' chip--active' : ''}`}
            onClick={() => setParam('category', null)}
          >
            Все категории
          </button>
          {categories.data.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`chip${categorySlug === category.slug ? ' chip--active' : ''}`}
              onClick={() => {
                haptic.tap();
                setParam('category', category.slug);
              }}
            >
              {category.icon} {category.name}
            </button>
          ))}
        </div>
      )}

      {/* Город приходит из каталога и снимается только здесь — без этого
          фильтр остался бы включённым молча. */}
      {city && (
        <div className="chips">
          <button type="button" className="chip chip--active" onClick={() => setParam('city', null)}>
            📍 {city} ✕
          </button>
        </div>
      )}

      <div className="chips">
        {(Object.keys(SORT_LABELS) as Sort[]).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${sort === option ? ' chip--active' : ''}`}
            onClick={() => setParam('sort', option)}
          >
            {SORT_LABELS[option]}
          </button>
        ))}
        {LISTING_CONDITIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`chip${condition === option.value ? ' chip--active' : ''}`}
            onClick={() => setParam('condition', condition === option.value ? null : option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <AsyncContent state={result}>
        {(pageData) =>
          loaded.length === 0 ? (
            <EmptyState
              icon="🛍"
              title="Ничего не нашли"
              hint="Попробуйте изменить запрос или снять фильтры"
            />
          ) : (
            <>
              <div style={{ color: 'var(--text-hint)', fontSize: 13, marginBottom: 12 }}>
                Найдено: {pageData.total}
              </div>

              <div className="listing-grid">
                {loaded.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {pageData.hasMore && (
                <button
                  type="button"
                  className="button button--secondary"
                  style={{ marginTop: 16 }}
                  disabled={result.loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {result.loading ? 'Загружаем...' : 'Показать ещё'}
                </button>
              )}
            </>
          )
        }
      </AsyncContent>
    </div>
  );
}
