/**
 * Загрузка JS API Яндекс.Карт версии 2.1.
 *
 * Провайдер карт изолирован в этом модуле и в компоненте карты: чтобы
 * перейти на другого поставщика, достаточно заменить эти два файла,
 * остальное приложение работает с обычными координатами.
 *
 * Почему 2.1, а не 3. Ключ, выданный в кабинете Яндекса на «JavaScript API
 * и HTTP Геокодер», третью версию не открывает — она отдельный продукт
 * со своим ключом. Вдобавок в 2.1 группировка близких меток встроена,
 * а в 3 её пришлось бы писать руками. Для нашей задачи 2.1 удобнее.
 *
 * Ключ указывается в переменной VITE_YANDEX_MAPS_API_KEY.
 */

/**
 * Координата в порядке, принятом в API Яндекса версии 2.1:
 * [широта, долгота]. В третьей версии порядок обратный — если когда-нибудь
 * будете переходить, это первое место, где всё сломается молча.
 */
export type LatLng = [number, number];

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Прямоугольник видимой области: [[юг, запад], [север, восток]]. */
export type YmapsBounds = [LatLng, LatLng];

interface YmapsEvent {
  get(name: string): unknown;
}

export interface YmapsGeoObject {
  events: { add(type: string, handler: (event: YmapsEvent) => void): void };
}

export interface YmapsClusterer extends YmapsGeoObject {
  add(objects: YmapsGeoObject[]): void;
  removeAll(): void;
}

export interface YmapsMap {
  geoObjects: {
    add(object: YmapsGeoObject): void;
    remove(object: YmapsGeoObject): void;
    removeAll(): void;
  };
  events: { add(type: string, handler: () => void): void };
  getBounds(): YmapsBounds;
  setCenter(center: LatLng, zoom?: number, options?: { duration?: number }): void;
  destroy(): void;
  container: { fitToViewport(): void };
}

export interface YmapsApi {
  ready(callback: () => void): void;
  Map: new (
    container: HTMLElement,
    state: { center: LatLng; zoom: number; controls?: string[] },
    options?: Record<string, unknown>,
  ) => YmapsMap;
  Placemark: new (
    coordinates: LatLng,
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => YmapsGeoObject;
  Clusterer: new (options?: Record<string, unknown>) => YmapsClusterer;
  templateLayoutFactory: { createClass(template: string): unknown };
}

declare global {
  interface Window {
    ymaps?: YmapsApi;
  }
}

const SCRIPT_ID = 'yandex-maps-2';

let loader: Promise<YmapsApi> | null = null;

export class MapsUnavailableError extends Error {}

/**
 * Подключает скрипт карт один раз за сессию и дожидается готовности API.
 * Повторные вызовы переиспользуют тот же промис.
 */
export function loadYandexMaps(): Promise<YmapsApi> {
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

  loader = new Promise<YmapsApi>((resolve, reject) => {
    const finish = () => {
      const api = window.ymaps;
      if (!api) {
        reject(new MapsUnavailableError('Скрипт карт загрузился, но API недоступно'));
        return;
      }
      // ready вызывается после того, как API догрузит свои модули.
      api.ready(() => resolve(api));
    };

    if (document.getElementById(SCRIPT_ID) && window.ymaps) {
      finish();
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = finish;
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
export function normalizeBounds(bounds: YmapsBounds): MapBounds {
  const [[lat1, lng1], [lat2, lng2]] = bounds;
  return {
    north: Math.max(lat1, lat2),
    south: Math.min(lat1, lat2),
    east: Math.max(lng1, lng2),
    west: Math.min(lng1, lng2),
  };
}
