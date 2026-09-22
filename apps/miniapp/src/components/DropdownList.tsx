import { useState } from 'react';
import { haptic } from '../lib/telegram';

export interface DropdownItem {
  key: string;
  label: string;
  /** Сколько внутри — показываем справа, если больше нуля. */
  count?: number;
}

/**
 * Раскрывающийся список вместо строки чипов.
 *
 * В строку с прокруткой вбок помещается два-три варианта, остальные
 * существуют только для того, кто догадается её листать. Развёрнутый
 * столбец, наоборот, отодвигает содержимое экрана на два экрана вниз.
 * Свёрнутая строка показывает текущий выбор, раскрывается по нажатию
 * и сворачивается сама, когда выбор сделан.
 */
export function DropdownList({
  label,
  items,
  selectedKey,
  onPick,
  allLabel,
  noun = 'вариантов',
}: {
  /** Подпись строки, когда ничего не выбрано: «🗂 Раздел: все». */
  label: string;
  items: DropdownItem[];
  selectedKey?: string | null;
  /** null — сброс выбора пунктом «все». */
  onPick: (key: string | null) => void;
  /** Если задан — первым пунктом идёт сброс выбора с этой подписью. */
  allLabel?: string;
  /** Как назвать варианты в подсказке справа: «11 разделов». */
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = items.find((item) => item.key === selectedKey);

  const pick = (key: string | null) => {
    haptic.tap();
    onPick(key);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`industry-toggle${open ? ' industry-toggle--open' : ''}`}
        aria-expanded={open}
        onClick={() => {
          haptic.tap();
          setOpen((value) => !value);
        }}
      >
        <span>{chosen ? chosen.label : label}</span>
        <span className="industry-toggle__side">
          {open ? 'Свернуть' : chosen ? 'Изменить' : `${items.length} ${noun}`}
          <span className="industry-toggle__arrow" aria-hidden>
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="steps">
          {allLabel && (
            <button
              type="button"
              className={`step${!chosen ? ' step--active' : ''}`}
              onClick={() => pick(null)}
            >
              <span className="step__name">{allLabel}</span>
              <span className="step__side">
                <span className="step__chevron" aria-hidden>
                  {!chosen ? '✓' : '›'}
                </span>
              </span>
            </button>
          )}
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`step${item.key === selectedKey ? ' step--active' : ''}`}
              onClick={() => pick(item.key)}
            >
              <span className="step__name">{item.label}</span>
              <span className="step__side">
                {(item.count ?? 0) > 0 && <span className="step__count">{item.count}</span>}
                <span className="step__chevron" aria-hidden>
                  {item.key === selectedKey ? '✓' : '›'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
