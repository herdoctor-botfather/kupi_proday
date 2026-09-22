import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { haptic, tg } from '../lib/telegram';
import { STATUS_VIEW, when } from './UrgentPage';

/**
 * Один срочный вызов — глазами заказчика или мастера.
 *
 * Раньше вызов был строкой в списке: заказчик видел «ждём отклика», но
 * не мог открыть его и узнать, кто взялся и где переписка, а мастер,
 * пролиставший сообщение бота, не находил вызов в приложении вовсе.
 * Здесь у обоих одна карточка: суть беды, срок и то действие, которое
 * сейчас уместно, — «Беру», «Открыть переписку» или «Отменить».
 */
export function UrgentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const state = useAsync(() => api.urgentDetail(id), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      haptic.tap();
      const { conversationId } = await api.takeUrgent(id);
      haptic.success();
      if (conversationId) navigate(`/chat/${conversationId}`);
      else state.reload();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось взять вызов');
      state.reload();
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    const run = async () => {
      setBusy(true);
      try {
        await api.cancelUrgent(id);
        haptic.success();
        state.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось отменить');
      } finally {
        setBusy(false);
      }
    };
    const question = 'Отменить вызов? Мастера перестанут его видеть.';
    const app = tg();
    if (app) app.showConfirm(question, (ok) => ok && void run());
    else if (window.confirm(question)) void run();
  };

  return (
    <div className="page">
      <AsyncContent state={state}>
        {(request) => {
          const view = STATUS_VIEW[request.status];
          // «Вы отменили» — слова заказчика; мастеру то же событие видно иначе.
          const statusText =
            request.role === 'master' && request.status === 'CANCELLED'
              ? 'Заказчик отменил вызов'
              : request.role === 'master' && request.status === 'TAKEN' && !request.takenByMe
                ? 'Вызов уже взял другой мастер'
                : request.takenByMe
                  ? 'Вы взяли этот вызов'
                  : view.text;

          return (
            <>
              <div className="hero__greeting">
                ⚡️ {request.role === 'owner' ? 'Ваш срочный вызов' : 'Срочный вызов для вас'}
              </div>
              <h1 className="page__title">{request.title}</h1>

              <div className={`urgent-status urgent-status--${request.status.toLowerCase()}`}>
                {view.icon} {statusText}
                {request.role === 'owner' && request.takenBy ? `: ${request.takenBy.name}` : ''}
              </div>

              <div className="urgent-facts">
                <div>
                  <span className="urgent-facts__label">Кто нужен</span>
                  {request.category.icon} {request.category.name}
                </div>
                <div>
                  <span className="urgent-facts__label">Где</span>
                  📍 {request.city}
                </div>
                <div>
                  <span className="urgent-facts__label">Когда</span>
                  🕘 {when(request)}
                </div>
              </div>

              {request.description && <p className="urgent-description">{request.description}</p>}

              {error && <p className="form-error">{error}</p>}

              {request.conversationId && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    haptic.tap();
                    navigate(`/chat/${request.conversationId}`);
                  }}
                >
                  💬 Открыть переписку
                </button>
              )}

              {request.canTake && (
                <button type="button" className="button" disabled={busy} onClick={() => void take()}>
                  {busy ? 'Берём…' : '⚡️ Беру'}
                </button>
              )}
              {request.canTake && (
                <p className="form-hint">Возьмёте — откроется переписка с заказчиком. Кто первый, того и вызов.</p>
              )}

              {request.role === 'owner' && request.status === 'OPEN' && (
                <button
                  type="button"
                  className="button button--secondary"
                  style={{ color: 'var(--destructive)', marginTop: 12 }}
                  disabled={busy}
                  onClick={cancel}
                >
                  Отменить вызов
                </button>
              )}
            </>
          );
        }}
      </AsyncContent>
    </div>
  );
}
