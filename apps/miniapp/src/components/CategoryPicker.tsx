import { useState } from 'react';
import type { Category } from '@app/shared';
import { ChipsRow } from './ChipsRow';
import { haptic } from '../lib/telegram';

/**
 * Выбор категорий при размещении — сначала раздел, потом полка в нём.
 *
 * Плоский список из двух сотен категорий в форме нечитаем: человек
 * ищет свою строку глазами и в итоге берёт первую похожую, отчего
 * объявление оказывается не там, где его будут искать. Раздел сужает
 * выбор до десятка понятных вариантов, и попасть в нужный становится
 * делом двух нажатий.
 *
 * Выбрать можно и сам раздел: у «Другого» подкатегорий нет вовсе,
 * а иногда вещь честно относится ко всему разделу сразу.
 */
export function CategoryPicker({
  categories,
  selected,
  onChange,
  max = 3,
}: {
  /** Дерево: разделы с вложенными подкатегориями. */
  categories: Category[];
  /** Выбранные идентификаторы — разделов и подкатегорий вперемешку. */
  selected: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const open = categories.find((category) => category.slug === openSlug) ?? null;

  const byId = new Map<string, Category>();
  for (const root of categories) {
    byId.set(root.id, root);
    for (const child of root.children ?? []) byId.set(child.id, child);
  }

  const toggle = (id: string) => {
    haptic.tap();
    if (selected.includes(id)) {
      onChange(selected.filter((value) => value !== id));
      return;
    }
    // Лишний выбор молча не пропадает: вместо этого сдвигаем список,
    // чтобы последнее нажатие всегда срабатывало.
    const next = selected.length >= max ? selected.slice(1) : selected;
    onChange([...next, id]);
  };

  return (
    <div className="category-picker">
      {selected.length > 0 && (
        <div className="category-picker__chosen">
          {selected.map((id) => {
            const category = byId.get(id);
            if (!category) return null;
            return (
              <button
                key={id}
                type="button"
                className="chip chip--active"
                onClick={() => toggle(id)}
              >
                {category.name} ✕
              </button>
            );
          })}
        </div>
      )}

      <ChipsRow>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`chip${openSlug === category.slug ? ' chip--active' : ''}`}
            onClick={() => {
              haptic.tap();
              setOpenSlug(openSlug === category.slug ? null : category.slug);
            }}
          >
            {category.icon} {category.name}
          </button>
        ))}
      </ChipsRow>

      {open && (
        <ChipsRow>
          <button
            type="button"
            className={`chip chip--sub${selected.includes(open.id) ? ' chip--active' : ''}`}
            onClick={() => toggle(open.id)}
          >
            Весь раздел
          </button>
          {(open.children ?? []).map((child) => (
            <button
              key={child.id}
              type="button"
              className={`chip chip--sub${selected.includes(child.id) ? ' chip--active' : ''}`}
              onClick={() => toggle(child.id)}
            >
              {child.name}
            </button>
          ))}
        </ChipsRow>
      )}
    </div>
  );
}
