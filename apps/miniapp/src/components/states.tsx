import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function LoadingState({ text = 'Загружаем...' }: { text?: string }) {
  return (
    <div className="state">
      <div className="state__icon">⏳</div>
      {text}
    </div>
  );
}

/**
 * Пустой экран.
 *
 * На молодой площадке пустых разделов больше, чем полных, и «здесь пока
 * пусто» звучит как «здесь никого нет — уходите». С кнопкой пустота
 * становится приглашением: первым в разделе быть выгоднее всего — все,
 * кто зайдёт, увидят только тебя.
 */
export function EmptyState({
  icon = '🔍',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="state">
      <div className="state__icon">{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {hint && <div style={{ marginTop: 6 }}>{hint}</div>}
      {action && (
        <Link className="button" style={{ marginTop: 16 }} to={action.to}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state__icon">⚠️</div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>Что-то пошло не так</div>
      <div style={{ marginTop: 6 }}>{message}</div>
      {onRetry && (
        <button type="button" className="button button--secondary" style={{ marginTop: 16 }} onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

/** Единая обработка трёх состояний загрузки — чтобы не повторять её в каждой странице. */
export function AsyncContent<T>({
  state,
  children,
  empty,
}: {
  state: { data: T | null; loading: boolean; error: string | null; reload: () => void };
  children: (data: T) => ReactNode;
  empty?: ReactNode;
}) {
  if (state.loading && state.data === null) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data === null) return empty ?? <EmptyState title="Ничего не найдено" />;
  return <>{children(state.data)}</>;
}
