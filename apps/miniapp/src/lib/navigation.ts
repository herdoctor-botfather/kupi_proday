import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Куда возвращаться, если истории переходов нет.
 *
 * Такое случается чаще, чем кажется: приложение открыто по deep link сразу
 * на карточке специалиста, или первый переход был сделан с заменой записи.
 * Без запасного маршрута кнопка «Назад» в шапке Telegram видна, но
 * не реагирует — для пользователя это выглядит как зависшее приложение.
 */
const PARENT_ROUTE: Array<[RegExp, string]> = [
  [/^\/profile\/application$/, '/profile/my-card'],
  [/^\/profile\/my-card$/, '/profile'],
  [/^\/specialist\//, '/specialists'],
  [/^\/specialists/, '/'],
];

function parentOf(pathname: string): string {
  for (const [pattern, parent] of PARENT_ROUTE) {
    if (pattern.test(pathname)) return parent;
  }
  return '/';
}

/**
 * Возврат на предыдущий экран с запасным вариантом.
 *
 * React Router хранит позицию в истории в window.history.state.idx.
 * Нулевая позиция означает, что уходить назад некуда.
 */
export function useGoBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const index = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof index === 'number' && index > 0) {
      navigate(-1);
      return;
    }
    navigate(parentOf(location.pathname), { replace: true });
  }, [navigate, location.pathname]);
}
