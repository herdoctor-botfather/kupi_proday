import type { CategoryAttribute } from '@app/shared';

/**
 * Разбор вариантов характеристики.
 *
 * Вариант хранится строкой и может нести до трёх частей:
 * «Родитель::Подпись::снимок». Родитель нужен зависимым спискам —
 * модели показываются только для выбранной марки; снимок нужен шагам,
 * которые выбирают глазами, а не чтением: кузов машины узнают по виду.
 *
 * Держать это одной строкой, а не тремя таблицами, — сознательно:
 * справочник правится как текст и не требует ни миграции, ни выкладки.
 */
export type Option = {
  /** Что сохраняется в объявлении и уходит в фильтр. */
  value: string;
  /** Имя снимка без расширения, если он для этого варианта нарисован. */
  image: string | null;
};

export function optionsOf(
  attribute: CategoryAttribute,
  chosen: Record<string, string | number | boolean | null>,
): Option[] {
  const parent = attribute.dependsOn ? chosen[attribute.dependsOn] : null;
  if (attribute.dependsOn && (typeof parent !== 'string' || !parent)) return [];

  return attribute.options.flatMap((raw) => {
    const parts = raw.split('::');
    if (attribute.dependsOn) {
      if (parts[0] !== parent) return [];
      return [{ value: parts[1] ?? '', image: parts[2] ?? null }];
    }
    return [{ value: parts[0], image: parts[1] ?? null }];
  });
}
