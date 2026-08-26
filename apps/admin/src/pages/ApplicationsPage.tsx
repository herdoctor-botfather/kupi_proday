import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ApplicationRow } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { Modal } from '../components/Modal';
import { formatDateTime, formatPrice } from '../lib/format';

/**
 * Очередь анкет, поданных специалистами через приложение.
 *
 * Разделена на две группы: новые заявки не видны в каталоге и человек ждёт
 * решения, а правки уже опубликованных карточек остаются на витрине —
 * поэтому они менее срочные и идут ниже.
 */
export function ApplicationsPage() {
  const queue = useAsync(() => api.applications(), []);
  const [rejecting, setRejecting] = useState<ApplicationRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async (row: ApplicationRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await api.moderateSpecialist(row.id, { action: 'approve' });
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось опубликовать');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (row: ApplicationRow, reason: string) => {
    setBusyId(row.id);
    setError(null);
    try {
      await api.moderateSpecialist(row.id, { action: 'reject', reason });
      setRejecting(null);
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отклонить');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Заявки специалистов</h1>
          <p>Анкеты, поданные через приложение. До публикации они не видны в каталоге</p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <AsyncContent state={queue}>
        {(data) =>
          data.total === 0 ? (
            <EmptyState icon="✅" title="Заявок нет" hint="Все анкеты проверены" />
          ) : (
            <>
              {data.pending.length > 0 && (
                <>
                  <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>
                    Новые анкеты <span className="badge badge--warning">{data.pending.length}</span>
                  </h2>
                  {data.pending.map((row) => (
                    <ApplicationCard
                      key={row.id}
                      row={row}
                      busy={busyId === row.id}
                      onApprove={() => approve(row)}
                      onReject={() => setRejecting(row)}
                    />
                  ))}
                </>
              )}

              {data.changed.length > 0 && (
                <>
                  <h2 style={{ fontSize: 15, margin: '26px 0 6px' }}>
                    Изменённые анкеты <span className="badge">{data.changed.length}</span>
                  </h2>
                  <p className="cell-muted" style={{ margin: '0 0 12px' }}>
                    Эти карточки уже опубликованы и остаются в каталоге. Проверьте, что после правок
                    в них нет ничего лишнего.
                  </p>
                  {data.changed.map((row) => (
                    <ApplicationCard
                      key={row.id}
                      row={row}
                      busy={busyId === row.id}
                      onApprove={() => approve(row)}
                      onReject={() => setRejecting(row)}
                    />
                  ))}
                </>
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

function ApplicationCard({
  row,
  busy,
  onApprove,
  onReject,
}: {
  row: ApplicationRow;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const contacts = [
    row.phone && `📞 ${row.phone}`,
    row.telegram && `✈️ ${row.telegram}`,
    row.whatsapp && `💬 ${row.whatsapp}`,
    row.instagram && `📷 ${row.instagram}`,
    row.website && `🌐 ${row.website}`,
  ].filter(Boolean);

  return (
    <div className="review-card">
      <div className="review-card__head">
        {row.photoUrl ? (
          <img className="review-card__avatar" src={row.photoUrl} alt="" />
        ) : (
          <div className="review-card__avatar" />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 620, fontSize: 15 }}>{row.displayName}</div>
          {row.headline && <div className="cell-muted">{row.headline}</div>}
          <div className="cell-muted">
            {row.city}
            {row.address && `, ${row.address}`}
            {row.lat === null && ' · без точки на карте'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cell-muted">подана {formatDateTime(row.createdAt)}</div>
          {row.user && (
            <div className="cell-muted">
              {row.user.username ? `@${row.user.username}` : row.user.firstName}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {row.categories.map(({ category }) => (
          <span key={category.id} className="badge badge--accent">
            {category.icon} {category.name}
          </span>
        ))}
      </div>

      {row.about && <div className="review-card__text">{row.about}</div>}

      <div style={{ marginBottom: 12 }}>
        <div className="cell-muted" style={{ marginBottom: 4 }}>
          Контакты: {contacts.length > 0 ? contacts.join('  ·  ') : '— не указаны —'}
        </div>
        {row.services.length > 0 && (
          <div className="cell-muted">
            Услуги:{' '}
            {row.services
              .map((s) => `${s.name} — ${s.priceIsFrom ? 'от ' : ''}${formatPrice(s.priceAmount, s.currency)}`)
              .join('  ·  ')}
          </div>
        )}
      </div>

      <div className="review-card__actions">
        <button type="button" className="button button--success" onClick={onApprove} disabled={busy}>
          {row.needsReview ? 'Подтвердить изменения' : 'Опубликовать'}
        </button>
        <button type="button" className="button button--secondary" onClick={onReject} disabled={busy}>
          Отклонить
        </button>
        <Link to={`/specialists/${row.id}`} className="button button--secondary">
          Открыть карточку
        </Link>
      </div>
    </div>
  );
}

/** Причина обязательна: специалист увидит её в приложении и сможет исправить анкету. */
function RejectDialog({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: ApplicationRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  const PRESETS = [
    'Добавьте фотографию — без неё анкете доверяют меньше',
    'Укажите рабочий способ связи',
    'Опишите услуги подробнее',
    'Уберите рекламу сторонних площадок',
    'Категория выбрана не по профилю',
  ];

  return (
    <Modal
      title={`Отклонить анкету «${row.displayName}»`}
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
        Анкета будет скрыта, а специалист увидит причину и сможет подать её заново после правок.
        {row.needsReview && ' Карточка уже опубликована — отклонение снимет её с витрины.'}
      </p>

      <div className="field">
        <label className="field__label" htmlFor="reject-reason">
          Что нужно исправить
        </label>
        <textarea
          id="reject-reason"
          className="textarea"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Напишите так, чтобы человек понял, что поправить"
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
