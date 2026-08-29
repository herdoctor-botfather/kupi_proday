import { Link } from 'react-router-dom';
import { haptic } from '../lib/telegram';

/** Заголовок ленты со счётчиком и ссылкой на полный список. */
export function FeedHeader({ title, to, total }: { title: string; to: string; total: number }) {
  return (
    <div className="feed-head">
      <h2 className="feed-head__title">{title}</h2>
      {total > 0 && (
        <Link to={to} className="feed-head__all" onClick={() => haptic.tap()}>
          все {total} →
        </Link>
      )}
    </div>
  );
}

/**
 * Кнопка, дописывающая в ленту следующую страницу.
 *
 * Исчезает, когда дописывать нечего: кнопка, которая ничего не делает,
 * хуже её отсутствия — человек нажимает и решает, что приложение зависло.
 */
export function FeedMore({
  feed,
}: {
  feed: { hasMore: boolean; loadingMore: boolean; loadMore: () => void };
}) {
  if (!feed.hasMore) return null;

  return (
    <button
      type="button"
      className="feed-more"
      disabled={feed.loadingMore}
      onClick={() => {
        haptic.tap();
        feed.loadMore();
      }}
    >
      {feed.loadingMore ? 'Загружаем…' : 'Смотреть ещё'}
      <span className="feed-more__chevron" aria-hidden>
        ⌄
      </span>
    </button>
  );
}
