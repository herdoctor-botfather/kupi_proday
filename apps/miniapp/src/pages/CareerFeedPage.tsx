import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useDefaultCity } from '../lib/home-city';
import { useAsync, useDebounced } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { SearchInput } from '../components/SearchInput';
import { CategoryChips } from '../components/CategoryChips';
import { ChipsRow } from '../components/ChipsRow';
import { CitySheet } from '../components/CitySheet';
import { ListingCard } from '../components/ListingCard';
import { FeedMore } from '../components/Feed';
import { EmptyState } from '../components/states';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';

/** Сколько карточек показываем за раз. */
const FEED_PAGE_SIZE = 6;

/**
 * Витрина вакансий или резюме.
 *
 * Одна страница на обе стороны: списком они устроены одинаково, и
 * держать два почти одинаковых экрана значит однажды поправить только
 * один из них. Различаются заголовки и то, на что зовёт пустой экран.
 */
export function CareerFeedPage({ kind }: { kind: 'JOB' | 'RESUME' }) {
  const isAuthenticated = useIsAuthenticated();
  const [searchParams, setSearchParams] = useSearchParams();
  useDefaultCity(searchParams, setSearchParams);

  const categorySlug = searchParams.get('category') ?? undefined;
  const city = searchParams.get('city') ?? undefined;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebounced(query);
  const [citiesOpen, setCitiesOpen] = useState(false);

  const categories = useAsync(() => api.categories('JOB'), []);
  const cities = useAsync(() => api.listingCities(kind), [kind]);

  const feed = usePagedFeed(
    (page) =>
      api.listings({
        kind,
        pageSize: FEED_PAGE_SIZE,
        sort: 'new',
        page,
        q: debouncedQuery.trim() || undefined,
        categorySlug,
        city,
      }),
    [kind, debouncedQuery, categorySlug, city],
  );

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const isJobs = kind === 'JOB';

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Карьера</div>
        <h1 className="hero__title">{isJobs ? 'Вакансии' : 'Кто ищет работу'}</h1>
        <p className="hero__subtitle">
          {isJobs
            ? 'Работа от людей и компаний рядом — пишите прямо в приложении'
            : 'Люди в поиске работы: посмотрите, кто подойдёт, и напишите первым'}
        </p>
      </header>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={isJobs ? 'Кем хотите работать' : 'Кто вам нужен'}
      />

      <CategoryChips
        categories={categories.data ?? []}
        current={categorySlug}
        onChange={(slug) => setParam('category', slug)}
        allLabel="Все отрасли"
        stepsPath={isJobs ? '/career/jobs/c' : '/career/resumes/c'}
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
        <Link
          to={isJobs ? '/career/new-resume' : '/career/new-job'}
          className="profile-cta"
          onClick={() => haptic.tap()}
        >
          <span className="profile-cta__icon" aria-hidden>
            {isJobs ? '📄' : '💼'}
          </span>
          <span className="profile-cta__body">
            <span className="profile-cta__title">
              {isJobs ? 'Разместить резюме' : 'Разместить вакансию'}
            </span>
            <span className="profile-cta__text">
              {isJobs
                ? 'Бесплатно — работодатели напишут сами'
                : 'Опишите работу и оплату, отклики придут в чат'}
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
            icon={isJobs ? '💼' : '🙋'}
            title={debouncedQuery || categorySlug || city ? 'Ничего не нашли' : 'Здесь пока пусто'}
            hint={
              debouncedQuery || categorySlug || city
                ? 'Попробуйте другой запрос, отрасль или город'
                : isJobs
                  ? 'Вакансий ещё нет — разместите первую'
                  : 'Резюме ещё нет. Разместите своё — его увидят работодатели'
            }
          />
        )
      )}
    </div>
  );
}
