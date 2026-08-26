import { NavLink } from 'react-router-dom';
import { haptic } from '../lib/telegram';

const TABS = [
  { to: '/', icon: '🗂', label: 'Каталог', end: true },
  { to: '/map', icon: '🗺', label: 'Карта', end: false },
  { to: '/profile', icon: '👤', label: 'Профиль', end: false },
];

export function TabBar() {
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
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
