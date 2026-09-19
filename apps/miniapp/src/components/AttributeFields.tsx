import type { CategoryAttribute } from '@app/shared';
import { haptic } from '../lib/telegram';

/**
 * Поля характеристик в форме размещения.
 *
 * Набор зависит от категории: у телефона спрашиваем память и цвет,
 * у машины — пробег и коробку, у дивана — материал. Одна форма на всё
 * невозможна: либо она спрашивает лишнее у каждого, либо не спрашивает
 * ничего и оставляет покупателя гадать по описанию.
 *
 * Поля рисуются по описанию из базы, а не по коду: новая характеристика
 * появляется строкой в таблице, без выкладки приложения.
 */
export function AttributeFields({
  attributes,
  values,
  onChange,
}: {
  attributes: CategoryAttribute[];
  values: Record<string, string | number | boolean | null>;
  onChange: (values: Record<string, string | number | boolean | null>) => void;
}) {
  if (attributes.length === 0) return null;

  const set = (slug: string, value: string | number | boolean | null) => {
    const next = { ...values, [slug]: value };
    // Модель без марки не значит ничего: сменили марку — старая модель уходит.
    for (const attribute of attributes) {
      if (attribute.dependsOn === slug) delete next[attribute.slug];
    }
    onChange(next);
  };

  return (
    <>
      <h2 className="form-section">Характеристики</h2>
      <p className="field__hint" style={{ marginTop: -8, marginBottom: 10 }}>
        Чем подробнее, тем выше объявление в поиске — по ним и ищут
      </p>

      {attributes.map((attribute) => {
        const value = values[attribute.slug];

        if (attribute.kind === 'BOOLEAN') {
          return (
            <label key={attribute.id} className="checkbox-inline" style={{ marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={value === true}
                onChange={(event) => set(attribute.slug, event.target.checked)}
              />
              {attribute.name}
            </label>
          );
        }

        if (attribute.kind === 'NUMBER') {
          return (
            <div className="field" key={attribute.id}>
              <label className="field__label">
                {attribute.name}
                {attribute.unit ? `, ${attribute.unit}` : ''}
                {attribute.required && <span className="field__required"> *</span>}
              </label>
              <input
                className="form-input"
                inputMode="numeric"
                value={value === null || value === undefined ? '' : String(value)}
                onChange={(event) => set(attribute.slug, event.target.value)}
              />
            </div>
          );
        }

        if (attribute.kind === 'TEXT') {
          return (
            <div className="field" key={attribute.id}>
              <label className="field__label">
                {attribute.name}
                {attribute.required && <span className="field__required"> *</span>}
              </label>
              <input
                className="form-input"
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => set(attribute.slug, event.target.value)}
              />
            </div>
          );
        }

        const options = optionsFor(attribute, values);

        return (
          <div className="field" key={attribute.id}>
            <label className="field__label">
              {attribute.name}
              {attribute.required && <span className="field__required"> *</span>}
            </label>

            {attribute.dependsOn && options.length === 0 ? (
              <p className="field__hint">Сначала выберите «{nameOf(attributes, attribute.dependsOn)}»</p>
            ) : (
              <div className="attr-options">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`chip${value === option ? ' chip--active' : ''}`}
                    onClick={() => {
                      haptic.tap();
                      set(attribute.slug, value === option ? null : option);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Название характеристики по слагу — для подсказки «сначала выберите марку». */
function nameOf(attributes: CategoryAttribute[], slug: string): string {
  return attributes.find((attribute) => attribute.slug === slug)?.name ?? slug;
}

/**
 * Варианты с учётом зависимости: модели показываются только для
 * выбранной марки. Приставка «Apple::» нужна хранилищу, а человеку —
 * нет, поэтому здесь она снимается.
 */
function optionsFor(
  attribute: CategoryAttribute,
  values: Record<string, string | number | boolean | null>,
): string[] {
  if (!attribute.dependsOn) return attribute.options;
  const parent = values[attribute.dependsOn];
  if (typeof parent !== 'string' || !parent) return [];
  return attribute.options
    .filter((option) => option.startsWith(`${parent}::`))
    .map((option) => option.slice(parent.length + 2));
}
