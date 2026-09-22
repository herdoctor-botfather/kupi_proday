import { useState } from 'react';
import type { Category } from '@app/shared';
import { DropdownList } from './DropdownList';
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

      {/* Раздел — раскрывающимся списком, а не строкой чипов: в строку
          помещалось три раздела, остальные прятались за прокруткой. */}
      <DropdownList
        label="🗂 Выберите раздел"
        noun="разделов"
        selectedKey={openSlug}
        items={categories.map((category) => ({ key: category.slug, label: `${category.icon} ${category.name}` }))}
        onPick={setOpenSlug}
      />

      {/* Подразделы — столбцом с галочками: выбрать можно несколько. */}
      {open && (
        <div className="steps">
          {[{ id: open.id, name: 'Весь раздел' }, ...(open.children ?? [])].map((item) => {
            const on = selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`step${on ? ' step--active' : ''}`}
                onClick={() => toggle(item.id)}
              >
                <span className="step__name">{item.name}</span>
                <span className="step__side">
                  <span className="step__chevron" aria-hidden>
                    {on ? '✓' : '+'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
