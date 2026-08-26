/** Гео-утилиты для поиска «рядом». */

export const EARTH_RADIUS_KM = 6371;

/**
 * Прямоугольник вокруг точки — грубый предфильтр перед точным расчётом.
 * Он отсекает большую часть строк по индексу (lat, lng), а гаверсинус
 * досчитывает уже на малой выборке.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  // Длина градуса долготы сокращается к полюсам; у самых полюсов косинус → 0,
  // поэтому ограничиваем снизу, чтобы не получить бесконечную дельту.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const lngDelta = radiusKm / (111.32 * cosLat);

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/** Расстояние между двумя точками по большому кругу, км. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
