import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/useAsync';

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
  const debounced = useDebounced(value, 250);
  const cities = useAsync(() => api.cities(debounced.trim() || undefined), [debounced]);

  // Точное совпадение подсказывать незачем — человек уже написал это слово.
  const suggestions = (cities.data ?? []).filter(
    (city) => city.name.toLowerCase() !== value.trim().toLowerCase(),
  );

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

      {focused && suggestions.length > 0 && (
        <div className="city-input__list">
          {suggestions.slice(0, 6).map((city) => (
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
              <span className="city-input__count">{city.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
