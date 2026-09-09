import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';

/**
 * Развилка продавца.
 *
 * Раньше «Я продаю» вело прямо в список объявлений, и человек, пришедший
 * подать второе, упирался в первое: кнопка размещения там есть, но экран
 * отвечает не на тот вопрос, с которым пришли. Разместить новое и
 * поправить старое — два разных намерения, и спрашивать о них надо до
 * того, как показывать список.
 *
 * У кого объявлений ещё нет, второй двери не показываем: предлагать
 * «редактировать опубликованное» тому, у кого ничего не опубликовано,
 * значит вести в пустоту.
 */
export function SellHubPage() {
  const mine = useAsync(() => api.myListings(), []);
  const sellCount = (mine.data ?? []).filter((listing) => listing.kind === 'SELL').length;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__greeting">Купи-продай</div>
        <h1 className="hero__title">Я продаю</h1>
        <p className="hero__subtitle">
          {sellCount > 0
            ? `У вас ${sellCount} ${pluralize(sellCount, ['объявление', 'объявления', 'объявлений'])}`
            : 'Разместите первое объявление — оно появится на витрине после проверки'}
        </p>
      </header>

      <div className="role-cards">
        <Link
          to="/market/sell"
          className="role-card role-card--scene"
          style={{ backgroundImage: 'url(/cards/wanted-new.jpg)' }}
          onClick={() => haptic.tap()}
        >
          <span className="role-card__title">Опубликовать новое объявление</span>
          <span className="role-card__text">Название, цена, фотографии — и на проверку</span>
          <span className="role-card__action">Заполнить форму →</span>
        </Link>

        {sellCount > 0 && (
          <Link
            to="/market/my"
            className="role-card role-card--scene"
            style={{ backgroundImage: 'url(/cards/wanted-browse.jpg)' }}
            onClick={() => haptic.tap()}
          >
            <span className="role-card__title">Редактировать опубликованное</span>
            <span className="role-card__text">
              Изменить цену и описание, снять с витрины или вернуть обратно
            </span>
            <span className="role-card__action">Мои объявления →</span>
          </Link>
        )}
      </div>
    </div>
  );
}
