import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { TabBar } from './components/TabBar';
import { CatalogPage } from './pages/CatalogPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ApplicationPage } from './pages/ApplicationPage';
import { MyCardPage } from './pages/MyCardPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { WalletPage } from './pages/WalletPage';
import { ChatsPage } from './pages/ChatsPage';
import { ChatPage } from './pages/ChatPage';
import { MarketPage } from './pages/MarketPage';
import { MarketCatalogPage } from './pages/MarketCatalogPage';
import { MarketBrowsePage } from './pages/MarketBrowsePage';
import { WantedHubPage } from './pages/WantedHubPage';
import { WantedPage } from './pages/WantedPage';
import { ListingPage } from './pages/ListingPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { SellPage } from './pages/SellPage';
import { SpecialistsPage } from './pages/SpecialistsPage';
import { SpecialistPage } from './pages/SpecialistPage';
import { MapPage } from './pages/MapPage';
import { ProfilePage } from './pages/ProfilePage';
import { EmptyState } from './components/states';
import { useBackButtonEffect } from './lib/telegram';
import { isRoleChosenThisSession, markRoleChosen } from './lib/session';
import { clearStartRoute, startRoute } from './lib/start-param';
import { useGoBack } from './lib/navigation';

/** Вкладки нижней навигации: с них не «возвращаются», на них переключаются. */
const ROOT_ROUTES = new Set(['/', '/onboarding', '/map', '/chats', '/profile', '/market', '/wallet']);

/**
 * Есть ли куда возвращаться.
 *
 * React Router держит позицию в истории в window.history.state.idx.
 * Ноль означает, что текущий экран — первый за запуск приложения.
 */
const hasHistory = (): boolean => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

export function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * Бот может открыть приложение сразу на нужном экране. Такая ссылка
   * заменяет собой выбор роли: человек уже сказал, зачем пришёл, и просить
   * его выбрать ещё раз значило бы не услышать.
   *
   * Переход делаем эффектом, а не прямо в разметке. В режиме разработки
   * React отрисовывает дерево дважды и результат первого прохода
   * отбрасывает — вместе с ним пропадал бы и переход, а человек оставался
   * бы на главной, что бы он ни нажал в боте.
   */
  const [pendingRoute, setPendingRoute] = useState(() => startRoute());

  useEffect(() => {
    if (!pendingRoute) return;
    // Ждём токен: экраны вроде «моя анкета» запрашивают данные сразу
    // при появлении, и без токена первый же запрос вернул бы отказ.
    if (status === 'loading') return;

    markRoleChosen();
    clearStartRoute();
    setPendingRoute(null);
    if (location.pathname !== pendingRoute) navigate(pendingRoute, { replace: true });
  }, [pendingRoute, status, location.pathname, navigate]);

  // Мгновение до перехода показываем пустой экран: иначе успел бы мелькнуть
  // экран выбора роли, который мы как раз собираемся пропустить.
  if (pendingRoute) return <div className="app" />;

  // Экран выбора показывается при каждом открытии приложения, а не только
  // при первом. Запомненный в профиле выбор лишь подсвечивает прежний ответ:
  // роль должна оставаться сменяемой, иначе заказчик, решивший разместить
  // анкету, попадал бы в тупик.
  //
  // Гость (запуск вне Telegram) выбор не делает — ему доступен только каталог.
  const needsOnboarding = status === 'authenticated' && !isRoleChosenThisSession();
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="app">
      <Shell />
      <TabBar />
    </div>
  );
}

function Shell() {
  const location = useLocation();
  const goBack = useGoBack();
  const isRoot = ROOT_ROUTES.has(location.pathname);

  // Кнопка «Назад» в шапке Telegram заменяет собой браузерную навигацию.
  //
  // На вкладке она нужна не всегда, но и скрывать её там нельзя: в каталог
  // можно прийти не с самого начала, а из барахолки — и тогда без кнопки
  // экран становится тупиком, из которого выход только через перезапуск.
  // Поэтому решает не тип экрана, а наличие истории за спиной.
  const showBack = !isRoot || hasHistory();
  useEffect(() => useBackButtonEffect(goBack, showBack), [showBack, goBack, location.key]);

  // Новый экран всегда открывается сверху, а не с позиции прокрутки предыдущего.
  useEffect(() => {
    document.querySelector('.page')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<CatalogPage />} />
      <Route path="/specialists" element={<SpecialistsPage />} />
      <Route path="/specialist/:idOrSlug" element={<SpecialistPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/market" element={<MarketPage />} />
      <Route path="/market/browse" element={<MarketCatalogPage />} />
      <Route path="/market/listings" element={<MarketBrowsePage />} />
      <Route path="/wanted" element={<WantedHubPage />} />
      <Route path="/wanted/browse" element={<WantedPage />} />
      <Route path="/wanted/new" element={<SellPage />} />
      <Route path="/market/my" element={<MyListingsPage />} />
      <Route path="/market/sell" element={<SellPage />} />
      <Route path="/listing/:idOrSlug" element={<ListingPage />} />
      <Route path="/chats" element={<ChatsPage />} />
      <Route path="/chat/:id" element={<ChatPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/profile/application" element={<ApplicationPage />} />
      <Route path="/profile/my-card" element={<MyCardPage />} />
      <Route path="/profile/subscription" element={<SubscriptionPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        path="*"
        element={
          <div className="page">
            <EmptyState icon="🧭" title="Страница не найдена" />
          </div>
        }
      />
    </Routes>
  );
}
