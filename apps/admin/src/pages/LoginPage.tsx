import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
const DEV_LOGIN_ENABLED = import.meta.env.DEV;

/**
 * Вход в админку.
 *
 * Основной способ — Telegram Login Widget: тот же аккаунт, что и в боте,
 * никаких отдельных паролей. Виджет работает только на домене, прописанном
 * боту через /setdomain у @BotFather, поэтому на localhost он не запустится —
 * для разработки предусмотрен вход по ADMIN_DEV_TOKEN, который в продакшене
 * отключён на стороне API.
 */
export function LoginPage() {
  const { signIn } = useAuth();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!BOT_USERNAME || !widgetRef.current) return;

    // Виджет вызывает глобальную функцию по имени — другого способа получить
    // от него результат он не предоставляет.
    (window as unknown as Record<string, unknown>).onTelegramAuth = async (
      payload: Record<string, unknown>,
    ) => {
      setError(null);
      try {
        const { token, user } = await api.loginWithWidget(payload);
        signIn(user, token);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось войти');
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    widgetRef.current.appendChild(script);

    const container = widgetRef.current;
    return () => {
      container.innerHTML = '';
      delete (window as unknown as Record<string, unknown>).onTelegramAuth;
    };
  }, [signIn]);

  const devLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.loginWithDevToken(devToken.trim());
      signIn(user, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <h1 className="login__title">Админка каталога</h1>
        <p className="login__subtitle">Управление специалистами, категориями и отзывами</p>

        {error && <div className="alert alert--error">{error}</div>}

        {BOT_USERNAME ? (
          <div ref={widgetRef} />
        ) : (
          <div className="alert alert--info">
            Не задан <code>TELEGRAM_BOT_USERNAME</code> — вход через Telegram недоступен.
          </div>
        )}

        {DEV_LOGIN_ENABLED && (
          <>
            <div className="login__divider">вход для разработки</div>
            <form onSubmit={devLogin}>
              <div className="field">
                <label className="field__label" htmlFor="dev-token">
                  ADMIN_DEV_TOKEN
                </label>
                <input
                  id="dev-token"
                  className="input"
                  type="password"
                  value={devToken}
                  onChange={(event) => setDevToken(event.target.value)}
                  placeholder="значение из .env"
                />
                <span className="field__hint">
                  Работает только при NODE_ENV ≠ production. Входит под первым администратором из базы.
                </span>
              </div>
              <button type="submit" className="button" style={{ width: '100%' }} disabled={busy || !devToken.trim()}>
                {busy ? 'Входим...' : 'Войти'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
