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
  /** Объявление, открытое целиком для просмотра и правки. */
  const [editing, setEditing] = useState<ListingRow | null>(null);
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
            {/* Снимок открывается в полный размер по нажатию: на плитке
                не разглядеть ни состояние товара, ни водяной знак чужого
                объявления, а проверяют именно это. */}
            <div className="listing-thumb">
              {row.photos[0] ? (
                <a href={row.photos[0].url} target="_blank" rel="noreferrer">
                  <img src={row.photos[0].url} alt="" />
                </a>
              ) : (
                <span aria-hidden>{row.kind === 'BUY' ? '🔎' : '📦'}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {/* Запрос и продажу нужно различать с первого взгляда:
                  проверяются они по-разному — у запроса нет товара,
                  который можно было бы оценить по фотографии. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span className={row.kind === 'BUY' ? 'badge badge--accent' : 'badge'}>
                  {row.kind === 'BUY' ? 'Ищут' : 'Продают'}
                </span>
                <span style={{ fontWeight: 620, fontSize: 15 }}>{row.title}</span>
              </div>
              <div style={{ fontWeight: 680 }}>
                {row.kind === 'BUY' && <span className="cell-muted">до </span>}
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
                <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt="" loading="lazy" />
                </a>
              ))}
            </div>
          )}

          <div className="review-card__actions">
            {/* Открыть объявление целиком: в строке очереди помещается
                не всё, а решение принимают по описанию и снимкам. */}
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setEditing(row)}
              disabled={busyId === row.id}
            >
              Открыть
            </button>
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

      {editing && (
        <ListingDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queue.reload();
          }}
        />
      )}

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

/**
 * Объявление целиком: всё, что есть, и правка мелочей.
 *
 * Отклонять ради опечатки или лишнего нуля в цене — терять и время
 * модератора, и терпение продавца: он ждёт публикации, а получает
 * возврат из-за запятой. Поэтому текст и цену можно поправить здесь же.
 *
 * Фотографии и категории не правятся намеренно: их подмена меняет смысл
 * объявления, а это уже не редактура. Такое отклоняют с объяснением.
 */
function ListingDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ListingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description ?? '');
  const [price, setPrice] = useState(String(Math.round(row.priceAmount / 100)));
  const [isNegotiable, setNegotiable] = useState(row.isNegotiable);
  const [condition, setCondition] = useState(row.condition);
  const [city, setCity] = useState(row.city);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.editListing(row.id, {
        title: title.trim(),
        description: description.trim() || null,
        price: Number(price || 0),
        isNegotiable,
        condition,
        city: city.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={row.kind === 'BUY' ? 'Запрос на покупку' : 'Объявление о продаже'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Сохраняем...' : 'Сохранить правки'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert--error">{error}</div>}

      {row.photos.length > 0 && (
        <div className="listing-thumbs" style={{ marginBottom: 14 }}>
          {row.photos.map((photo) => (
            <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
              <img src={photo.url} alt="" />
            </a>
          ))}
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="l-title">Название</label>
        <input id="l-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="l-desc">Описание</label>
        <textarea
          id="l-desc"
          className="textarea"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="l-price">
          {row.kind === 'BUY' ? 'Готов заплатить, ₽' : 'Цена, ₽'}
        </label>
        <input
          id="l-price"
          className="input"
          value={price}
          inputMode="numeric"
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
        />
      </div>

      <label className="checkbox-inline" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={isNegotiable} onChange={(e) => setNegotiable(e.target.checked)} />
        торг уместен
      </label>

      <div className="field">
        <label className="field__label" htmlFor="l-condition">Состояние</label>
        <select
          id="l-condition"
          className="input"
          value={condition}
          onChange={(e) => setCondition(e.target.value as ListingRow['condition'])}
        >
          {(Object.keys(CONDITION_LABELS) as ListingRow['condition'][]).map((value) => (
            <option key={value} value={value}>
              {CONDITION_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="l-city">Город</label>
        <input id="l-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <p className="cell-muted" style={{ marginBottom: 0 }}>
        Категории и фотографии здесь не меняются: их подмена меняет смысл объявления.
        Если дело в них — отклоните с объяснением.
      </p>
    </Modal>
  );
}