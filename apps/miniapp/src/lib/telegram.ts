/**
 * Тонкая обёртка над window.Telegram.WebApp.
 *
 * Приложение должно открываться и в обычном браузере — иначе разработку
 * пришлось бы вести только внутри Telegram. Поэтому все обращения к SDK
 * проходят через проверку доступности, а отсутствие Telegram считается
 * штатным режимом «вне Telegram».
 */

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string } };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  viewportStableHeight: number;
  isExpanded: boolean;
  ready(): void;
  expand(): void;
  close(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (ok: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    setText(text: string): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  setHeaderColor?(color: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg = (): TelegramWebApp | null => window.Telegram?.WebApp ?? null;

/** Приложение действительно запущено внутри Telegram (есть подписанная initData). */
export const isInsideTelegram = (): boolean => Boolean(tg()?.initData);

export function initTelegram(): void {
  const app = tg();
  if (!app) return;
  app.ready();
  app.expand();
  applyThemeVariables();
}

/**
 * Переносит переменные темы Telegram в CSS-переменные документа.
 * Так интерфейс автоматически совпадает с оформлением клиента пользователя,
 * включая тёмную тему, без единой строки логики в компонентах.
 */
export function applyThemeVariables(): void {
  const app = tg();
  const root = document.documentElement;
  if (!app) {
    root.dataset.theme = 'light';
    return;
  }

  root.dataset.theme = app.colorScheme;
  for (const [key, value] of Object.entries(app.themeParams)) {
    root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, value);
  }
}

export const haptic = {
  tap: () => tg()?.HapticFeedback?.selectionChanged(),
  success: () => tg()?.HapticFeedback?.notificationOccurred('success'),
  error: () => tg()?.HapticFeedback?.notificationOccurred('error'),
};

/** Открывает внешнюю ссылку правильным способом: t.me — внутри Telegram, остальное — в браузере. */
export function openExternal(url: string): void {
  const app = tg();
  if (!app) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(url)) {
    app.openTelegramLink(url);
  } else {
    app.openLink(url);
  }
}

/** Системная кнопка «Назад» в шапке Telegram. */
export function useBackButtonEffect(onBack: () => void, visible: boolean): () => void {
  const app = tg();
  if (!app) return () => {};

  if (visible) {
    app.BackButton.onClick(onBack);
    app.BackButton.show();
  } else {
    app.BackButton.hide();
  }

  return () => {
    app.BackButton.offClick(onBack);
    app.BackButton.hide();
  };
}
