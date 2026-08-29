import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import { useIsAuthenticated } from '../lib/auth';

const TABS = [
  { to: '/', icon: '🗂', label: 'Каталог', end: true },
  { to: '/map', icon: '🗺', label: 'Карта', end: false },
  { to: '/market', icon: '🛍', label: 'Товары', end: false },
  { to: '/chats', icon: '💬', label: 'Чаты', end: false },
  { to: '/profile', icon: '👤', label: 'Профиль', end: false },
];

/** Как часто обновляем счётчик непрочитанного. */
const UNREAD_POLL_MS = 20000;

export function TabBar() {
  const isAuthenticated = useIsAuthenticated();
  const [unread, setUnread] = useState(0);

  // Счётчик опрашивается редко и отдельным лёгким запросом: он нужен
  // на всех экранах, а грузить ради него список диалогов незачем.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const load = () => {
      api
        .unreadCount()
        .then(({ count }) => {
          if (!cancelled) setUnread(count);
        })
        .catch(() => {
          // Счётчик — украшение: его недоступность не должна ничего ломать.
        });
    };

    load();
    const timer = setInterval(load, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isAuthenticated]);

  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          onClick={() => haptic.tap()}
          className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
        >
          <span className="tabbar__icon" aria-hidden>
            {tab.icon}
            {tab.to === '/chats' && unread > 0 && (
              <span className="tabbar__badge">{unread > 99 ? '99+' : unread}</span>
            )}
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
