import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ChipsRow } from '../components/ChipsRow';
import { usePagedFeed } from '../lib/usePagedFeed';
import { AsyncContent, EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { ListingCard } from '../components/ListingCard';
import { FeedHeader, FeedMore } from '../components/Feed';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';

/** Сколько городов показываем: длинный список превращается в стену чипов. */
const CITIES_SHOWN = 8;

/** Сколько объявлений лента показывает за раз. */
const FEED_PAGE_SIZE = 6;

/**
 * Каталог товаров — то же, что главный экран услуг, только для покупателя.
 *
 * Раньше «Я покупаю» вело сразу в ленту со всеми объявлениями. Пока их
 * десяток, разницы нет, но с ростом витрины лента перестаёт отвечать на
 * вопрос «что тут вообще продают»: человек листает случайный поток вместо
 * того, чтобы зайти в нужный раздел. Категории отвечают на этот вопрос сразу.
 */
export function MarketCatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const categories = useAsync(() => api.categories('PRODUCT'), []);
  const cities = useAsync(() => api.listingCities(), []);
  const feed = usePagedFeed(
    (page) => api.listings({ pageSize: FEED_PAGE_SIZE, sort: 'new', page }),
    [],
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) navigate(`/market/listings?q=${encodeURIComponent(trimmed)}`);
  };

  // Пустые категории показывать незачем — в услугах то же правило.
  const filled = (categories.data ?? []).filter((category) => category.itemCount > 0);
  const total = filled.reduce((sum, category) => sum + category.itemCount, 0);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Купи-продай</div>
        <h1 className="hero__title">Что ищете?</h1>
        <p className="hero__subtitle">
          {total > 0
            ? `${total} ${pluralize(total, ['объявление', 'объявления', 'объявлений'])} от людей рядом`
            : 'Товары от людей рядом — без посредников и комиссий'}
        </p>
      </header>

      <form onSubmit={submitSearch}>
        <SearchInput value={query} onChange={setQuery} placeholder="Название товара" />
      </form>

      <h2 className="section-title">Категории</h2>

      <AsyncContent state={categories}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="📭" title="Категории ещё не заведены" hint="Добавьте их в админ-панели" />
          ) : filled.length === 0 ? (
            <EmptyState
              icon="📦"
              title="Объявлений пока нет"
              hint="Разместите первое — оно появится здесь после проверки"
            />
          ) : (
            <div className="categories">
              {filled.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="category"
                  style={categoryStyle(category.slug)}
                  onClick={() => {
                    haptic.tap();
                    navigate(`/market/listings?category=${category.slug}`);
                  }}
                >
                  <span className="category__icon" aria-hidden>
                    {category.icon}
                  </span>
                  <span className="category__name">{category.name}</span>
                  <span className="category__count">
                    {category.itemCount}{' '}
                    {pluralize(category.itemCount, ['объявление', 'объявления', 'объявлений'])}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </AsyncContent>

      {/* Города заменяют «Найти рядом» из услуг: geolocation тут не поможет —
          у товара нет координат, только город, указанный продавцом. */}
      {(cities.data?.length ?? 0) > 1 && (
        <>
          <h2 className="section-title">Города</h2>
          <ChipsRow>
            {cities.data!.slice(0, CITIES_SHOWN).map((city) => (
              <button
                key={city.name}
                type="button"
                className="chip"
                onClick={() => {
                  haptic.tap();
                  navigate(`/market/listings?city=${encodeURIComponent(city.name)}`);
                }}
              >
                {city.name} · {city.count}
              </button>
            ))}
          </ChipsRow>
        </>
      )}

      {/* Лента новых объявлений.
          Категории и города отвечают на вопрос «где искать», но не на
          вопрос «что тут вообще продают». Тому, кто зашёл посмотреть,
          а не за конкретной вещью, нужен именно товар перед глазами. */}
      <FeedHeader title="Новые объявления" to="/market/listings" total={feed.total} />

      {feed.items.length > 0 ? (
        <>
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
            icon="📦"
            title="Объявлений пока нет"
            hint="Разместите первое — оно появится здесь после проверки"
          />
        )
      )}
    </div>
  );
}
