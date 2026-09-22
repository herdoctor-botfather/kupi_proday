import type { Category } from '@app/shared';
import { DropdownList } from './DropdownList';

/**
 * Разделы и подкатегории в ленте.
 *
 * Два раскрывающихся списка: «Раздел» и, когда он выбран, «Подраздел».
 * Раньше это были две строки чипов с прокруткой вбок: видно два-три
 * раздела из одиннадцати, а остальные существовали только для того, кто
 * догадается листать. Свёрнутый список показывает текущий выбор и
 * раскрывает все варианты разом.
 *
 * Выбор раздела не сбрасывается при выборе подкатегории: второй список
 * остаётся на месте, чтобы можно было перебрать соседние полки, не
 * возвращаясь к разделам.
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
  /** Больше не нужен: все подразделы видны в списке. Оставлен для совместимости вызовов. */
  stepsPath?: string;
}) {
  if (categories.length === 0) return null;

  const root =
    categories.find((category) => category.slug === current) ??
    categories.find((category) => category.children?.some((child) => child.slug === current));

  const children = root?.children ?? [];

  return (
    <>
      <DropdownList
        label={`🗂 ${allLabel}`}
        allLabel={allLabel}
        noun="разделов"
        selectedKey={root?.slug ?? null}
        items={categories.map((category) => ({
          key: category.slug,
          label: `${category.icon} ${category.name}`,
          count: category.itemCount,
        }))}
        onPick={onChange}
      />

      {root && children.length > 0 && (
        <DropdownList
          label="Весь раздел"
          // «Весь раздел» — возврат с полки к шкафу целиком: без него
          // выбранную подкатегорию нельзя расширить обратно, не сбросив
          // заодно и раздел.
          allLabel="Весь раздел"
          noun="подразделов"
          selectedKey={current === root.slug ? null : current}
          items={children.map((child) => ({ key: child.slug, label: child.name, count: child.itemCount }))}
          onPick={(slug) => onChange(slug ?? root.slug)}
        />
      )}
    </>
  );
}
