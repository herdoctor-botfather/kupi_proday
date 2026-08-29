import { Link, useNavigate } from 'react-router-dom';
import type { ListingStatus, MyListing } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { formatPrice, pluralize } from '../lib/format';
import { haptic, tg } from '../lib/telegram';
import { useState } from 'react';

/** Как объяснить продавцу состояние его объявления. */
const STATUS_VIEW: Record<ListingStatus, { icon: string; label: string; tone: string }> = {
  PENDING: { icon: '⏳', label: 'На проверке', tone: 'status--pending' },
  ACTIVE: { icon: '✅', label: 'На витрине', tone: 'status--active' },
  SOLD: { icon: '📦', label: 'Продано', tone: 'status--hidden' },
  HIDDEN: { icon: '🙈', label: 'Снято', tone: 'status--hidden' },
  REJECTED: { icon: '📝', label: 'Отклонено', tone: 'status--blocked' },
  DRAFT: { icon: '📄', label: 'Черновик', tone: 'status--hidden' },
};

export function MyListingsPage() {
  const navigate = useNavigate();
  const state = useAsync(() => api.myListings(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (listing: MyListing, action: 'sold' | 'hide' | 'publish' | 'delete') => {
    const run = async () => {
      setBusyId(listing.id);
      setError(null);
      try {
        if (action === 'sold') await api.markListingSold(listing.id);
        else if (action === 'hide') await api.hideListing(listing.id);
        else if (action === 'publish') await api.publishListing(listing.id);
        else await api.deleteListing(listing.id);
        haptic.success();
        state.reload();
      } catch (err) {
        haptic.error();
        setError(err instanceof Error ? err.message : 'Не удалось выполнить');
      } finally {
        setBusyId(null);
      }
    };

    const question =
      action === 'delete'
        ? 'Удалить объявление? Вместе с ним пропадут фотографии и переписки.'
        : action === 'sold'
          ? 'Пометить проданным? Объявление уйдёт с витрины.'
          : null;

    if (!question) {
      void run();
      return;
    }

    const app = tg();
    if (app) app.showConfirm(question, (ok) => ok && void run());
    else if (window.confirm(question)) void run();
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <h1 className="page__title" style={{ margin: 0, flex: 1 }}>
          Мои объявления
        </h1>
        <Link to="/market/sell" className="button" style={{ width: 'auto', padding: '10px 16px' }}>
          + Разместить
        </Link>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <AsyncContent state={state}>
        {(listings) =>
          listings.length === 0 ? (
            <>
              <EmptyState
                icon="🏷"
                title="Объявлений пока нет"
                hint="Разместите первое — оно появится на витрине после проверки"
              />
              <button type="button" className="button" onClick={() => navigate('/market/sell')}>
                Разместить объявление
              </button>
            </>
          ) : (
            <div className="card-list">
              {listings.map((listing) => {
                const view = STATUS_VIEW[listing.status];
                return (
                  <div key={listing.id} className="my-listing">
                    <div className="my-listing__head">
                      <div className="my-listing__photo">
                        {listing.coverUrl ? (
                          <img src={listing.coverUrl} alt="" loading="lazy" />
                        ) : (
                          <span aria-hidden>📦</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="my-listing__title">{listing.title}</div>
                        <div className="my-listing__price">
                          {formatPrice(listing.priceAmount, listing.currency)}
                        </div>
                        <div className="card__headline">
                          {listing.viewCount}{' '}
                          {pluralize(listing.viewCount, ['просмотр', 'просмотра', 'просмотров'])}
                        </div>
                      </div>
                      <span className={`listing-status ${view.tone}`}>
                        {view.icon} {view.label}
                      </span>
                    </div>

                    {listing.rejectionReason && (
                      <div className="alert alert--warning" style={{ margin: '10px 0 0' }}>
                        <strong>Что поправить:</strong> {listing.rejectionReason}
                      </div>
                    )}

                    {listing.needsReview && listing.status === 'ACTIVE' && (
                      <div className="alert alert--info" style={{ margin: '10px 0 0' }}>
                        Изменения на проверке. Объявление остаётся на витрине.
                      </div>
                    )}

                    <div className="my-listing__actions">
                      {listing.status !== 'SOLD' && (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={() => navigate(`/market/sell?id=${listing.id}`)}
                          disabled={busyId === listing.id}
                        >
                          Изменить
                        </button>
                      )}
                      {listing.status === 'ACTIVE' && (
                        <>
                          <button
                            type="button"
                            className="button button--secondary button--sm"
                            onClick={() => act(listing, 'sold')}
                            disabled={busyId === listing.id}
                          >
                            Продано
                          </button>
                          <button
                            type="button"
                            className="button button--secondary button--sm"
                            onClick={() => act(listing, 'hide')}
                            disabled={busyId === listing.id}
                          >
                            Снять
                          </button>
                        </>
                      )}
                      {(listing.status === 'HIDDEN' || listing.status === 'SOLD') && (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={() => act(listing, 'publish')}
                          disabled={busyId === listing.id}
                        >
                          Вернуть на витрину
                        </button>
                      )}
                      <button
                        type="button"
                        className="button button--secondary button--sm"
                        style={{ color: 'var(--destructive)', marginLeft: 'auto' }}
                        onClick={() => act(listing, 'delete')}
                        disabled={busyId === listing.id}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </AsyncContent>
    </div>
  );
}
