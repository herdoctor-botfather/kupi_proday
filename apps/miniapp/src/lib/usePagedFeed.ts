import { useEffect, useState } from 'react';
import type { Paginated } from '@app/shared';
import { useAsync } from './useAsync';

export interface PagedFeed<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  /** Идёт первая загрузка — показывать нечего. */
  loading: boolean;
  /** Догружается продолжение — список уже виден. */
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
}

/**
 * Лента, которая растёт по кнопке «смотреть ещё».
 *
 * Бесконечная прокрутка выглядела бы современнее, но на главной с двумя
 * лентами подряд она мешает: вторая лента становится недостижимой, потому
 * что первая догружается бесконечно. Кнопка оставляет решение за человеком.
 */
export function usePagedFeed<T>(
  load: (page: number) => Promise<Paginated<T>>,
  deps: unknown[] = [],
): PagedFeed<T> {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const state = useAsync(() => load(page), [...deps, page]);

  useEffect(() => {
    if (!state.data) return;
    // Первая страница заменяет накопленное, остальные дописываются:
    // иначе повторная загрузка удваивала бы уже показанные карточки.
    setItems((prev) => (state.data!.page === 1 ? state.data!.items : [...prev, ...state.data!.items]));
  }, [state.data]);

  return {
    items,
    total: state.data?.total ?? 0,
    hasMore: state.data?.hasMore ?? false,
    loading: state.loading && items.length === 0,
    loadingMore: state.loading && items.length > 0,
    error: state.error,
    loadMore: () => setPage((current) => current + 1),
  };
}
