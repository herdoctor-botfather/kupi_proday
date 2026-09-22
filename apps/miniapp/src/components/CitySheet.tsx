import { useMemo, useState } from 'react';
import { RUSSIAN_CITIES } from '../lib/russian-cities';
import { SearchInput } from './SearchInput';
import { haptic } from '../lib/telegram';
import { CityMapPicker } from './CityMapPicker';

/**
 * Выбор города из полного списка.
 *
 * Ряд чипов показывает только те города, где уже что-то выложено, —
 * и человеку из Омска кажется, что площадка про Москву и Казань.
 * Здесь он находит свой город, даже если объявлений в нём пока нет:
 * пустая выдача по своему городу честнее, чем ощущение, что тебя
 * тут не предполагали.
 *
 * Живые города идут первыми и с числом объявлений: выбрать место,
 * где есть что смотреть, должно быть проще, чем любое другое.
 */
export function CitySheet({
  current,
  withCounts,
  onPick,
  onClose,
  allowAll = true,
}: {
  current?: string;
  /** Города, где уже есть объявления, — показываются наверху с числом. */
  withCounts?: { name: string; count: number }[];
  onPick: (city: string | null) => void;
  onClose: () => void;
  /** Пункт «Вся Россия» — для фильтров; полю формы нужен конкретный город. */
  allowAll?: boolean;
}) {
  const [query, setQuery] = useState('');
  /** Выбор на карте вместо списка — для тех, кто не нашёл свой посёлок по названию. */
  const [onMap, setOnMap] = useState(false);

  const live = withCounts ?? [];
  const liveNames = new Set(live.map((item) => item.name));

  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Города из объявлений могут не совпадать со списком (посёлок, село),
    // поэтому список собираем из обоих источников.
    const all = [...live.map((item) => item.name), ...RUSSIAN_CITIES.filter((name) => !liveNames.has(name))];
    if (!needle) return all;
    return all.filter((name) => name.toLowerCase().includes(needle));
  }, [query, live]);

  const pick = (city: string | null) => {
    haptic.tap();
    onPick(city);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet--tall" onClick={(event) => event.stopPropagation()}>
        <div className="sheet__grip" aria-hidden />
        <h2 className="sheet__title">Выберите город</h2>

        <button
          type="button"
          className="button button--secondary city-sheet__map-toggle"
          onClick={() => {
            haptic.tap();
            setOnMap((value) => !value);
          }}
        >
          {onMap ? '☰ Выбрать из списка' : '🗺 Выбрать на карте'}
        </button>

        {onMap ? (
          <CityMapPicker onPick={(city) => pick(city)} />
        ) : (
          <>
        <SearchInput value={query} onChange={setQuery} placeholder="Начните вводить название" />

        <div className="city-sheet__list">
          {!query && allowAll && (
            <button
              type="button"
              className={`city-sheet__row${!current ? ' city-sheet__row--active' : ''}`}
              onClick={() => pick(null)}
            >
              Вся Россия
            </button>
          )}

          {found.map((name) => {
            const count = live.find((item) => item.name === name)?.count;
            return (
              <button
                key={name}
                type="button"
                className={`city-sheet__row${current === name ? ' city-sheet__row--active' : ''}`}
                onClick={() => pick(name)}
              >
                <span>{name}</span>
                {count !== undefined && <span className="city-sheet__count">{count}</span>}
              </button>
            );
          })}

          {found.length === 0 && (
            <p className="form-hint">Такого города в списке нет — попробуйте выбрать его на карте</p>
          )}
        </div>
          </>
        )}

        <button type="button" className="sheet__cancel" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
