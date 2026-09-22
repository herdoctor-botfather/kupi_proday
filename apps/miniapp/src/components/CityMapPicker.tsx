import { useEffect, useRef, useState } from 'react';
import { loadYandexMaps, type LatLng, type YmapsApi, type YmapsGeoObject, type YmapsMap } from '../lib/yandex-maps';
import { useGeolocation } from '../lib/geolocation';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';

/** Центр России по умолчанию — Москва: там карта открывается, пока место не известно. */
const START: LatLng = [55.751, 37.618];

/**
 * Город — нажатием на карту.
 *
 * Список из сотни городов хорош, когда знаешь название. Но человек из
 * посёлка под Казанью не найдёт в нём посёлок, а жителю пригорода не
 * очевидно, какой город назвать. На карте он просто показывает, где он,
 * а название населённого пункта мы узнаём у геокодера — и показываем,
 * прежде чем применить: ошибиться точкой легко, и выбор должен быть виден.
 */
export function CityMapPicker({ onPick }: { onPick: (city: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YmapsMap | null>(null);
  const apiRef = useRef<YmapsApi | null>(null);
  const pinRef = useRef<YmapsGeoObject | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [city, setCity] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const geo = useGeolocation();

  /** Ставит метку в точку и спрашивает у геокодера, что там за город. */
  const locate = async (point: LatLng) => {
    const ymaps = apiRef.current;
    const map = mapRef.current;
    if (!ymaps || !map) return;

    if (pinRef.current) map.geoObjects.remove(pinRef.current);
    pinRef.current = new ymaps.Placemark(point, {}, { preset: 'islands#redDotIcon' });
    map.geoObjects.add(pinRef.current);

    setResolving(true);
    setHint(null);
    try {
      // Название спрашиваем у нашего сервера: геокодер Яндекса наш ключ
      // карт не обслуживает, а сервер ходит в открытый геокодер сам.
      const { city: name } = await api.cityAt(point[0], point[1]);
      setCity(name);
      if (!name) setHint('Здесь не нашлось населённого пункта — нажмите ближе к городу');
    } catch (err) {
      setCity(null);
      setHint(err instanceof Error ? err.message : 'Не удалось определить город. Выберите его из списка');
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadYandexMaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return;
        const map = new ymaps.Map(
          containerRef.current,
          { center: START, zoom: 9, controls: ['zoomControl'] },
          { suppressMapOpenBlock: true },
        );
        map.events.add('click', (event) => {
          haptic.tap();
          void locate(event.get('coords') as LatLng);
        });
        apiRef.current = ymaps;
        mapRef.current = map;
        setStatus('ready');
        // Сразу спрашиваем, где человек: чаще всего город — тот, где он сейчас.
        geo.request();
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // Карта создаётся один раз на открытие.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Местоположение пришло — центрируем и сразу определяем город.
  useEffect(() => {
    if (!geo.coords || !mapRef.current) return;
    const point: LatLng = [geo.coords.lat, geo.coords.lng];
    mapRef.current.setCenter(point, 11, { duration: 300 });
    void locate(point);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.coords]);

  if (status === 'error') {
    return <p className="form-hint">Карта сейчас недоступна — выберите город из списка.</p>;
  }

  return (
    <div className="city-map">
      <div ref={containerRef} className="city-map__canvas" />

      <div className="city-map__bar">
        <button
          type="button"
          className="button button--secondary city-map__locate"
          disabled={geo.loading}
          onClick={() => {
            haptic.tap();
            geo.request();
          }}
        >
          {geo.loading ? 'Ищем…' : '📍 Где я'}
        </button>
        <span className="city-map__found">
          {resolving ? 'Определяем город…' : city ? `📍 ${city}` : 'Нажмите на карте нужное место'}
        </span>
      </div>

      {(hint || geo.error) && <p className="form-hint">{hint ?? geo.error}</p>}

      <button
        type="button"
        className="button"
        disabled={!city || resolving}
        onClick={() => {
          if (!city) return;
          haptic.success();
          onPick(city);
        }}
      >
        {city ? `Выбрать: ${city}` : 'Выберите место на карте'}
      </button>
    </div>
  );
}
