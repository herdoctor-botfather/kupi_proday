import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { haptic } from '../lib/telegram';
import { useAuth, useIsAuthenticated } from '../lib/auth';

/**
 * Вход в раздел объявлений: покупаю или продаю.
 *
 * Развилка отдельным экраном, а не двумя вкладками: у покупателя и продавца
 * разные задачи, и смешивать витрину с формой размещения значит мешать обоим.
 */
export function MarketPage() {
  const isAuthenticated = useIsAuthenticated();
  const { user } = useAuth();
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

      {/* Выходы в соседний раздел.
          Открыв «Купи-продай» прямо из бота, человек минует стартовый экран
          выбора роли — и возвращаться ему некуда: он там ни разу не был.
          Без этих ссылок барахолка выглядела бы отдельным приложением,
          из которого до услуг не добраться. */}
      <h2 className="section-title">Не только вещи</h2>

      <Link to="/" className="profile-cta" onClick={() => haptic.tap()}>
        <span className="profile-cta__icon" aria-hidden>
          🔎
        </span>
        <span className="profile-cta__body">
          <span className="profile-cta__title">Найти исполнителя</span>
          <span className="profile-cta__text">
            Мастера по категориям — с отзывами, ценами и картой
          </span>
        </span>
        <span className="profile-cta__chevron" aria-hidden>
          ›
        </span>
      </Link>

      {isAuthenticated && (
        <Link
          to={user?.hasSpecialistProfile ? '/profile/my-card' : '/profile/application'}
          className="profile-cta"
          onClick={() => haptic.tap()}
        >
          <span className="profile-cta__icon" aria-hidden>
            🛠
          </span>
          <span className="profile-cta__body">
            <span className="profile-cta__title">
              {user?.hasSpecialistProfile ? 'Моя анкета исполнителя' : 'Стать исполнителем'}
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
