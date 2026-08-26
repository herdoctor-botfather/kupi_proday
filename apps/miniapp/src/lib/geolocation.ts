import { useCallback, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

interface GeoState {
  coords: Coords | null;
  loading: boolean;
  error: string | null;
}

/**
 * Геолокация браузера. Telegram отдаёт Mini App обычный navigator.geolocation,
 * поэтому отдельного SDK не нужно — но нужен внятный текст ошибки: чаще всего
 * пользователь просто отказал в доступе, и это не поломка.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ coords: null, loading: false, error: null });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ coords: null, loading: false, error: 'Устройство не поддерживает геолокацию' });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
          loading: false,
          error: null,
        });
      },
      (error) => {
        const messages: Record<number, string> = {
          1: 'Доступ к геолокации запрещён. Разрешите его в настройках, чтобы искать рядом.',
          2: 'Не удалось определить местоположение',
          3: 'Определение местоположения заняло слишком долго',
        };
        setState({ coords: null, loading: false, error: messages[error.code] ?? 'Ошибка геолокации' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  const clear = useCallback(() => setState({ coords: null, loading: false, error: null }), []);

  return { ...state, request, clear };
}
