import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SpecialistStatus } from '@app/shared';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { STATUS_BADGE, STATUS_LABELS, formatDate } from '../lib/format';

const STATUSES: SpecialistStatus[] = ['PENDING', 'ACTIVE', 'HIDDEN', 'DRAFT', 'BLOCKED'];

/** Список карточек с поиском и фильтром по статусу. Фильтры живут в URL. */
export function SpecialistsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);

  const list = useAsync(
    () => api.specialists({ q: debouncedQuery.trim() || undefined, status: status || undefined, page }),
    [debouncedQuery, status, page],
  );

  const setStatus = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Специалисты</h1>
          <p>Карточки каталога: публикация, редактирование, подписки</p>
        </div>
        <Link to="/specialists/new" className="button">
          + Добавить
        </Link>
      </div>

      <div className="toolbar">
        <input
          className="input"
          type="search"
          value={query}
          placeholder="Имя, город или телефон"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Все статусы</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <AsyncContent state={list}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="Ничего не найдено"
              hint={query || status ? 'Попробуйте снять фильтры' : 'Добавьте первую карточку'}
            />
          ) : (
            <>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Специалист</th>
                        <th>Категории</th>
                        <th>Город</th>
                        <th>Статус</th>
                        <th>Рейтинг</th>
                        <th>Подписка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <Link to={`/specialists/${row.id}`} className="cell-primary">
                              {row.displayName}
                            </Link>
                            {row.isPromoted && (
                              <span className="badge badge--accent" style={{ marginLeft: 8 }}>
                                Топ
                              </span>
                            )}
                            <div className="cell-muted">{row.phone ?? 'телефон не указан'}</div>
                          </td>
                          <td className="cell-muted">
                            {row.categories.map(({ category }) => `${category.icon} ${category.name}`).join(', ') ||
                              '—'}
                          </td>
                          <td>{row.city}</td>
                          <td>
                            <span className={STATUS_BADGE[row.status]}>{STATUS_LABELS[row.status]}</span>
                          </td>
                          <td>
                            {row.ratingCount > 0 ? (
                              <>
                                <span className="stars">★</span> {row.ratingAvg.toFixed(1)}{' '}
                                <span className="cell-muted">({row.ratingCount})</span>
                              </>
                            ) : (
                              <span className="cell-muted">—</span>
                            )}
                          </td>
                          <td className="cell-muted">
                            {row.subscriptionUntil ? `до ${formatDate(row.subscriptionUntil)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <span className="cell-muted">Всего: {data.total}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="button button--secondary button--sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Назад
                  </button>
                  <button
                    type="button"
                    className="button button--secondary button--sm"
                    disabled={!data.hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Вперёд →
                  </button>
                </div>
              </div>
            </>
          )
        }
      </AsyncContent>
    </>
  );
}
