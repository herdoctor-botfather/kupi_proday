import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { ListingCard } from '../components/ListingCard';
import { FeedMore } from '../components/Feed';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';

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
  const categorySlug = searchParams.get('category') ?? undefined;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebounced(query);

  const categories = useAsync(() => api.categories('PRODUCT'), []);
  const feed = usePagedFeed(
    (page) =>
      api.listings({
        kind: 'BUY',
        pageSize: FEED_PAGE_SIZE,
        sort: 'new',
        page,
        q: debouncedQuery.trim() || undefined,
        categorySlug,
      }),
    [debouncedQuery, categorySlug],
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

      {categories.data && categories.data.length > 0 && (
        <div className="chips">
          <button
            type="button"
            className={`chip${!categorySlug ? ' chip--active' : ''}`}
            onClick={() => setParam('category', null)}
          >
            Все
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

      {isAuthenticated && (
        <Link to="/wanted/new" className="profile-cta" onClick={() => haptic.tap()}>
          <span className="profile-cta__icon" aria-hidden>
            📝
          </span>
          <span className="profile-cta__body">
            <span className="profile-cta__title">Создать запрос на покупку</span>
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
            title={debouncedQuery || categorySlug ? 'Ничего не нашли' : 'Запросов пока нет'}
            hint={
              debouncedQuery || categorySlug
                ? 'Попробуйте изменить запрос или снять фильтр'
                : 'Создайте первый — продавцы увидят его и откликнутся'
            }
          />
        )
      )}
    </div>
  );
}
