import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SpecialistListItem } from '@app/shared';
import { api } from '../lib/api';
import {
  loadYandexMaps,
  normalizeBounds,
  type LngLat,
  type MapBounds,
  type YandexMap,
  type Ymaps3Api,
} from '../lib/yandex-maps';
import { ErrorState, LoadingState } from '../components/states';
import { Rating } from '../components/Rating';
import { useGeolocation } from '../lib/geolocation';
import { haptic } from '../lib/telegram';

/** Центр карты по умолчанию — Москва, если геолокация недоступна. */
const DEFAULT_CENTER: LngLat = [37.6173, 55.7558];
const DEFAULT_ZOOM = 11;

/**
 * Экран карты. Маркеры подгружаются под текущую область просмотра,
 * а не все сразу — иначе на большом каталоге карта встанет.
 */
export function MapPage() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YandexMap | null>(null);
  const markersRef = useRef<unknown[]>([]);
  const apiRef = useRef<Ymaps3Api | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selected, setSelected] = useState<SpecialistListItem | null>(null);
  const geo = useGeolocation();

  // ─── Инициализация карты ───
  useEffect(() => {
    let cancelled = false;

    loadYandexMaps()
      .then((ymaps3) => {
        if (cancelled || !containerRef.current) return;

        const map = new ymaps3.YMap(containerRef.current, {
          location: { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM },
        });
        map.addChild(new ymaps3.YMapDefaultSchemeLayer());
        map.addChild(new ymaps3.YMapDefaultFeaturesLayer());
        map.addChild(
          new ymaps3.YMapListener({
            onUpdate: (event) => setBounds(normalizeBounds(event.location.bounds)),
          }),
        );

        apiRef.current = ymaps3;
        mapRef.current = map;
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Карта недоступна');
        setStatus('error');
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, []);

  // ─── Загрузка маркеров под текущую область ───
  const [specialists, setSpecialists] = useState<SpecialistListItem[]>([]);

  useEffect(() => {
    if (!bounds) return;
    let cancelled = false;

    api
      .specialistsOnMap({ ...bounds, limit: 300 })
      .then((items) => {
        if (!cancelled) setSpecialists(items);
      })
      .catch(() => {
        // Ошибку подгрузки маркеров не показываем модально: карта остаётся рабочей.
      });

    return () => {
      cancelled = true;
    };
  }, [bounds]);

  // ─── Отрисовка маркеров ───
  const renderMarkers = useCallback(() => {
    const ymaps3 = apiRef.current;
    const map = mapRef.current;
    if (!ymaps3 || !map) return;

    for (const marker of markersRef.current) map.removeChild(marker);
    markersRef.current = [];

    for (const specialist of specialists) {
      if (specialist.lat === null || specialist.lng === null) continue;

      const element = document.createElement('div');
      element.className = 'map-marker';
      element.textContent =
        specialist.ratingCount > 0 ? `★ ${specialist.ratingAvg.toFixed(1)}` : specialist.displayName.slice(0, 12);
      element.addEventListener('click', () => {
        haptic.tap();
        setSelected(specialist);
      });

      const marker = new ymaps3.YMapMarker({ coordinates: [specialist.lng, specialist.lat] }, element);
      map.addChild(marker);
      markersRef.current.push(marker);
    }
  }, [specialists]);

  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  // ─── Центрирование на выбранном специалисте из карточки профиля ───
  useEffect(() => {
    if (!focusId || !mapRef.current) return;
    const target = specialists.find((s) => s.id === focusId);
    if (target?.lat && target.lng) {
      mapRef.current.setLocation({ center: [target.lng, target.lat], zoom: 15, duration: 300 });
      setSelected(target);
    }
  }, [focusId, specialists]);

  // ─── Центрирование по геолокации ───
  useEffect(() => {
    if (!geo.coords || !mapRef.current) return;
    mapRef.current.setLocation({ center: [geo.coords.lng, geo.coords.lat], zoom: 14, duration: 300 });
  }, [geo.coords]);

  if (status === 'error') {
    return (
      <div className="page">
        <ErrorState message={error ?? 'Карта недоступна'} />
      </div>
    );
  }

  return (
    <div className="map-page">
      {status === 'loading' && <LoadingState text="Загружаем карту..." />}

      <div ref={containerRef} className="map" />

      <div className="map__filters">
        <button
          type="button"
          className="button button--secondary"
          style={{ width: 'auto', padding: '10px 14px' }}
          onClick={() => geo.request()}
          disabled={geo.loading}
        >
          {geo.loading ? '...' : '📍 Я здесь'}
        </button>
      </div>

      {selected && (
        <div className="map-sheet">
          <button
            type="button"
            onClick={() => setSelected(null)}
            style={{ float: 'right', color: 'var(--text-hint)' }}
            aria-label="Закрыть"
          >
            ✕
          </button>
          <div style={{ fontWeight: 600 }}>{selected.displayName}</div>
          {selected.headline && <div className="card__headline">{selected.headline}</div>}
          <div style={{ margin: '6px 0' }}>
            <Rating value={selected.ratingAvg} count={selected.ratingCount} />
          </div>
          <Link to={`/specialist/${selected.slug}`} className="button">
            Открыть профиль
          </Link>
        </div>
      )}
    </div>
  );
}
