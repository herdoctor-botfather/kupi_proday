import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';
import { pluralize } from '../lib/format';

/**
 * Вход в раздел спроса: создать свой запрос или посмотреть чужие.
 *
 * Развилка отдельным экраном, как и в барахолке: у того, кто ищет вещь,
 * и у того, кто пришёл посмотреть чужие запросы, разные задачи, и
 * сваливать форму и витрину на один экран значит мешать обоим.
 */
export function WantedHubPage() {
  const isAuthenticated = useIsAuthenticated();
  const shelf = useAsync(() => api.listings({ kind: 'BUY', pageSize: 1 }), []);
  const total = shelf.data?.total ?? 0;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Спрос</div>
        <h1 className="hero__title">Люди ищут прямо сейчас</h1>
        <p className="hero__subtitle">
          {total > 0
            ? `${total} ${pluralize(total, ['запрос', 'запроса', 'запросов'])} от людей рядом`
            : 'Здесь люди пишут, что хотят купить прямо сейчас'}
        </p>
      </header>

      <div className="role-cards">
        <Link
          to={isAuthenticated ? '/wanted/new' : '/profile'}
          className="role-card role-card--scene"
          style={{ backgroundImage: 'url(/cards/wanted-new.jpg)' }}
          onClick={() => haptic.tap()}
        >
          <span className="role-card__title">Создать запрос на покупку или обмен</span>
          <span className="role-card__text">
            Опишите, что ищете и что готовы предложить — деньги или вещь на обмен
          </span>
          <span className="role-card__action">Заполнить форму →</span>
        </Link>

        <Link
          to="/wanted/browse"
          className="role-card role-card--scene"
          style={{ backgroundImage: 'url(/cards/wanted-browse.jpg)' }}
          onClick={() => haptic.tap()}
        >
          <span className="role-card__title">Запросы пользователей</span>
          <span className="role-card__text">
            Что ищут другие: по категориям, с поиском и фильтрами — вдруг это у вас есть
          </span>
          <span className="role-card__action">
            {total > 0 ? `Смотреть все ${total} →` : 'Открыть список →'}
          </span>
        </Link>
      </div>

      <p className="onboarding__note">
        Договариваются здесь же, во встроенном чате — переписка сохраняется, и в спорной
        ситуации есть на что сослаться.
      </p>
    </div>
  );
}
