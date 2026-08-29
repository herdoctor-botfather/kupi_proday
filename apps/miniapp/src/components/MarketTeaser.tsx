import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatPrice, pluralize } from '../lib/format';
import { categoryStyle } from '../lib/category-colors';
import { haptic } from '../lib/telegram';

/** Сколько товаров показываем в полосе: дальше человек всё равно не листает. */
const PREVIEW_COUNT = 8;

/**
 * Витрина барахолки на главном экране каталога услуг.
 *
 * Ссылкой «перейти в Купи-продай» этот переход не решается: строка в списке
 * ничего не обещает, и человек, пришедший за мастером, просто её не заметит.
 * Полоса с настоящими товарами и ценами показывает, что там есть, ещё до
 * перехода — и отвечает на вопрос «а что там?» вместо того, чтобы его задавать.
 *
 * Пока витрина пуста, полосы нет: пустая карусель хуже её отсутствия.
 * Вместо неё — приглашение продать самому, тоже ведущее в раздел.
 */
export function MarketTeaser() {
  const shelf = useAsync(() => api.listings({ pageSize: PREVIEW_COUNT, sort: 'new' }), []);

  // Пока грузится — ничего не показываем: скелет в подвале главной
  // отвлекает от категорий, ради которых человек сюда и пришёл.
  if (shelf.loading || shelf.error || !shelf.data) return null;

  const { items, total } = shelf.data;

  if (items.length === 0) {
    return (
      <Link to="/market" className="market-teaser market-teaser--empty" onClick={() => haptic.tap()}>
        <span className="market-teaser__badge" aria-hidden>
          🛍
        </span>
        <span className="market-teaser__body">
          <span className="market-teaser__title">Купи-продай</span>
          <span className="market-teaser__text">
            Витрина только открылась — разместите первое объявление
          </span>
        </span>
        <span className="market-teaser__chevron" aria-hidden>
          ›
        </span>
      </Link>
    );
  }

  return (
    <section className="market-teaser-block">
      <header className="market-teaser-head">
        <span className="market-teaser-head__title">
          <span aria-hidden>🛍</span> Купи-продай
        </span>
        <Link to="/market" className="market-teaser-head__all" onClick={() => haptic.tap()}>
          все {total} →
        </Link>
      </header>

      <p className="market-teaser-head__hint">
        {total} {pluralize(total, ['вещь', 'вещи', 'вещей'])} от людей рядом — без комиссий
      </p>

      {/* Горизонтальная полоса, а не сетка: барахолка на этом экране —
          гость, и вертикального места она занимать не должна. */}
      <div className="market-strip">
        {items.map((listing) => (
          <Link
            key={listing.id}
            to={`/listing/${listing.slug}`}
            className="market-strip__item"
            onClick={() => haptic.tap()}
          >
            {/* Объявление без фотографии не должно быть серым пятном:
                берём цвет и значок его категории — те же, что на плитках
                каталога, так полоса остаётся живой и узнаваемой. */}
            {listing.coverUrl ? (
              <span className="market-strip__photo">
                <img src={listing.coverUrl} alt="" loading="lazy" />
              </span>
            ) : (
              <span
                className="market-strip__photo market-strip__photo--tinted"
                style={listing.categories[0] ? categoryStyle(listing.categories[0].slug) : undefined}
                aria-hidden
              >
                {listing.categories[0]?.icon ?? '📦'}
              </span>
            )}
            <span className="market-strip__price">
              {formatPrice(listing.priceAmount, listing.currency)}
            </span>
            <span className="market-strip__title">{listing.title}</span>
          </Link>
        ))}

        <Link to="/market/browse" className="market-strip__more" onClick={() => haptic.tap()}>
          <span className="market-strip__more-icon" aria-hidden>
            →
          </span>
          <span>Вся витрина</span>
        </Link>
      </div>
    </section>
  );
}
