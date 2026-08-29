import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent } from '../components/states';
import { useIsAdmin } from '../lib/auth';
import { useState } from 'react';

/** Сводка по каталогу: то, что администратор должен увидеть при входе. */
export function DashboardPage() {
  const stats = useAsync(() => api.stats(), []);
  const isAdmin = useIsAdmin();
  const [expireResult, setExpireResult] = useState<string | null>(null);
  const [expiring, setExpiring] = useState(false);

  const expire = async () => {
    setExpiring(true);
    try {
      const { expired } = await api.expireSubscriptions();
      setExpireResult(
        expired === 0
          ? 'Истёкших подписок не найдено.'
          : `Продвижение снято с ${expired} ${expired === 1 ? 'карточки' : 'карточек'}.`,
      );
      stats.reload();
    } catch (error) {
      setExpireResult(error instanceof Error ? error.message : 'Не удалось выполнить');
    } finally {
      setExpiring(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Обзор</h1>
          <p>Состояние каталога на текущий момент</p>
        </div>
      </div>

      <AsyncContent state={stats}>
        {(data) => (
          <>
            <div className="stat-grid">
              <div className={`stat${data.reviews.pending > 0 ? ' stat--attention' : ''}`}>
                <div className="stat__label">Отзывы на модерации</div>
                <div className="stat__value">{data.reviews.pending}</div>
                <div className="stat__hint">
                  {data.reviews.pending > 0 ? (
                    <Link to="/reviews">Перейти к очереди →</Link>
                  ) : (
                    `всего отзывов: ${data.reviews.total}`
                  )}
                </div>
              </div>

              <div className={`stat${data.specialists.pending > 0 ? ' stat--attention' : ''}`}>
                <div className="stat__label">Заявки специалистов</div>
                <div className="stat__value">{data.specialists.pending}</div>
                <div className="stat__hint">
                  {data.specialists.pending > 0 ? (
                    <Link to="/applications">Проверить →</Link>
                  ) : (
                    'новых заявок нет'
                  )}
                </div>
              </div>

              <div className={`stat${data.specialists.changed > 0 ? ' stat--attention' : ''}`}>
                <div className="stat__label">Изменённые анкеты</div>
                <div className="stat__value">{data.specialists.changed}</div>
                <div className="stat__hint">
                  {data.specialists.changed > 0 ? (
                    <Link to="/applications">Посмотреть правки →</Link>
                  ) : (
                    'правок нет'
                  )}
                </div>
              </div>

              <div className={`stat${data.listings.pending > 0 ? ' stat--attention' : ''}`}>
                <div className="stat__label">Объявления на проверке</div>
                <div className="stat__value">{data.listings.pending}</div>
                <div className="stat__hint">
                  {data.listings.pending > 0 ? (
                    <Link to="/listings">Проверить →</Link>
                  ) : (
                    `на витрине: ${data.listings.active}`
                  )}
                </div>
              </div>

              <div className="stat">
                <div className="stat__label">Опубликовано</div>
                <div className="stat__value">{data.specialists.active}</div>
                <div className="stat__hint">всего карточек: {data.specialists.total}</div>
              </div>

              <div className="stat">
                <div className="stat__label">Пользователи</div>
                <div className="stat__value">{data.users.total}</div>
                <div className="stat__hint">+{data.users.newLast30Days} за 30 дней</div>
              </div>

              <div className="stat">
                <div className="stat__label">Активные подписки</div>
                <div className="stat__value">{data.subscriptions.active}</div>
                <div className="stat__hint">оплаченное размещение</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 22 }}>
              <div className="card__body">
                <h2 style={{ fontSize: 16, marginBottom: 4 }}>Самые просматриваемые</h2>
                <p className="cell-muted" style={{ margin: '0 0 14px' }}>
                  Топ-10 карточек по числу открытий профиля
                </p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Специалист</th>
                      <th>Просмотры</th>
                      <th>Рейтинг</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topViewed.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="cell-muted">
                          Пока никого не открывали
                        </td>
                      </tr>
                    ) : (
                      data.topViewed.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-primary">
                            {isAdmin ? <Link to={`/specialists/${row.id}`}>{row.displayName}</Link> : row.displayName}
                          </td>
                          <td>{row.viewCount}</td>
                          <td>
                            {row.ratingCount > 0 ? (
                              <>
                                <span className="stars">★</span> {row.ratingAvg.toFixed(1)}{' '}
                                <span className="cell-muted">({row.ratingCount})</span>
                              </>
                            ) : (
                              <span className="cell-muted">нет отзывов</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {isAdmin && (
              <div className="card">
                <div className="card__body">
                  <h2 style={{ fontSize: 16, marginBottom: 4 }}>Обслуживание</h2>
                  <p className="cell-muted" style={{ margin: '0 0 14px' }}>
                    Снять продвижение с карточек, у которых закончилась оплата. В продакшене эту
                    операцию стоит повесить на ежедневный cron — здесь она для ручного запуска.
                  </p>
                  {expireResult && <div className="alert alert--info">{expireResult}</div>}
                  <button type="button" className="button button--secondary" onClick={expire} disabled={expiring}>
                    {expiring ? 'Выполняем...' : 'Снять истёкшие подписки'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </AsyncContent>
    </>
  );
}
