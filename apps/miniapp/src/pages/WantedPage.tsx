import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CityButton } from '../components/CityButton';
import { useDefaultCity } from '../lib/home-city';
import { useAsync, useDebounced } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { EmptyState } from '../components/states';
import { DropdownList } from '../components/DropdownList';
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
  useDefaultCity(searchParams, setSearchParams);
  const categorySlug = searchParams.get('category') ?? undefined;
  const city = searchParams.get('city') ?? undefined;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebounced(query);

  const navigate = useNavigate();
  const categories = useAsync(() => api.categories('PRODUCT', 'BUY'), []);

  /** Название выбранного раздела или полки — для строки сброса. */
  const categoryName = (categories.data ?? [])
    .flatMap((root) => [root, ...(root.children ?? [])])
    .find((item) => item.slug === categorySlug)?.name;
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

      {/*
        Разделы — раскрывающимся списком: столбец из одиннадцати строк
        отодвигал сами запросы на экран вниз, а строка чипов прятала
        половину разделов за прокруткой. Выбор раздела ведёт дальше — к
        полкам внутри него, как в остальных дверях.
      */}
      {(categories.data?.length ?? 0) > 0 && (
        <DropdownList
          label={categoryName ? `🗂 ${categoryName}` : '🗂 Раздел: все'}
          allLabel="Все разделы"
          noun="разделов"
          selectedKey={categorySlug ?? null}
          items={(categories.data ?? []).map((category) => ({
            key: category.slug,
            label: `${category.icon} ${category.name}`,
            count: category.itemCount,
          }))}
          onPick={(slug) => (slug ? navigate(`/wanted/c/${slug}`) : setParam('category', null))}
        />
      )}

      <CityButton
        value={city}
        counts={cities.data ?? []}
        onChange={(value) => setParam('city', value)}
      />

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
                : 'Напишите, что ищете, — продавцы увидят запрос и откликнутся. Это бесплатно.'
            }
            action={
              debouncedQuery || categorySlug || city ? undefined : { label: 'Создать запрос', to: '/wanted/new' }
            }
          />
        )
      )}
    </div>
  );
}
