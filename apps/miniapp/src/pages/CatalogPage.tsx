import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { SearchInput } from '../components/SearchInput';
import { useGeolocation } from '../lib/geolocation';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';
import { useAuth } from '../lib/auth';

/** Главный экран: категории услуг, поиск и переход к поиску рядом. */
/** Приветствие по времени суток — мелочь, но приложение перестаёт быть безликим. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function CatalogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const geo = useGeolocation();
  const categories = useAsync(() => api.categories(), []);

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

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">
          {greeting()}
          {user?.firstName ? `, ${user.firstName}` : ''}
        </div>
        <h1 className="hero__title">Найдите своего мастера</h1>
        <p className="hero__subtitle">Проверенные специалисты с отзывами — рядом с вами</p>
      </header>

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
                    {category.specialistCount}{' '}
                    {pluralize(category.specialistCount, ['мастер', 'мастера', 'мастеров'])}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </AsyncContent>
    </div>
  );
}
