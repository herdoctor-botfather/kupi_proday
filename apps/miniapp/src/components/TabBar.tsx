import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import { useIsAuthenticated } from '../lib/auth';
import { IconCatalog, IconChats, IconMap, IconMarket, IconProfile } from './TabIcons';

const TABS = [
  { to: '/', icon: IconCatalog, label: 'Каталог', end: true },
  { to: '/map', icon: IconMap, label: 'Карта', end: false },
  { to: '/market', icon: IconMarket, label: 'Товары', end: false },
  { to: '/chats', icon: IconChats, label: 'Чаты', end: false },
  { to: '/profile', icon: IconProfile, label: 'Профиль', end: false },
];

/** Как часто обновляем счётчик непрочитанного. */
const UNREAD_POLL_MS = 20000;

/**
 * Нижняя навигация.
 *
 * Круглой кнопки «разместить» здесь больше нет. Она задумывалась как
 * быстрый вход в размещение с любого экрана, но на деле почти везде
 * закрывала собой содержимое — карточки разделов, выбор категории,
 * кнопку размещения, которая и так была рядом. А вход в размещение
 * есть на восьми экранах помимо неё: на витрине, в разделах, в анкете,
 * в «Моих объявлениях» и на стартовом экране. Кнопка ничего не
 * открывала — только закрывала.
 */
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
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            onClick={() => haptic.tap()}
            className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
          >
            <span className="tabbar__icon">
              <Icon />
              {tab.to === '/chats' && unread > 0 && (
                <span className="tabbar__badge">{unread > 99 ? '99+' : unread}</span>
              )}
            </span>
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
