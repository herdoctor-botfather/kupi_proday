import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CategoryChips } from '../components/CategoryChips';
import { useDefaultCity } from '../lib/home-city';
import { useAsync, useDebounced } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { ChipsRow } from '../components/ChipsRow';
import { ListingCard } from '../components/ListingCard';
import { FeedMore } from '../components/Feed';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';
import { CitySheet } from '../components/CitySheet';

/** Сколько запросов показываем за раз. */
const FEED_PAGE_SIZE = 6;

/**
 * Обратная витрина: объявления тех, кто ищет вещь.
 *
 * Обычная доска устроена от предложения — продавец выкладывает товар и
 * ждёт покупателя. Здесь наоборот: цену и условие называет покупатель,
 * а продавец приходит с предложением. Для человека, у которого вещь
 * лежит без дела, это единственный способ узнать, что она кому-то
 * прямо сейчас нужна: искать её на витрине он бы не стал.
 *
 * Технически это те же объявления, только с другим направлением сделки,
 * поэтому и проверка модератором, и переписка здесь общие с продажей.
 */
export function WantedPage() {
  const isAuthenticated = useIsAuthenticated();
  const [searchParams, setSearchParams] = useSearchParams();
  useDefaultCity(searchParams, setSearchParams);
  const categorySlug = searchParams.get('category') ?? undefined;
  const city = searchParams.get('city') ?? undefined;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [citiesOpen, setCitiesOpen] = useState(false);
  const debouncedQuery = useDebounced(query);

  const categories = useAsync(() => api.categories('PRODUCT', 'BUY'), []);
  /*
   * Города запросов, а не всей барахолки: человек предлагает вещь, которую
   * держит в руках, и запрос из другого города для него бесполезен.
   * Координат у объявления нет — только город, указанный автором, — поэтому
   * «рядом» здесь определяется городом, а не расстоянием.
   */
  const cities = useAsync(() => api.listingCities('BUY'), []);
  const feed = usePagedFeed(
    (page) =>
      api.listings({
        kind: 'BUY',
        pageSize: FEED_PAGE_SIZE,
        sort: 'new',
        page,
        q: debouncedQuery.trim() || undefined,
        categorySlug,
        city,
      }),
    [debouncedQuery, categorySlug, city],
  );

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Спрос</div>
        <h1 className="hero__title">Запросы пользователей</h1>
        <p className="hero__subtitle">
          {feed.total > 0
            ? 'Кому-то нужна вещь, которая у вас уже есть — напишите и предложите'
            : 'Здесь появятся запросы других людей'}
        </p>
      </header>

      <SearchInput value={query} onChange={setQuery} placeholder="Что ищут" />

      <CategoryChips
        categories={categories.data ?? []}
        current={categorySlug}
        onChange={(slug) => setParam('category', slug)}
        stepsPath="/wanted/c"
        allLabel="Все"
      />

      {(cities.data?.length ?? 0) > 1 && (
        <ChipsRow>
          <button
            type="button"
            className={`chip${!city ? ' chip--active' : ''}`}
            onClick={() => setParam('city', null)}
          >
            Все города
          </button>
          {cities.data!.slice(0, 8).map((item) => (
            <button
              key={item.name}
              type="button"
              className={`chip${city === item.name ? ' chip--active' : ''}`}
              onClick={() => {
                haptic.tap();
                setParam('city', item.name);
              }}
            >
              {item.name} <span style={{ opacity: 0.6 }}>{item.count}</span>
            </button>
          ))}
          {/* Свой город человек ищет сам: в ряду только те, где уже
              что-то выложено, и остальных там не бывает по определению. */}
          <button type="button" className="chip" onClick={() => setCitiesOpen(true)}>
            Все города ›
          </button>
        </ChipsRow>
      )}

      {citiesOpen && (
        <CitySheet
          current={city}
          withCounts={cities.data ?? []}
          onPick={(value) => setParam('city', value)}
          onClose={() => setCitiesOpen(false)}
        />
      )}

      {isAuthenticated && (
        <Link to="/wanted/new" className="profile-cta" onClick={() => haptic.tap()}>
          <span className="profile-cta__icon" aria-hidden>
            📝
          </span>
          <span className="profile-cta__body">
            <span className="profile-cta__title">Создать запрос на покупку или обмен</span>
            <span className="profile-cta__text">
              Ищете что-то сами? Опишите — продавцы предложат
            </span>
          </span>
          <span className="profile-cta__chevron" aria-hidden>
            ›
          </span>
        </Link>
      )}

      {feed.items.length > 0 ? (
        <>
          <div style={{ color: 'var(--text-hint)', fontSize: 13, margin: '18px 0 12px' }}>
            Найдено: {feed.total}
          </div>
          <div className="listing-grid">
            {feed.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          <FeedMore feed={feed} />
        </>
      ) : (
        !feed.loading && (
          <EmptyState
            icon="🔎"
            title={debouncedQuery || categorySlug || city ? 'Ничего не нашли' : 'Запросов пока нет'}
            hint={
              debouncedQuery || categorySlug || city
                ? 'Попробуйте изменить запрос, выбрать другой город или снять фильтр'
                : 'Создайте первый — продавцы увидят его и откликнутся'
            }
          />
        )
      )}
    </div>
  );
}
