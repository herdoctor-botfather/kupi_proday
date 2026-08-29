import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const { user, status } = useAuth();
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
                    {category.itemCount}{' '}
                    {pluralize(category.itemCount, ['мастер', 'мастера', 'мастеров'])}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </AsyncContent>

      {/* Вход в исполнители с главной.
          Раньше единственной дверью туда был стартовый экран выбора роли,
          но открытие по ссылке из бота его пропускает: человек уже сказал,
          что ищет мастера. Без этой ссылки он не узнал бы, что здесь можно
          и разместить свою анкету. */}
      {status === 'authenticated' && (
        <Link to="/profile/my-card" className="profile-cta" onClick={() => haptic.tap()}>
          <span className="profile-cta__icon" aria-hidden>
            🛠
          </span>
          <span className="profile-cta__body">
            <span className="profile-cta__title">
              {user?.hasSpecialistProfile ? 'Моя анкета исполнителя' : 'Сами оказываете услуги?'}
            </span>
            <span className="profile-cta__text">
              {user?.hasSpecialistProfile
                ? 'Статус публикации, просмотры и редактирование'
                : 'Разместите анкету — вас будут находить клиенты'}
            </span>
          </span>
          <span className="profile-cta__chevron" aria-hidden>
            ›
          </span>
        </Link>
      )}
    </div>
  );
}
