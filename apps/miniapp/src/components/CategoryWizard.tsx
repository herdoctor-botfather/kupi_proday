import type { Category, CategoryAttribute } from '@app/shared';
import { haptic } from '../lib/telegram';
import { optionsOf } from '../lib/attribute-options';
import { CarBody, bodyKind } from './CarBody';

/**
 * Пошаговое заполнение при размещении: раздел, полка, марка, модель.
 *
 * Раньше здесь был ряд чипов со всеми категориями сразу. Пока их было
 * двенадцать, это работало; с двумя сотнями продавец перестал попадать
 * в нужную и брал первую похожую — а объявление оказывалось не там,
 * где его ищут.
 *
 * Шаг занимает экран целиком и показывает ровно один вопрос. Пройденное
 * сворачивается в строку пути, где любой шаг можно отменить и выбрать
 * заново. Вопросов получается больше, но каждый из них — короткий
 * и понятный, а в конце объявление лежит там, где надо, и с теми
 * характеристиками, по которым его найдут.
 */
export function CategoryWizard({
  categories,
  attributes,
  categoryId,
  values,
  onPickCategory,
  onChangeValues,
}: {
  /** Дерево разделов с подкатегориями. */
  categories: Category[];
  /** Характеристики выбранной категории — приходят после её выбора. */
  attributes: CategoryAttribute[];
  categoryId: string | null;
  values: Record<string, string | number | boolean | null>;
  onPickCategory: (id: string | null) => void;
  onChangeValues: (values: Record<string, string | number | boolean | null>) => void;
}) {
  const { section, current } = find(categories, categoryId);

  /** Шаги-характеристики: марка, модель, память — в порядке важности. */
  const steps = attributes.filter((attribute) => attribute.isStep);
  // Шаг, у которого нет вариантов, пропускаем: спрашивать не о чем.
  const nextStep = steps.find(
    (attribute) => !values[attribute.slug] && optionsOf(attribute, values).length > 0,
  );

  const stepOptions = nextStep ? optionsOf(nextStep, values) : [];
  const stepHasBodies = stepOptions.some((option) => option.image);

  const pickValue = (attribute: CategoryAttribute, option: string) => {
    haptic.tap();
    const next = { ...values, [attribute.slug]: option };
    for (const item of attributes) {
      if (item.dependsOn === attribute.slug) delete next[item.slug];
    }
    onChangeValues(next);
  };

  const dropValue = (attribute: CategoryAttribute) => {
    haptic.tap();
    const next = { ...values };
    delete next[attribute.slug];
    for (const item of attributes) {
      if (item.dependsOn === attribute.slug) delete next[item.slug];
    }
    onChangeValues(next);
  };

  const resetCategory = () => {
    haptic.tap();
    onPickCategory(null);
    // Характеристики принадлежат категории: сменилась она — ушли и они.
    onChangeValues({});
  };

  const path: { label: string; onDrop: () => void }[] = [];
  if (section && current && section.slug !== current.slug) {
    path.push({ label: section.name, onDrop: () => onPickCategory(section.id) });
  }
  if (current) path.push({ label: current.name, onDrop: resetCategory });
  for (const attribute of steps) {
    const value = values[attribute.slug];
    if (typeof value === 'string' && value) {
      path.push({ label: value, onDrop: () => dropValue(attribute) });
    }
  }

  return (
    <div className="wizard">
      {path.length > 0 && (
        <div className="crumbs">
          {path.map((item, index) => (
            <span key={`${item.label}-${index}`} className="crumbs__sep-group">
              {index > 0 && <span className="crumbs__sep">›</span>}
              <button type="button" className="crumbs__item" onClick={item.onDrop}>
                {item.label} ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Шаг первый: раздел. */}
      {!current && (
        <>
          <p className="field__hint">Выберите раздел</p>
          <div className="steps">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="step"
                onClick={() => {
                  haptic.tap();
                  onPickCategory(category.id);
                }}
              >
                <span className="step__name">
                  {category.icon} {category.name}
                </span>
                <span className="step__chevron" aria-hidden>
                  ›
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Шаг второй: полка внутри раздела. «Весь раздел» — для тех вещей,
          что честно не ложатся ни на одну полку. */}
      {current && (current.children?.length ?? 0) > 0 && (
        <>
          <p className="field__hint">Что именно</p>
          <div className="steps">
            {(current.children ?? []).map((child) => (
              <button
                key={child.id}
                type="button"
                className="step"
                onClick={() => {
                  haptic.tap();
                  onPickCategory(child.id);
                }}
              >
                <span className="step__name">{child.name}</span>
                <span className="step__chevron" aria-hidden>
                  ›
                </span>
              </button>
            ))}
            <button
              type="button"
              className="step"
              onClick={() => {
                haptic.tap();
                onPickCategory(current.id);
                onChangeValues({});
              }}
            >
              <span className="step__name" style={{ opacity: 0.7 }}>
                Оставить «{current.name}»
              </span>
              <span className="step__chevron" aria-hidden>
                ›
              </span>
            </button>
          </div>
        </>
      )}

      {/* Шаги третий и далее: марка, модель, память. */}
      {current && (current.children?.length ?? 0) === 0 && nextStep && (
        <>
          <p className="field__hint">
            {nextStep.name}
            {nextStep.required ? '' : ' — можно пропустить'}
          </p>
          {stepHasBodies ? (
            <div className="body-grid">
              {stepOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="body-card"
                  onClick={() => pickValue(nextStep, option.value)}
                >
                  <span className="body-card__figure">
                    <CarBody kind={bodyKind(option.image)} />
                  </span>
                  <span className="body-card__label">{option.value}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="steps">
              {stepOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="step"
                  onClick={() => pickValue(nextStep, option.value)}
                >
                  <span className="step__name">{option.value}</span>
                  <span className="step__chevron" aria-hidden>
                    ›
                  </span>
                </button>
              ))}
            </div>
          )}
          {!nextStep.required && (
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => pickValue(nextStep, '—')}
            >
              Пропустить
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Ищет категорию в дереве вместе с её разделом. */
function find(
  tree: Category[],
  id: string | null,
): { section: Category | null; current: Category | null } {
  if (!id) return { section: null, current: null };
  for (const root of tree) {
    if (root.id === id) return { section: root, current: root };
    const child = (root.children ?? []).find((item) => item.id === id);
    if (child) return { section: root, current: child };
  }
  return { section: null, current: null };
}
