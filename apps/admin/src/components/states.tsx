import type { ReactNode } from 'react';
import type { AsyncState } from '../lib/useAsync';

export function LoadingState() {
  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton" style={{ height: 64, marginBottom: 12 }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="state">
      <div className="state__icon">{icon}</div>
      <div className="state__title">{title}</div>
      {hint && <div>{hint}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state__icon">⚠️</div>
      <div className="state__title">Не удалось загрузить</div>
      <div>{message}</div>
      {onRetry && (
        <button type="button" className="button button--secondary" style={{ marginTop: 16 }} onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function AsyncContent<T>({
  state,
  children,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
}) {
  if (state.loading && state.data === null) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data === null) return <EmptyState title="Нет данных" />;
  return <>{children(state.data)}</>;
}
