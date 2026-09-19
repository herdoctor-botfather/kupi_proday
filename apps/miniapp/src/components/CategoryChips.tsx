import type { Category } from '@app/shared';
import { ChipsRow } from './ChipsRow';
import { haptic } from '../lib/telegram';

/**
 * Разделы и подкатегории в ленте.
 *
 * Два ряда вместо одного длинного. Раньше категории были плоским
 * списком, и добавить их стало некуда: тридцать чипов в строку человек
 * не пролистывает до конца, а значит последние категории для него не
 * существуют. Теперь верхний ряд — десяток разделов, а подкатегории
 * появляются только у открытого раздела, где их немного.
 *
 * Выбор раздела не сбрасывается при выборе подкатегории: нижний ряд
 * остаётся на месте, чтобы можно было перебрать соседние полки, не
 * возвращаясь наверх.
 */
export function CategoryChips({
  categories,
  current,
  onChange,
  allLabel = 'Все категории',
}: {
  /** Дерево: разделы с вложенными подкатегориями. */
  categories: Category[];
  /** Выбранный слаг — раздела или подкатегории. */
  current?: string;
  onChange: (slug: string | null) => void;
  allLabel?: string;
}) {
  if (categories.length === 0) return null;

  const root =
    categories.find((category) => category.slug === current) ??
    categories.find((category) => category.children?.some((child) => child.slug === current));

  const children = root?.children ?? [];

  const pick = (slug: string | null) => {
    haptic.tap();
    onChange(slug);
  };

  return (
    <>
      <ChipsRow>
        <button type="button" className={`chip${!current ? ' chip--active' : ''}`} onClick={() => pick(null)}>
          {allLabel}
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`chip${root?.slug === category.slug ? ' chip--active' : ''}`}
            onClick={() => pick(category.slug)}
          >
            {category.icon} {category.name}
          </button>
        ))}
      </ChipsRow>

      {children.length > 0 && (
        <ChipsRow>
          {/* «Весь раздел» — возврат с полки к шкафу целиком. Без него
              выбранную подкатегорию нельзя расширить обратно, не сбросив
              заодно и раздел. */}
          <button
            type="button"
            className={`chip chip--sub${current === root?.slug ? ' chip--active' : ''}`}
            onClick={() => pick(root?.slug ?? null)}
          >
            Весь раздел
          </button>
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className={`chip chip--sub${current === child.slug ? ' chip--active' : ''}`}
              onClick={() => pick(child.slug)}
            >
              {child.name}
              {child.itemCount > 0 && <span style={{ opacity: 0.6 }}> {child.itemCount}</span>}
            </button>
          ))}
        </ChipsRow>
      )}
    </>
  );
}
