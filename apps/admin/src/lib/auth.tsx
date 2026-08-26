import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CurrentUser } from '@app/shared';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

interface AuthState {
  user: CurrentUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
}

interface AuthContextValue extends AuthState {
  signIn: (user: CurrentUser, token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: 'loading',
  signIn: () => {},
  signOut: () => {},
});

/**
 * Сессия админки. Токен переживает перезагрузку страницы, но при каждом
 * запуске проверяется запросом /auth/me: роль могли отозвать, и полагаться
 * на то, что записано в localStorage, нельзя.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading' });

  const signOut = useCallback(() => {
    setToken(null);
    setState({ user: null, status: 'anonymous' });
  }, []);

  const signIn = useCallback((user: CurrentUser, token: string) => {
    setToken(token);
    setState({ user, status: 'authenticated' });
  }, []);

  useEffect(() => {
    // Любой 401 из любого запроса возвращает на экран входа.
    setUnauthorizedHandler(() => setState({ user: null, status: 'anonymous' }));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setState({ user: null, status: 'anonymous' });
      return;
    }

    let cancelled = false;
    api
      .me()
      .then((user) => {
        if (cancelled) return;
        // Обычный пользователь мог сохранить токен от Mini App — в админке он не работает.
        if (user.role === 'USER') {
          setToken(null);
          setState({ user: null, status: 'anonymous' });
          return;
        }
        setState({ user, status: 'authenticated' });
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setState({ user: null, status: 'anonymous' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextValue => useContext(AuthContext);

/** Управление специалистами и категориями доступно только администраторам. */
export const useIsAdmin = (): boolean => useAuth().user?.role === 'ADMIN';
