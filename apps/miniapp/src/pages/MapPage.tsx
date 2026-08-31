import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SpecialistListItem } from '@app/shared';
import { api } from '../lib/api';
import {
  loadYandexMaps,
  normalizeBounds,
  type LatLng,
  type MapBounds,
  type YmapsApi,
  type YmapsClusterer,
  type YmapsMap,
} from '../lib/yandex-maps';
import { ErrorState, LoadingState } from '../components/states';
import { Rating } from '../components/Rating';
import { useGeolocation } from '../lib/geolocation';
import { haptic } from '../lib/telegram';

/**
 * Стрелка «где я» — тот же знак, что в любом навигаторе.
 * Подпись словами занимала пол-экрана и выглядела поверх карты инородно.
 */
function IconLocate() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.6 20.2 20a.9.9 0 0 1-1.2 1.2L12 18l-7 3.2A.9.9 0 0 1 3.8 20L12 2.6Z" />
    </svg>
  );
}

/** Центр карты по умолчанию — Москва, если геолокация недоступна. */
const DEFAULT_CENTER: LatLng = [55.7558, 37.6173];
const DEFAULT_ZOOM = 11;

/**
 * Экран карты.
 *
 * Метки подгружаются под текущую область просмотра, а не все сразу —
 * иначе на большом каталоге карта встанет. Близкие метки собираются
 * в группы: два десятка мастеров в одном районе иначе превращаются
 * в нечитаемую кучу, из которой нельзя выбрать ни одного.
 */
export function MapPage() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YmapsMap | null>(null);
  const clustererRef = useRef<YmapsClusterer | null>(null);
  const apiRef = useRef<YmapsApi | null>(null);
  /** Разметка метки и группы: создаётся один раз, после готовности API. */
  const layoutsRef = useRef<{ marker: unknown; cluster: unknown } | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [specialists, setSpecialists] = useState<SpecialistListItem[]>([]);
  const [selected, setSelected] = useState<SpecialistListItem | null>(null);
  const geo = useGeolocation();

  // ─── Инициализация карты ───
  useEffect(() => {
    let cancelled = false;

    loadYandexMaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return;

        // Свои шаблоны вместо готовых значков: оформление приложения тёмное
        // с кислотным акцентом, и стандартные синие капли в нём выглядят
        // чужеродно. Внешний вид задаётся обычным CSS.
        layoutsRef.current = {
          marker: ymaps.templateLayoutFactory.createClass(
            '<div class="map-marker">{{ properties.label }}</div>',
          ),
          cluster: ymaps.templateLayoutFactory.createClass(
            '<div class="map-cluster">{{ properties.geoObjects.length }}</div>',
          ),
        };

        const map = new ymaps.Map(
          containerRef.current,
          { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, controls: ['zoomControl'] },
          { suppressMapOpenBlock: true },
        );

        const clusterer = new ymaps.Clusterer({
          clusterIconLayout: layoutsRef.current.cluster,
          clusterIconShape: { type: 'Circle', coordinates: [0, 0], radius: 22 },
          // Нажатие на группу приближает карту, а не открывает список:
          // на телефоне список внутри всплывающего окна неудобен.
          clusterDisableClickZoom: false,
          clusterOpenBalloonOnClick: false,
          gridSize: 64,
        });

        map.geoObjects.add(clusterer);
        // Первое событие приходит не сразу — задаём границы вручную,
        // иначе метки не загрузятся, пока карту не сдвинут.
        map.events.add('boundschange', () => setBounds(normalizeBounds(map.getBounds())));
        setBounds(normalizeBounds(map.getBounds()));

        apiRef.current = ymaps;
        mapRef.current = map;
        clustererRef.current = clusterer;
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
      clustererRef.current = null;
    };
  }, []);

  // ─── Загрузка меток под текущую область ───
  useEffect(() => {
    if (!bounds) return;
    let cancelled = false;

    api
      .specialistsOnMap({ ...bounds, limit: 300 })
      .then((items) => {
        if (!cancelled) setSpecialists(items);
      })
      .catch(() => {
        // Ошибку подгрузки меток не показываем модально: карта остаётся рабочей.
      });

    return () => {
      cancelled = true;
    };
  }, [bounds]);

  // ─── Отрисовка меток ───
  const renderMarkers = useCallback(() => {
    const ymaps = apiRef.current;
    const clusterer = clustererRef.current;
    const layouts = layoutsRef.current;
    if (!ymaps || !clusterer || !layouts) return;

    clusterer.removeAll();

    const placemarks = specialists
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((specialist) => {
        const label =
          specialist.ratingCount > 0
            ? `★ ${specialist.ratingAvg.toFixed(1)}`
            : specialist.displayName.split(' ')[0];

        const placemark = new ymaps.Placemark(
          [specialist.lat as number, specialist.lng as number],
          { label },
          {
            iconLayout: layouts.marker,
            // Область нажатия задаётся отдельно от разметки: без неё
            // API считает метку точкой и попасть по ней нельзя.
            iconShape: { type: 'Rectangle', coordinates: [[-30, -18], [30, 18]] },
          },
        );

        placemark.events.add('click', () => {
          haptic.tap();
          setSelected(specialist);
        });

        return placemark;
      });

    clusterer.add(placemarks);
  }, [specialists]);

  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  // ─── Центрирование на выбранном специалисте из карточки профиля ───
  useEffect(() => {
    if (!focusId || !mapRef.current) return;
    const target = specialists.find((s) => s.id === focusId);
    if (target?.lat && target.lng) {
      mapRef.current.setCenter([target.lat, target.lng], 15, { duration: 300 });
      setSelected(target);
    }
  }, [focusId, specialists]);

  // ─── Центрирование по геолокации ───
  useEffect(() => {
    if (!geo.coords || !mapRef.current) return;
    mapRef.current.setCenter([geo.coords.lat, geo.coords.lng], 14, { duration: 300 });
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
          className="map__locate"
          onClick={() => geo.request()}
          disabled={geo.loading}
          aria-label="Показать, где я"
          title="Показать, где я"
        >
          {geo.loading ? <span className="map__locate-wait" aria-hidden /> : <IconLocate />}
        </button>
        {specialists.length > 0 && <span className="map__count">{specialists.length}</span>}
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
