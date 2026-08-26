/**
 * Загрузка JS API Яндекс.Карт.
 *
 * Провайдер карт изолирован в этом модуле и в компоненте SpecialistsMap:
 * чтобы перейти на Google или OpenStreetMap, достаточно заменить эти два файла,
 * остальное приложение работает с обычными координатами.
 *
 * Ключ выдаётся в кабинете разработчика Яндекса и указывается
 * в переменной VITE_YANDEX_MAPS_API_KEY.
 */

/** Координата в порядке, принятом в API Яндекса: [долгота, широта]. */
export type LngLat = [number, number];

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface Ymaps3Location {
  center: LngLat;
  zoom: number;
  bounds: [LngLat, LngLat];
}

export interface YandexMap {
  addChild(child: unknown): YandexMap;
  removeChild(child: unknown): YandexMap;
  setLocation(location: { center?: LngLat; zoom?: number; duration?: number }): void;
  destroy(): void;
}

export interface Ymaps3Api {
  ready: Promise<void>;
  YMap: new (container: HTMLElement, props: { location: { center: LngLat; zoom: number } }) => YandexMap;
  YMapDefaultSchemeLayer: new (props?: Record<string, unknown>) => unknown;
  YMapDefaultFeaturesLayer: new (props?: Record<string, unknown>) => unknown;
  YMapMarker: new (props: { coordinates: LngLat; draggable?: boolean }, element: HTMLElement) => unknown;
  YMapListener: new (props: {
    onUpdate?: (event: { location: Ymaps3Location }) => void;
  }) => unknown;
}

declare global {
  interface Window {
    ymaps3?: Ymaps3Api;
  }
}

const SCRIPT_ID = 'yandex-maps-v3';

let loader: Promise<Ymaps3Api> | null = null;

export class MapsUnavailableError extends Error {}

/**
 * Подключает скрипт карт один раз за сессию и дожидается готовности API.
 * Повторные вызовы переиспользуют тот же промис.
 */
export function loadYandexMaps(): Promise<Ymaps3Api> {
  if (loader) return loader;

  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY;
  if (!apiKey) {
    loader = Promise.reject(
      new MapsUnavailableError(
        'Не задан ключ Яндекс.Карт. Укажите VITE_YANDEX_MAPS_API_KEY в файле .env.',
      ),
    );
    // Отклонённый промис, который никто не ждёт, роняет консоль предупреждением.
    loader.catch(() => {});
    return loader;
  }

  loader = new Promise<Ymaps3Api>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing && window.ymaps3) {
      void window.ymaps3.ready.then(() => resolve(window.ymaps3!));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      const api = window.ymaps3;
      if (!api) {
        reject(new MapsUnavailableError('Скрипт карт загрузился, но API недоступно'));
        return;
      }
      void api.ready.then(() => resolve(api));
    };
    script.onerror = () =>
      reject(new MapsUnavailableError('Не удалось загрузить карты. Проверьте соединение и ключ API.'));

    document.head.appendChild(script);
  });

  return loader;
}

/**
 * Приводит границы из API к понятному виду.
 * Порядок углов в ответе не гарантирован, поэтому берём минимум и максимум,
 * а не полагаемся на то, какой угол пришёл первым.
 */
export function normalizeBounds(bounds: [LngLat, LngLat]): MapBounds {
  const [[lng1, lat1], [lng2, lat2]] = bounds;
  return {
    north: Math.max(lat1, lat2),
    south: Math.min(lat1, lat2),
    east: Math.max(lng1, lng2),
    west: Math.min(lng1, lng2),
  };
}
