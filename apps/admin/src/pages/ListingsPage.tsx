import { useState } from 'react';
import { api, type ListingRow } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { Modal } from '../components/Modal';
import { formatDateTime, formatPrice } from '../lib/format';

const CONDITION_LABELS: Record<ListingRow['condition'], string> = {
  NEW: 'Новый',
  USED_PERFECT: 'Как новый',
  USED: 'Б/у',
};

/**
 * Очередь объявлений о продаже.
 *
 * Проверять здесь нужно внимательнее, чем анкеты: объявления — самая
 * уязвимая для мошенничества часть каталога. Смотрите на несоразмерно
 * низкую цену, требование предоплаты в описании и чужие фотографии.
 */
export function ListingsPage() {
  const queue = useAsync(() => api.pendingListings(), []);
  const [rejecting, setRejecting] = useState<ListingRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async (row: ListingRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await api.moderateListing(row.id, { action: 'approve' });
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось опубликовать');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (row: ListingRow, reason: string) => {
    setBusyId(row.id);
    setError(null);
    try {
      await api.moderateListing(row.id, { action: 'reject', reason });
      setRejecting(null);
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отклонить');
    } finally {
      setBusyId(null);
    }
  };

  const renderGroup = (rows: ListingRow[], title: string, hint?: string) => (
    <>
      <h2 style={{ fontSize: 15, margin: '26px 0 6px' }}>
        {title} <span className="badge badge--warning">{rows.length}</span>
      </h2>
      {hint && (
        <p className="cell-muted" style={{ margin: '0 0 12px' }}>
          {hint}
        </p>
      )}
      {rows.map((row) => (
        <div key={row.id} className="review-card">
          <div className="review-card__head">
            <div className="listing-thumb">
              {row.photos[0] ? <img src={row.photos[0].url} alt="" /> : <span aria-hidden>📦</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 620, fontSize: 15 }}>{row.title}</div>
              <div style={{ fontWeight: 680 }}>
                {formatPrice(row.priceAmount, row.currency)}
                {row.isNegotiable && <span className="cell-muted"> · торг</span>}
              </div>
              <div className="cell-muted">
                {CONDITION_LABELS[row.condition]} · {row.city} ·{' '}
                {row.categories.map(({ category }) => `${category.icon} ${category.name}`).join(', ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="cell-muted">{formatDateTime(row.createdAt)}</div>
              {row.user && (
                <div className="cell-muted">
                  {row.user.username ? `@${row.user.username}` : row.user.firstName}
                </div>
              )}
              <div className="cell-muted">
                {row.photos.length} {row.photos.length === 1 ? 'фото' : 'фото'}
              </div>
            </div>
          </div>

          {row.description && <div className="review-card__text">{row.description}</div>}

          {row.photos.length > 1 && (
            <div className="listing-thumbs">
              {row.photos.slice(1).map((photo) => (
                <img key={photo.id} src={photo.url} alt="" loading="lazy" />
              ))}
            </div>
          )}

          <div className="review-card__actions">
            <button
              type="button"
              className="button button--success"
              onClick={() => approve(row)}
              disabled={busyId === row.id}
            >
              {row.needsReview ? 'Подтвердить изменения' : 'Опубликовать'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setRejecting(row)}
              disabled={busyId === row.id}
            >
              Отклонить
            </button>
          </div>
        </div>
      ))}
    </>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Объявления</h1>
          <p>Товары на проверке. До публикации они не видны на витрине</p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <AsyncContent state={queue}>
        {(data) =>
          data.total === 0 ? (
            <EmptyState icon="✅" title="Очередь пуста" hint="Все объявления проверены" />
          ) : (
            <>
              {data.pending.length > 0 && renderGroup(data.pending, 'Новые объявления')}
              {data.changed.length > 0 &&
                renderGroup(
                  data.changed,
                  'Изменённые объявления',
                  'Эти объявления уже на витрине и остаются там. Проверьте, что после правок в них нет ничего лишнего.',
                )}
            </>
          )
        }
      </AsyncContent>

      {rejecting && (
        <RejectDialog
          row={rejecting}
          busy={busyId === rejecting.id}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => reject(rejecting, reason)}
        />
      )}
    </>
  );
}

function RejectDialog({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: ListingRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  const PRESETS = [
    'Добавьте фотографии товара',
    'Опишите состояние и комплектацию',
    'Цена не соответствует товару',
    'Товар запрещён к продаже',
    'Фотографии не ваши',
  ];

  return (
    <Modal
      title={`Отклонить «${row.title}»`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={busy || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? 'Отклоняем...' : 'Отклонить'}
          </button>
        </>
      }
    >
      <p className="cell-muted" style={{ marginTop: 0 }}>
        Продавец увидит причину и сможет исправить объявление.
        {row.needsReview && ' Объявление уже на витрине — отклонение снимет его с неё.'}
      </p>

      <div className="field">
        <label className="field__label" htmlFor="listing-reason">
          Что нужно исправить
        </label>
        <textarea
          id="listing-reason"
          className="textarea"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="button button--secondary button--sm"
            onClick={() => setReason(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
    </Modal>
  );
}
