import { useNavigate } from 'react-router-dom';
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

/**
 * Причины снятия с витрины.
 *
 * Продажа и отказ от продажи различаются для площадки, а не для продавца:
 * ему в обоих случаях нужно одно — убрать объявление. Поэтому спрашиваем
 * после нажатия, а «продано» стоит первым: это самый частый исход, ради
 * которого объявление и подавали.
 */
const REMOVE_REASONS: { label: string; hint: string; action: 'sold' | 'hide' }[] = [
  { label: 'Продано', hint: 'Уйдёт с витрины и останется в истории как проданное', action: 'sold' },
  { label: 'Продал в другом месте', hint: 'Тоже считается проданным', action: 'sold' },
  { label: 'Передумал продавать', hint: 'Можно вернуть на витрину в любой момент', action: 'hide' },
  { label: 'Пока недоступно', hint: 'Временно скрыть, вернуть позже', action: 'hide' },
];

export function MyListingsPage() {
  const navigate = useNavigate();
  const state = useAsync(() => api.myListings(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Объявление, для которого спрашиваем причину снятия. */
  const [removing, setRemoving] = useState<MyListing | null>(null);

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

    // Подтверждение осталось только у удаления: оно необратимо. Снятие
    // с витрины человек уже подтвердил, выбрав причину, и спрашивать
    // второй раз — не забота, а недоверие.
    const question =
      action === 'delete'
        ? 'Удалить объявление? Вместе с ним пропадут фотографии и переписки.'
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
      {/*
        Одна кнопка размещения на экран. Их было три — в шапке, посередине
        и круглая поверх навигации, — и все вели в одно и то же место:
        выбор без выбора, который только загромождает экран.
      */}
      <h1 className="page__title">Мои объявления</h1>

      {error && <div className="alert alert--error">{error}</div>}

      <AsyncContent state={state}>
        {(listings) =>
          listings.length === 0 ? (
            <>
              <EmptyState
                icon="🏷"
                title="Объявлений пока нет"
                hint="Разместите первое — оно появится на витрине после проверки. Здесь же будут ваши запросы на покупку."
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
                          <span aria-hidden>{listing.kind === 'BUY' ? '🔎' : '📦'}</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Продажа и запрос лежат в одном списке, и без пометки
                            владелец не поймёт, почему у одной записи цена — это
                            ценник, а у другой потолок, который он сам назвал. */}
                        {listing.kind === 'BUY' && <span className="badge-promoted">Ищу</span>}
                        <div className="my-listing__title">{listing.title}</div>
                        <div className="my-listing__price">
                          {listing.kind === 'BUY' && (
                            <span className="card__headline">до </span>
                          )}
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
                      {/*
                        Одна кнопка вместо двух. «Продано» и «Снять» —
                        не два разных действия, а одно с разной причиной:
                        объявление в обоих случаях уходит с витрины.
                        Причину спрашиваем после нажатия — она уточняет
                        уже принятое решение, а не предлагает выбрать одно
                        из двух похожих.
                      */}
                      {listing.status === 'ACTIVE' && (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={() => setRemoving(listing)}
                          disabled={busyId === listing.id}
                        >
                          Снять с витрины
                        </button>
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

      {removing && (
        <div className="sheet-backdrop" onClick={() => setRemoving(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet__grip" aria-hidden />
            <h2 className="sheet__title">Почему снимаете</h2>

            {REMOVE_REASONS.map((reason) => (
              <button
                key={reason.label}
                type="button"
                className="sheet__option"
                onClick={() => {
                  const listing = removing;
                  setRemoving(null);
                  void act(listing, reason.action);
                }}
              >
                <span className="sheet__option-body">
                  <span className="sheet__option-title">{reason.label}</span>
                  <span className="sheet__option-text">{reason.hint}</span>
                </span>
              </button>
            ))}

            <button type="button" className="sheet__cancel" onClick={() => setRemoving(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
