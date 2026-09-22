import { Link, useNavigate } from 'react-router-dom';
import type { ListingStatus } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { formatPrice, pluralize } from '../lib/format';
import { haptic } from '../lib/telegram';

/** Что происходит с вакансией или резюме — словами владельца. */
const STATUS_VIEW: Record<ListingStatus, { icon: string; label: string; tone: string }> = {
  PENDING: { icon: '⏳', label: 'На проверке', tone: 'status--pending' },
  ACTIVE: { icon: '✅', label: 'Опубликовано', tone: 'status--active' },
  SOLD: { icon: '✔️', label: 'Закрыто', tone: 'status--hidden' },
  HIDDEN: { icon: '🙈', label: 'Снято', tone: 'status--hidden' },
  REJECTED: { icon: '📝', label: 'Отклонено', tone: 'status--blocked' },
  DRAFT: { icon: '📄', label: 'Черновик', tone: 'status--hidden' },
};

/**
 * Мои вакансии и резюме.
 *
 * Отдельный экран, а не строка в общем списке объявлений. Человек,
 * разместивший резюме, возвращается с одним вопросом — «прошло ли
 * проверку и видят ли меня». Отправлять его за ответом в список,
 * где вперемешку лежат диван и велосипед, значит прятать ответ.
 *
 * Экран открывается и тогда, когда размещать ещё нечего: пустой он
 * объясняет, что здесь будет, и предлагает разместить — ради этого
 * в раздел и заходят.
 */
export function CareerMyPage() {
  const navigate = useNavigate();
  const state = useAsync(() => api.myListings(), []);

  return (
    <div className="page">
      <h1 className="page__title">Мои вакансии и резюме</h1>

      <AsyncContent state={state}>
        {(listings) => {
          const career = (listings ?? []).filter(
            (listing) => listing.kind === 'JOB' || listing.kind === 'RESUME',
          );

          if (career.length === 0) {
            return (
              <>
                <p className="form-intro">
                  Здесь будут ваши вакансии и резюме: видно, прошли ли они проверку и сколько
                  человек их открыло. Размещение бесплатное.
                </p>
                <Link to="/career/new-resume" className="button" onClick={() => haptic.tap()}>
                  🙋 Разместить резюме
                </Link>
                <Link
                  to="/career/new-job"
                  className="button button--secondary"
                  style={{ marginTop: 12 }}
                  onClick={() => haptic.tap()}
                >
                  💼 Разместить вакансию
                </Link>
              </>
            );
          }

          return (
            <>
              <div className="card-list">
                {career.map((listing) => {
                  const view = STATUS_VIEW[listing.status];
                  return (
                    <button
                      key={listing.id}
                      type="button"
                      className="my-listing career-own"
                      onClick={() => {
                        haptic.tap();
                        navigate(`/market/sell?id=${listing.id}`);
                      }}
                    >
                      <div className="card__headline">
                        {listing.kind === 'JOB' ? '💼 Вакансия' : '🙋 Резюме'}
                      </div>
                      <div className="my-listing__title">{listing.title}</div>
                      <div className="my-listing__price">
                        от {formatPrice(listing.priceAmount, listing.currency)}
                      </div>
                      <div className="card__headline">
                        <span className={`listing-status ${view.tone}`}>
                          {view.icon} {view.label}
                        </span>{' '}
                        · {listing.viewCount}{' '}
                        {pluralize(listing.viewCount, ['просмотр', 'просмотра', 'просмотров'])}
                      </div>
                      {listing.rejectionReason && (
                        <div className="alert alert--warning" style={{ margin: '10px 0 0' }}>
                          <strong>Что поправить:</strong> {listing.rejectionReason}
                        </div>
                      )}
                      <div className="urgent-open">Изменить ›</div>
                    </button>
                  );
                })}
              </div>

              <Link
                to="/career/new-job"
                className="button button--secondary"
                style={{ marginTop: 16 }}
                onClick={() => haptic.tap()}
              >
                💼 Разместить вакансию
              </Link>
              <Link
                to="/career/new-resume"
                className="button button--secondary"
                style={{ marginTop: 12 }}
                onClick={() => haptic.tap()}
              >
                🙋 Разместить резюме
              </Link>
            </>
          );
        }}
      </AsyncContent>
    </div>
  );
}
