import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { AsyncContent, EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { SpecialistCard } from '../components/SpecialistCard';
import { FeedHeader, FeedMore } from '../components/Feed';
import { useGeolocation } from '../lib/geolocation';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';
import { useAuth } from '../lib/auth';

/** Сколько карточек показывает лента за раз. */
const FEED_PAGE_SIZE = 4;

/**
 * Главный экран.
 *
 * Наверху — три двери в разделы, дальше поиск и категории, внизу — лента
 * мастеров. Она отвечает на вопрос «что здесь вообще есть» тем, кто пришёл
 * без запроса: пустой поиск и сетка категорий этого не показывают,
 * а живые карточки показывают сразу.
 *
 * Товары в ленту не попадают: сюда приходят по кнопке «я ищу специалиста»,
 * и объявления о продаже дивана здесь не к месту. Их лента живёт
 * в «Купи-продай» — там она и ожидается.
 */
export function CatalogPage() {
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const [query, setQuery] = useState('');
  const geo = useGeolocation();

  const categories = useAsync(() => api.categories(), []);

  const services = usePagedFeed(
    (page) => api.specialists({ pageSize: FEED_PAGE_SIZE, page }),
    [],
  );

  // Координаты приходят асинхронно — переход делаем эффектом, а не в рендере.
  useEffect(() => {
    if (!geo.coords) return;
    const { lat, lng } = geo.coords;
    geo.clear();
    navigate(`/specialists?lat=${lat}&lng=${lng}&sort=distance`);
  }, [geo.coords, geo.clear, navigate]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) navigate(`/specialists?q=${encodeURIComponent(trimmed)}`);
  };

  const applyTo = user?.hasSpecialistProfile ? '/profile/my-card' : '/profile/application';

  return (
    <div className="page">
      {/* Выбор роли повторяет стартовый экран, но в сжатом виде: открыв
          приложение по ссылке из бота, человек стартовый экран не видит,
          и без этих кнопок остаётся запертым в одном разделе. */}
      <nav className="role-row">
        <Link to="/specialists" className="role-mini" onClick={() => haptic.tap()}>
          <span className="role-mini__emoji" aria-hidden>
            🔎
          </span>
          <span className="role-mini__label">Я ищу специалиста</span>
        </Link>

        <Link
          to={status === 'authenticated' ? applyTo : '/profile'}
          className="role-mini"
          onClick={() => haptic.tap()}
        >
          <span className="role-mini__emoji" aria-hidden>
            🛠
          </span>
          <span className="role-mini__label">Я оказываю услуги</span>
        </Link>

        <Link to="/market" className="role-mini" onClick={() => haptic.tap()}>
          <span className="role-mini__emoji" aria-hidden>
            🛍
          </span>
          <span className="role-mini__label">Купи-продай</span>
        </Link>

        <Link to="/wanted" className="role-mini" onClick={() => haptic.tap()}>
          <span className="role-mini__emoji" aria-hidden>
            🔎
          </span>
          <span className="role-mini__label">Люди ищут сейчас</span>
        </Link>
      </nav>

      <form onSubmit={submitSearch}>
        <SearchInput value={query} onChange={setQuery} />
      </form>

      <button
        type="button"
        className="button"
        onClick={() => {
          haptic.tap();
          geo.request();
        }}
        disabled={geo.loading}
      >
        {geo.loading ? 'Определяем местоположение...' : '📍 Найти рядом'}
      </button>
      {geo.error && <div style={{ color: 'var(--destructive)', fontSize: 13, marginTop: 8 }}>{geo.error}</div>}

      <h2 className="section-title">Категории</h2>

      <AsyncContent state={categories}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="📭" title="Категории ещё не заведены" hint="Добавьте их в админ-панели" />
          ) : (
            <div className="categories">
              {items.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="category"
                  style={categoryStyle(category.slug)}
                  onClick={() => {
                    haptic.tap();
                    navigate(`/specialists?category=${category.slug}`);
                  }}
                >
                  <span className="category__icon" aria-hidden>
                    {category.icon}
                  </span>
                  <span className="category__name">{category.name}</span>
                  <span className="category__count">
                    {category.itemCount}{' '}
                    {pluralize(category.itemCount, ['мастер', 'мастера', 'мастеров'])}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </AsyncContent>

      <FeedHeader title="Мастера" to="/specialists" total={services.total} />
      {services.items.length > 0 ? (
        <>
          <div className="card-list">
            {services.items.map((specialist) => (
              <SpecialistCard key={specialist.id} specialist={specialist} />
            ))}
          </div>
          <FeedMore feed={services} />
        </>
      ) : (
        !services.loading && (
          <EmptyState icon="🛠" title="Мастеров пока нет" hint="Загляните позже — каталог пополняется" />
        )
      )}
    </div>
  );
}
