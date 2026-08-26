import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth, useIsAdmin } from '../lib/auth';

/** Боковое меню и общая рамка админки. */
export function Layout() {
  const { user, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  // Счётчик очереди модерации — чтобы не заходить в раздел ради проверки.
  const stats = useAsync(() => api.stats(), []);
  // Счётчик жалоб — отдельным запросом: в статистику он не входит,
  // а видеть его в меню важнее, чем экономить один запрос.
  const reports = useAsync(() => api.reports(), []);
  const pendingReviews = stats.data?.reviews.pending ?? 0;
  // Новые анкеты и правки опубликованных — обе группы требуют решения.
  const pendingApplications = (stats.data?.specialists.pending ?? 0) + (stats.data?.specialists.changed ?? 0);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          Каталог специалистов
          <small>панель управления</small>
        </div>

        <NavLink to="/" end className={navClass}>
          <span aria-hidden>📊</span> Обзор
        </NavLink>

        <NavLink to="/reports" className={navClass}>
          <span aria-hidden>🚩</span> Жалобы
          {(reports.data?.length ?? 0) > 0 && (
            <span className="nav-item__badge">{reports.data!.length}</span>
          )}
        </NavLink>

        <NavLink to="/reviews" className={navClass}>
          <span aria-hidden>💬</span> Отзывы
          {pendingReviews > 0 && <span className="nav-item__badge">{pendingReviews}</span>}
        </NavLink>

        {isAdmin && (
          <>
            <NavLink to="/applications" className={navClass}>
              <span aria-hidden>📨</span> Заявки
              {pendingApplications > 0 && <span className="nav-item__badge">{pendingApplications}</span>}
            </NavLink>
            <NavLink to="/specialists" className={navClass}>
              <span aria-hidden>👥</span> Специалисты
            </NavLink>
            <NavLink to="/categories" className={navClass}>
              <span aria-hidden>🗂</span> Категории
            </NavLink>
          </>
        )}

        <div className="sidebar__footer">
          <div style={{ marginBottom: 8 }}>
            {user?.firstName} {user?.lastName}
            <div>{user?.role === 'ADMIN' ? 'администратор' : 'модератор'}</div>
          </div>
          <button type="button" className="button button--secondary button--sm" onClick={signOut}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' nav-item--active' : ''}`;
