import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { haptic } from '../lib/telegram';

/**
 * Заявка поверх профиля заказчика.
 *
 * Мастер приходит сюда из уведомления, чтобы понять, с кем имеет дело,
 * прежде чем соглашаться. Ответить ему нужно здесь же — иначе пришлось бы
 * возвращаться в бота или в кабинет, а заявка живёт всего полчаса.
 *
 * Написать заказчику отсюда нельзя намеренно: переписка по услуге
 * открывается только согласием, и страница профиля не должна быть
 * обходным путём мимо этого правила.
 *
 * Заявку ищем среди своих входящих, а не по одному идентификатору из
 * адреса: так чужой или уже закрытый запрос просто не покажется.
 */
export function PendingRequestBanner({ requestId }: { requestId: string }) {
  const navigate = useNavigate();
  const state = useAsync(() => api.incomingRequests(), [requestId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = state.data?.find((request) => request.id === requestId);
  if (!item) return null;

  const answer = async (action: 'accept' | 'decline') => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.answerRequest(item.id, action);
      haptic.success();
      if (action === 'accept' && result.conversationId) {
        navigate(`/chat/${result.conversationId}`, { replace: true });
        return;
      }
      state.reload();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Не удалось ответить');
      state.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="deal-card" style={{ marginBottom: 16 }}>
      <div className="seller__name">Заявка на услугу</div>
      <div className="card__headline">
        {item.client.name} хочет воспользоваться вашей услугой
      </div>

      {item.note && <div style={{ whiteSpace: 'pre-line', marginTop: 8 }}>«{item.note}»</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="my-listing__actions">
        <button
          type="button"
          className="button button--sm"
          disabled={busy}
          onClick={() => void answer('accept')}
        >
          Принять запрос
        </button>
        <button
          type="button"
          className="button button--secondary button--sm"
          disabled={busy}
          onClick={() => void answer('decline')}
        >
          Отказать
        </button>
      </div>

      <p className="form-hint">
        Посмотрите профиль и отзывы ниже. Написать заказчику можно будет после того, как
        примете заявку.
      </p>
    </div>
  );
}
