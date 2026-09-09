import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import { useAuth, useIsAuthenticated } from '../lib/auth';
import {
  IconCatalog,
  IconChats,
  IconMap,
  IconMarket,
  IconPlus,
  IconProfile,
} from './TabIcons';

const TABS = [
  { to: '/', icon: IconCatalog, label: 'Каталог', end: true },
  { to: '/map', icon: IconMap, label: 'Карта', end: false },
  { to: '/market', icon: IconMarket, label: 'Товары', end: false },
  { to: '/chats', icon: IconChats, label: 'Чаты', end: false },
  { to: '/profile', icon: IconProfile, label: 'Профиль', end: false },
];

/**
 * Экраны, на которых круглая кнопка «разместить» не показывается.
 *
 * Правило простое: она предлагает начать то, что человек либо уже
 * начал, либо может начать соседней кнопкой. В обоих случаях она не
 * помогает, а только закрывает собой содержимое — на формах ей
 * достаются поля и кнопки выбора.
 */
const FAB_HIDDEN_ON = [
  '/map',
  '/market/my',
  '/market/sell',
  '/wanted/new',
  '/profile/application',
];

/** Как часто обновляем счётчик непрочитанного. */
const UNREAD_POLL_MS = 20000;

export function TabBar() {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [creating, setCreating] = useState(false);

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
    <>
      {/*
        Кнопка «разместить» вынесена из вкладок и поднята над панелью.
        Вкладки отвечают на вопрос «куда пойти», а это — действие, и его
        видно с любого экрана: и продавец, и мастер начинают отсюда.
      */}
      {/*
        Экраны, где круглая кнопка лишняя:

        • карта — она приходится ровно на карточку выбранного мастера
          и перекрывает «Открыть профиль»;
        • «Мои объявления» — там уже есть своя кнопка размещения во всю
          ширину, и две кнопки одного действия рядом только мешают
          выбрать, на какую нажать.
      */}
      {isAuthenticated && !FAB_HIDDEN_ON.some((path) => location.pathname.startsWith(path)) && (
        <button
          type="button"
          className="fab"
          aria-label="Разместить"
          onClick={() => {
            haptic.tap();
            setCreating(true);
          }}
        >
          <IconPlus />
        </button>
      )}

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

      {creating && <CreateSheet onClose={() => setCreating(false)} />}
    </>
  );
}

/** Что можно разместить: объявление о продаже или анкету исполнителя. */
function CreateSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const go = (to: string) => {
    haptic.tap();
    onClose();
    navigate(to);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet__grip" aria-hidden />
        <h2 className="sheet__title">Что разместим?</h2>

        <button type="button" className="sheet__option" onClick={() => go('/market/sell')}>
          <span className="sheet__option-icon" aria-hidden>
            🏷
          </span>
          <span className="sheet__option-body">
            <span className="sheet__option-title">Объявление о продаже</span>
            <span className="sheet__option-text">Название, цена, фотографии — и на витрину</span>
          </span>
        </button>

        <button type="button" className="sheet__option" onClick={() => go('/wanted/new')}>
          <span className="sheet__option-icon" aria-hidden>
            🔎
          </span>
          <span className="sheet__option-body">
            <span className="sheet__option-title">Запрос на покупку</span>
            <span className="sheet__option-text">
              Опишите, что ищете, — продавцы предложат сами
            </span>
          </span>
        </button>

        <button
          type="button"
          className="sheet__option"
          onClick={() => go(user?.hasSpecialistProfile ? '/profile/my-card' : '/profile/application')}
        >
          <span className="sheet__option-icon" aria-hidden>
            🛠
          </span>
          <span className="sheet__option-body">
            <span className="sheet__option-title">
              {user?.hasSpecialistProfile ? 'Моя анкета исполнителя' : 'Анкета исполнителя'}
            </span>
            <span className="sheet__option-text">
              {user?.hasSpecialistProfile
                ? 'Статус публикации, просмотры и правка'
                : 'Расскажите об услугах — вас будут находить клиенты'}
            </span>
          </span>
        </button>

        <button type="button" className="sheet__cancel" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
