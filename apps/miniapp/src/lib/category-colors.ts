/**
 * Цвет плитки категории.
 *
 * Десять одинаковых серых квадратов читаются как список, а не как выбор:
 * глазу не за что зацепиться. Цвет даёт каждой категории собственное лицо
 * и позволяет узнавать её, не вчитываясь в подпись.
 *
 * Известным категориям цвет подобран по смыслу, остальным — выводится
 * из названия. Благодаря этому категория, добавленная администратором,
 * тоже получит свой цвет, причём один и тот же при каждой загрузке:
 * иначе плитки перекрашивались бы на каждом открытии приложения.
 */

/** Тон в градусах HSL. Насыщенность и светлота задаются в CSS — они зависят от темы. */
const KNOWN_HUES: Record<string, number> = {
  photo: 15, // коралловый
  repair: 38, // янтарный
  pets: 80, // оливковый
  health: 150, // мятный
  cleaning: 185, // бирюзовый
  auto: 215, // синий
  it: 250, // индиго
  tutors: 280, // фиолетовый
  events: 315, // пурпурный
  beauty: 340, // розовый
};

/**
 * Устойчивый тон из строки. Простая свёртка вроде FNV-1a: не криптография,
 * а лишь равномерное распределение по кругу оттенков.
 */
function hueFromSlug(slug: string): number {
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

export function categoryHue(slug: string): number {
  return KNOWN_HUES[slug] ?? hueFromSlug(slug);
}

/** Готовый объект стиля для плитки — CSS дальше сам подберёт оттенки под тему. */
export function categoryStyle(slug: string): React.CSSProperties {
  return { '--tile-hue': String(categoryHue(slug)) } as React.CSSProperties;
}
