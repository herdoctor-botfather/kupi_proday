import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CurrentUser } from '@app/shared';
import { api, setToken } from './api';
import { isInsideTelegram, tg } from './telegram';

interface AuthState {
  user: CurrentUser | null;
  status: 'loading' | 'authenticated' | 'guest' | 'error';
  error: string | null;
}

interface AuthContextValue extends AuthState {
  /** Обновляет пользователя после выбора роли или подачи анкеты. */
  setUser: (user: CurrentUser) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: 'loading',
  error: null,
  setUser: () => {},
});

/**
 * Авторизация происходит один раз при запуске: initData уходит на сервер,
 * обратно приходит JWT. Вне Telegram приложение остаётся в режиме гостя —
 * каталог и карта работают, личные функции недоступны.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading', error: null });

  useEffect(() => {
    let cancelled = false;

    async function authenticate() {
      const initData = tg()?.initData;

      if (!isInsideTelegram() || !initData) {
        // Запуск в обычном браузере: разработка и предпросмотр каталога.
        setToken(null);
        if (!cancelled) setState({ user: null, status: 'guest', error: null });
        return;
      }

      try {
        const { token, user } = await api.authTelegram(initData);
        setToken(token);
        if (!cancelled) setState({ user, status: 'authenticated', error: null });
      } catch (error) {
        setToken(null);
        if (!cancelled) {
          setState({
            user: null,
            status: 'error',
            error: error instanceof Error ? error.message : 'Не удалось войти',
          });
        }
      }
    }

    void authenticate();
    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback((user: CurrentUser) => {
    setState((prev) => ({ ...prev, user }));
  }, []);

  const value = useMemo(() => ({ ...state, setUser }), [state, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextValue => useContext(AuthContext);

/** Личные действия (отзывы, избранное) доступны только авторизованным. */
export const useIsAuthenticated = (): boolean => useAuth().status === 'authenticated';
