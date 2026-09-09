import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NEARBY_RADII_KM, type SpecialistListItem } from '@app/shared';
import { api, type SpecialistFilters } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { ChipsRow } from '../components/ChipsRow';
import { SpecialistCard } from '../components/SpecialistCard';

type Sort = NonNullable<SpecialistFilters['sort']>;

const SORT_LABELS: Record<Sort, string> = {
  rating: 'По рейтингу',
  reviews: 'По отзывам',
  distance: 'Ближайшие',
  new: 'Новые',
};

/**
 * Список специалистов. Фильтры живут в адресной строке, поэтому экран
 * восстанавливается по ссылке и корректно работает с кнопкой «Назад».
 */
export function SpecialistsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const categorySlug = searchParams.get('category') ?? undefined;
  const city = searchParams.get('city') ?? undefined;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const hasCoords = lat !== null && lng !== null;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebounced(query);

  const sort = (searchParams.get('sort') as Sort | null) ?? (hasCoords ? 'distance' : 'rating');
  const minRating = searchParams.get('minRating');
  const radiusKm = Number(searchParams.get('radiusKm') ?? 10);

  // Догрузка следующих страниц — состояние экрана, а не часть ссылки.
  const [page, setPage] = useState(1);
  const [loadedItems, setLoadedItems] = useState<SpecialistListItem[]>([]);

  const filterKey = [debouncedQuery, categorySlug, city, sort, minRating, lat, lng, radiusKm].join('|');

  // Любое изменение фильтров начинает выдачу заново.
  useEffect(() => {
    setPage(1);
    setLoadedItems([]);
  }, [filterKey]);

  const result = useAsync(
    () =>
      api.specialists({
        q: debouncedQuery.trim() || undefined,
        categorySlug,
        city,
        sort,
        minRating: minRating ? Number(minRating) : undefined,
        page,
        ...(hasCoords ? { lat: Number(lat), lng: Number(lng), radiusKm } : {}),
      }),
    [filterKey, page],
  );

  // Первая страница заменяет список, последующие — дополняют.
  useEffect(() => {
    if (!result.data) return;
    setLoadedItems((prev) => (result.data!.page === 1 ? result.data!.items : [...prev, ...result.data!.items]));
  }, [result.data]);

  /** Меняет один параметр в URL, сохраняя остальные. */
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  // Без координат сортировка по расстоянию недоступна.
  const availableSorts: Sort[] = hasCoords
    ? ['distance', 'rating', 'reviews', 'new']
    : ['rating', 'reviews', 'new'];

  return (
    <div className="page">
      <SearchInput value={query} onChange={setQuery} />

      <ChipsRow>
        {availableSorts.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${sort === option ? ' chip--active' : ''}`}
            onClick={() => setParam('sort', option)}
          >
            {SORT_LABELS[option]}
          </button>
        ))}
      </ChipsRow>

      <CityFilter current={city} onChange={(value) => setParam('city', value)} />

      <ChipsRow>
        <button
          type="button"
          className={`chip${!minRating ? ' chip--active' : ''}`}
          onClick={() => setParam('minRating', null)}
        >
          Любой рейтинг
        </button>
        {[4, 4.5].map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${minRating === String(value) ? ' chip--active' : ''}`}
            onClick={() => setParam('minRating', String(value))}
          >
            ★ {value}+
          </button>
        ))}
        {categorySlug && (
          <button type="button" className="chip chip--active" onClick={() => setParam('category', null)}>
            Категория ✕
          </button>
        )}
      </ChipsRow>

      {hasCoords && (
        <ChipsRow>
          {NEARBY_RADII_KM.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip${radiusKm === value ? ' chip--active' : ''}`}
              onClick={() => setParam('radiusKm', String(value))}
            >
              до {value} км
            </button>
          ))}
        </ChipsRow>
      )}

      <AsyncContent state={result}>
        {(pageData) =>
          loadedItems.length === 0 ? (
            <EmptyState
              title="Никого не нашли"
              hint={
                hasCoords
                  ? 'Попробуйте увеличить радиус поиска или снять фильтры'
                  : 'Попробуйте изменить запрос или снять фильтры'
              }
            />
          ) : (
            <>
              <div style={{ color: 'var(--text-hint)', fontSize: 13, marginBottom: 12 }}>
                Найдено: {pageData.total}
              </div>
              <div className="card-list">
                {loadedItems.map((specialist) => (
                  <SpecialistCard key={specialist.id} specialist={specialist} />
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

/**
 * Фильтр по городу. Показывает только те города, где действительно есть
 * карточки, — предлагать пустую выдачу бессмысленно.
 */
function CityFilter({ current, onChange }: { current?: string; onChange: (city: string | null) => void }) {
  const cities = useAsync(() => api.cities(), []);
  const list = cities.data ?? [];

  if (list.length <= 1) return null;

  return (
    <ChipsRow>
      <button
        type="button"
        className={`chip${!current ? ' chip--active' : ''}`}
        onClick={() => onChange(null)}
      >
        Все города
      </button>
      {list.slice(0, 8).map((city) => (
        <button
          key={city.name}
          type="button"
          className={`chip${current === city.name ? ' chip--active' : ''}`}
          onClick={() => onChange(city.name)}
        >
          {city.name} <span style={{ opacity: 0.6 }}>{city.count}</span>
        </button>
      ))}
    </ChipsRow>
  );
}
