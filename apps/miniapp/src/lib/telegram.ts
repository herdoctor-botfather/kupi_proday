/**
 * Тонкая обёртка над window.Telegram.WebApp.
 *
 * Приложение должно открываться и в обычном браузере — иначе разработку
 * пришлось бы вести только внутри Telegram. Поэтому все обращения к SDK
 * проходят через проверку доступности, а отсутствие Telegram считается
 * штатным режимом «вне Telegram».
 */

/** Чем закончилось окно оплаты. Значения приходят от Telegram как есть. */
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name: string; username?: string };
    /** Значение из ссылки `?startapp=` — по нему бот открывает нужный экран. */
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  viewportStableHeight: number;
  isExpanded: boolean;
  /** 'android' | 'ios' | 'tdesktop' | 'macos' | 'weba' | 'webk' | 'unknown' и прочие. */
  platform?: string;
  /** Появилось в Bot API 8.0; в старых клиентах поля и методов ниже нет. */
  isFullscreen?: boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  onEvent?(event: string, cb: () => void): void;
  ready(): void;
  expand(): void;
  close(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (ok: boolean) => void): void;
  /**
   * Открывает счёт на оплату. Появился в Bot API 6.1, но в старых
   * клиентах может отсутствовать — поэтому необязательный.
   */
  openInvoice?(url: string, callback?: (status: InvoiceStatus) => void): void;
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

/** Настольные клиенты Telegram: там окно мини-аппа фиксированного размера. */
const DESKTOP_PLATFORMS = new Set(['tdesktop', 'macos', 'linux', 'web', 'weba', 'webk']);

export function initTelegram(): void {
  const app = tg();
  if (!app) return;
  app.ready();
  app.expand();
  requestDesktopFullscreen(app);
  applyThemeVariables();
}

/**
 * На телефоне `expand()` растягивает мини-апп на весь экран, а на компьютере
 * не делает ничего: там Telegram открывает маленькое окно фиксированного
 * размера, и приложение в нём выглядит крошечным. Полноэкранный режим
 * (Bot API 8.0) занимает всё окно клиента и решает это.
 *
 * На телефоне его не просим намеренно: там он лезет под системную строку
 * состояния, и обычного растягивания достаточно. В клиентах старше 8.0
 * метода просто нет — тогда всё остаётся как было.
 */
function requestDesktopFullscreen(app: TelegramWebApp): void {
  if (!app.requestFullscreen || !DESKTOP_PLATFORMS.has(app.platform ?? '')) return;

  const sync = () => {
    document.documentElement.dataset.fullscreen = String(Boolean(tg()?.isFullscreen));
  };

  // Наличия метода недостаточно: скрипт SDK один для всех версий клиента,
  // и на старом Telegram вызов не молча ничего не делает, а бросает
  // исключение. Полный экран — украшение, ради него нельзя ронять запуск.
  try {
    app.onEvent?.('fullscreenChanged', sync);
    app.requestFullscreen();
    sync();
  } catch {
    document.documentElement.dataset.fullscreen = 'false';
  }
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

/**
 * Открывает окно оплаты и ждёт, чем оно кончится.
 *
 * Ответ «paid» означает, что Telegram принял деньги, но купленное
 * выдаёт сервер — по сообщению, которое Telegram отправит боту. Между
 * этими двумя событиями проходит секунда-другая, и приложению стоит
 * перечитать состояние, а не рисовать покупку сразу.
 *
 * Вне Telegram и в старых клиентах метода нет — тогда возвращаем 'failed',
 * чтобы вызывающий код показал понятное объяснение, а не завис в ожидании.
 */
export function openInvoice(url: string): Promise<InvoiceStatus> {
  const app = tg();
  const open = app?.openInvoice;
  if (!app || !open) return Promise.resolve('failed');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: InvoiceStatus) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };

    // Обещание без страховки могло бы не разрешиться никогда: клиент
    // вправе закрыть окно оплаты, не вызвав обратный вызов.
    const guard = setTimeout(() => finish('cancelled'), 10 * 60 * 1000);

    open.call(app, url, (status) => {
      clearTimeout(guard);
      finish(status);
    });
  });
}

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
