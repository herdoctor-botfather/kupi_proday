import { useState } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { useIsAuthenticated } from '../lib/auth';

/**
 * Кнопка «в избранное».
 *
 * Состояние переключается сразу, не дожидаясь сервера: ожидание ответа
 * на такое мелкое действие выглядит как подвисание. Если запрос не прошёл,
 * состояние возвращается обратно.
 */
export function FavoriteButton({
  specialistId,
  initial = false,
  size = 'normal',
}: {
  specialistId: string;
  initial?: boolean;
  size?: 'normal' | 'large';
}) {
  const isAuthenticated = useIsAuthenticated();
  const [isFavorite, setIsFavorite] = useState(initial);
  const [busy, setBusy] = useState(false);

  // Гостю сохранять некуда — кнопку не показываем вовсе, чтобы не обещать лишнего.
  if (!isAuthenticated) return null;

  const toggle = async (event: React.MouseEvent) => {
    // Кнопка живёт внутри ссылки на карточку — иначе тап открыл бы профиль.
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    const next = !isFavorite;
    setIsFavorite(next);
    setBusy(true);
    haptic.tap();

    try {
      const result = await api.toggleFavorite(specialistId);
      // Сервер — источник истины: если состояния разошлись, берём его.
      setIsFavorite(result.isFavorite);
    } catch {
      setIsFavorite(!next);
      haptic.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`favorite${isFavorite ? ' favorite--on' : ''}${size === 'large' ? ' favorite--large' : ''}`}
      onClick={toggle}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}
