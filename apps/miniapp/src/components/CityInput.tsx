import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';
import { RUSSIAN_CITIES } from '../lib/russian-cities';
import { CitySheet } from './CitySheet';

/** Сколько подсказок показывать: меньше шести выглядело как «городов нет». */
const SUGGESTIONS = 6;

/**
 * Поле города с подсказкой из уже введённых значений.
 *
 * Свободный текст быстро расслаивает каталог: «Москва», «москва» и «Мск»
 * становятся разными фильтрами, и половина карточек выпадает из выдачи.
 * Подсказка сводит написания к одному без ручного ведения справочника —
 * человек видит существующий вариант и выбирает его.
 */
export function CityInput({
  value,
  onChange,
  invalid = false,
  placeholder = 'Москва',
}: {
  value: string;
  onChange: (city: string) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  /** Полный выбор — список всех городов и карта — в отдельном окне. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const debounced = useDebounced(value, 250);
  const cities = useAsync(() => api.cities(debounced.trim() || undefined), [debounced]);

  /*
   * Сначала города, где уже есть объявления, — со счётчиком. Потом
   * крупнейшие города страны, подходящие под набранное.
   *
   * У молодой площадки объявления есть в двух-трёх городах, и список
   * из них одних отвечал «больше нигде», хотя вопрос был «где я».
   * Точное совпадение не подсказываем — человек уже написал это слово.
   */
  const typed = value.trim().toLowerCase();
  const live = (cities.data ?? []).filter((city) => city.name.toLowerCase() !== typed);
  const known = new Set(live.map((city) => city.name.toLowerCase()));
  const popular = RUSSIAN_CITIES.filter((name) => {
    const lower = name.toLowerCase();
    return !known.has(lower) && lower !== typed && (!typed || lower.includes(typed));
  })
    // Совпадение с начала слова важнее совпадения в середине: «нов» — это
    // Новосибирск и Новгород раньше, чем Великий Новгород.
    .sort((a, b) => Number(!a.toLowerCase().startsWith(typed)) - Number(!b.toLowerCase().startsWith(typed)))
    .map((name) => ({ name, count: 0 }));
  const suggestions = [...live, ...popular].slice(0, Math.max(SUGGESTIONS, live.length));

  return (
    <div className="city-input">
      <input
        className={`form-input${invalid ? ' form-input--invalid' : ''}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        // Клик по подсказке снимает фокус раньше, чем срабатывает обработчик,
        // поэтому закрываем список с задержкой.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {focused && (
        <div className="city-input__list">
          {suggestions.slice(0, SUGGESTIONS).map((city) => (
            <button
              key={city.name}
              type="button"
              className="city-input__option"
              onClick={() => {
                onChange(city.name);
                setFocused(false);
              }}
            >
              <span>{city.name}</span>
              {city.count > 0 && <span className="city-input__count">{city.count}</span>}
            </button>
          ))}
          {/* Шесть подсказок — не весь выбор: своего города в них может не
              оказаться. Отсюда — полный список и выбор на карте. */}
          <button
            type="button"
            className="city-input__option city-input__option--all"
            onClick={() => {
              setFocused(false);
              setSheetOpen(true);
            }}
          >
            <span>Все города</span>
            <span aria-hidden>›</span>
          </button>
        </div>
      )}

      {sheetOpen && (
        <CitySheet
          current={value || undefined}
          withCounts={cities.data ?? []}
          // «Вся Россия» полю формы не подходит: объявлению нужен конкретный город.
          onPick={(city) => city && onChange(city)}
          onClose={() => setSheetOpen(false)}
          allowAll={false}
        />
      )}
    </div>
  );
}
