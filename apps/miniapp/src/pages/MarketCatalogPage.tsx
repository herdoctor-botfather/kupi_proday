import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { CitySheet } from '../components/CitySheet';
import { useAsync } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { AsyncContent, EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { ListingCard } from '../components/ListingCard';
import { FeedHeader, FeedMore } from '../components/Feed';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';

/* Обложки категорий товаров — через сборку, как и у услуг: своё имя
   у каждой версии файла, поэтому обновлённая картинка не застревает
   в кэше на год. */
const COVERS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/goods/*.jpg', { eager: true, import: 'default' }),
  ).map(([path, url]) => [path.replace(/^.*\/|\.jpg$/g, ''), url]),
);

const coverOf = (slug: string): string | undefined => COVERS[slug] ?? COVERS['other-goods'];

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
  const [citiesOpen, setCitiesOpen] = useState(false);
  /** Список городов на главной свёрнут в одну строку. */
  const [cityListOpen, setCityListOpen] = useState(false);
  const feed = usePagedFeed(
    (page) => api.listings({ pageSize: FEED_PAGE_SIZE, sort: 'new', page }),
    [],
  );

  /** Запросы на покупку — встречная сторона витрины. */
  const wanted = usePagedFeed(
    (page) => api.listings({ kind: 'BUY', pageSize: 4, sort: 'new', page }),
    [],
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) navigate(`/market/listings?q=${encodeURIComponent(trimmed)}`);
  };

  /*
   * Показываем все разделы, непустые первыми.
   *
   * Раньше пустые прятались, и человек с машиной или гаражом видел
   * витрину без «Транспорта» и «Недвижимости» — и уходил, решив, что
   * такое здесь не продают. Пустой раздел не обещает выбора, он
   * очерчивает, что площадка вообще принимает, и зовёт быть первым.
   */
  const all = categories.data ?? [];
  const filled = all.filter((category) => category.itemCount > 0);
  const sections = [...filled, ...all.filter((category) => category.itemCount === 0)];
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
          ) : (
            <div className="categories">
              {sections.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="category category--photo"
                  style={{
                    ...categoryStyle(category.slug),
                    backgroundImage: `url(${coverOf(category.slug)})`,
                  }}
                  onClick={() => {
                    haptic.tap();
                    navigate(`/market/c/${category.slug}`);
                  }}
                >
                  <span className="category__name">{category.name}</span>
                  <span className="category__count">
                    {category.itemCount > 0
                      ? `${category.itemCount} ${pluralize(category.itemCount, ['объявление', 'объявления', 'объявлений'])}`
                      : 'Пока пусто'}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </AsyncContent>

      {/* Города заменяют «Найти рядом» из услуг: geolocation тут не поможет —
          у товара нет координат, только город, указанный продавцом. */}
      {/* Раскрывающимся списком, а не строкой чипов: в строку помещалось
          два-три города, остальные прятались за прокруткой вбок. */}
      {(cities.data?.length ?? 0) > 1 && (
        <>
          <button
            type="button"
            className={`industry-toggle${cityListOpen ? ' industry-toggle--open' : ''}`}
            aria-expanded={cityListOpen}
            onClick={() => {
              haptic.tap();
              setCityListOpen((open) => !open);
            }}
          >
            <span>📍 Объявления по городам</span>
            <span className="industry-toggle__side">
              {cityListOpen ? 'Свернуть' : `${cities.data!.length} ${pluralize(cities.data!.length, ['город', 'города', 'городов'])}`}
              <span className="industry-toggle__arrow" aria-hidden>
                ▾
              </span>
            </span>
          </button>
          {cityListOpen && (
            <div className="steps">
              {cities.data!.slice(0, CITIES_SHOWN).map((city) => (
                <button
                  key={city.name}
                  type="button"
                  className="step"
                  onClick={() => {
                    haptic.tap();
                    navigate(`/market/listings?city=${encodeURIComponent(city.name)}`);
                  }}
                >
                  <span className="step__name">{city.name}</span>
                  <span className="step__side">
                    <span className="step__count">{city.count}</span>
                    <span className="step__chevron" aria-hidden>
                      ›
                    </span>
                  </span>
                </button>
              ))}
              <button type="button" className="step" onClick={() => setCitiesOpen(true)}>
                <span className="step__name">Все города</span>
                <span className="step__side">
                  <span className="step__chevron" aria-hidden>
                    ›
                  </span>
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {citiesOpen && (
        <CitySheet
          withCounts={cities.data ?? []}
          onPick={(value) => {
            navigate(value ? `/market/listings?city=${encodeURIComponent(value)}` : '/market/listings');
          }}
          onClose={() => setCitiesOpen(false)}
        />
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
            title="Объявлений пока нет — будьте первым"
            hint="Сфотографируйте вещь — объявление по фото составит ИИ, за минуту и бесплатно."
            action={{ label: 'Выложить вещь', to: '/market/sell' }}
          />
        )
      )}

      {/* Спрос — после объявлений: на витрину приходят прежде всего за
          товаром, а встречные запросы — дополнение, которое видит тот,
          кто долистал. */}
      {/*
        Встречный спрос на витрине.

        Продавец приходит смотреть, «сколько такое стоит», и видит заодно
        людей, которым его вещь нужна прямо сейчас. Это и есть повод
        выложить: не в пустоту, а тем, кто уже ждёт.
      */}
      {wanted.items.length > 0 && (
        <>
          <FeedHeader title="Сейчас ищут" to="/wanted" total={wanted.total} />
          <div className="listing-grid">
            {wanted.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
