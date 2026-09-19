/**
 * Снимки кузовов: подключаются сборкой, по имени из справочника.
 *
 * Нарисованы не для всех поколений — только для самых ходовых моделей.
 * Там, где снимка нет, шаг остаётся списком строк и работает так же:
 * картинка помогает выбрать, но не является условием выбора.
 */
const PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/cars/*.jpg', { eager: true, import: 'default' }),
  ).map(([path, url]) => [path.replace(/^.*\/|\.jpg$/g, ''), url]),
);

export function carPhoto(name: string | null): string | null {
  if (!name) return null;
  return PHOTOS[name] ?? null;
}
