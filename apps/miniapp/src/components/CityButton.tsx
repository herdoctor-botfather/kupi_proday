import { useState } from 'react';
import { CitySheet } from './CitySheet';
import { haptic } from '../lib/telegram';

/**
 * Выбор города одной кнопкой.
 *
 * Раньше города шли рядом чипов: «Все города», Москва, Нижний Новгород,
 * Санкт-Петербург — и дальше за край экрана. В такую строку помещается
 * три названия, остальные нужно листать вбок, а какой город выбран
 * сейчас, видно только если он не уехал за границу экрана.
 *
 * Кнопка решает оба: она всегда на виду, показывает выбранный город
 * прямо на себе и открывает полный список с поиском — там и живые
 * города с числом объявлений, и все крупные города страны.
 */
export function CityButton({
  value,
  counts,
  onChange,
}: {
  value?: string;
  /** Города, где что-то выложено, — показываются в списке первыми. */
  counts?: { name: string; count: number }[];
  onChange: (city: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`city-pick${value ? ' city-pick--active' : ''}`}
        onClick={() => {
          haptic.tap();
          setOpen(true);
        }}
      >
        <span className="city-pick__pin" aria-hidden>
          📍
        </span>
        <span className="city-pick__body">
          <span className="city-pick__label">Город</span>
          <span className="city-pick__value">{value ?? 'Выбрать город'}</span>
        </span>
        {/* Крестик снимает город, не открывая список: снять фильтр —
            самое частое действие после того, как его поставили. */}
        {value ? (
          <span
            className="city-pick__clear"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              haptic.tap();
              onChange(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.stopPropagation();
              onChange(null);
            }}
          >
            ✕
          </span>
        ) : (
          <span className="city-pick__chevron" aria-hidden>
            ›
          </span>
        )}
      </button>

      {open && (
        <CitySheet
          current={value}
          withCounts={counts ?? []}
          onPick={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
