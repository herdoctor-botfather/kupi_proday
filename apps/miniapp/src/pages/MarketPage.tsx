import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';

/**
 * Вход в раздел объявлений: покупаю или продаю.
 *
 * Развилка отдельным экраном, а не двумя вкладками: у покупателя и продавца
 * разные задачи, и смешивать витрину с формой размещения значит мешать обоим.
 */
export function MarketPage() {
  const isAuthenticated = useIsAuthenticated();
  // Счётчик своих объявлений подсказывает, что уже размещено.
  const myListings = useAsync(
    () => (isAuthenticated ? api.myListings() : Promise.resolve([])),
    [isAuthenticated],
  );

  const active = (myListings.data ?? []).filter((listing) => listing.status === 'ACTIVE').length;
  const pending = (myListings.data ?? []).filter((listing) => listing.status === 'PENDING').length;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Купи-продай</div>
        <h1 className="hero__title">Объявления</h1>
        <p className="hero__subtitle">Товары от людей рядом — без посредников и комиссий</p>
      </header>

      <div className="role-cards">
        <Link to="/market/browse" className="role-card" onClick={() => haptic.tap()}>
          <span className="role-card__emoji" aria-hidden>
            🛍
          </span>
          <span className="role-card__title">Я покупаю</span>
          <span className="role-card__text">
            Каталог товаров по категориям, поиск и фильтры по цене и состоянию
          </span>
          <span className="role-card__action">Открыть каталог →</span>
        </Link>

        <Link to="/market/my" className="role-card" onClick={() => haptic.tap()}>
          <span className="role-card__emoji" aria-hidden>
            🏷
          </span>
          <span className="role-card__title">Я продаю</span>
          <span className="role-card__text">
            {active > 0 || pending > 0
              ? `У вас ${active} на витрине${pending > 0 ? `, ${pending} на проверке` : ''}`
              : 'Разместите объявление: название, фотографии, цена. Публикация после проверки'}
          </span>
          <span className="role-card__action">
            {active > 0 || pending > 0 ? 'Мои объявления →' : 'Разместить объявление →'}
          </span>
        </Link>
      </div>

      <p className="onboarding__note">
        Покупатель и продавец общаются в чате приложения — переписка сохраняется, и в спорной
        ситуации есть на что сослаться.
      </p>
    </div>
  );
}
