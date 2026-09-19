import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Category, CategoryAttribute } from '@app/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { usePagedFeed } from '../lib/usePagedFeed';
import { ListingCard } from '../components/ListingCard';
import { SpecialistCard } from '../components/SpecialistCard';
import { FeedMore } from '../components/Feed';
import { EmptyState } from '../components/states';
import { haptic } from '../lib/telegram';
import { pluralize } from '../lib/format';

/** Сколько карточек показываем под выбором. */
const FEED_PAGE_SIZE = 6;

/**
 * Выбор шагами: раздел → полка → марка → модель.
 *
 * Раньше категории жили рядами чипов с горизонтальной прокруткой.
 * Пока их было двенадцать, это работало; с двумя сотнями — перестало:
 * в узкую строку помещается три названия, остальные существуют только
 * для того, кто догадается её листать. А ещё ряды не складываются в
 * путь — человек не видит, где он находится и что будет дальше.
 *
 * Здесь каждый выбор занимает экран целиком и ведёт к следующему.
 * Шагов может быть много, и это нормально: «айфон 15 на 256 ГБ» —
 * четыре понятных нажатия вместо одного поля поиска, в котором нужно
 * угадать формулировку.
 *
 * Марка и модель — характеристики, а не категории: заводить сорок тысяч
 * категорий ради моделей телефонов значит завести дерево, которое
 * невозможно поддерживать. Для человека разницы нет — шаг выглядит
 * одинаково.
 *
 * Лента снизу остаётся на каждом шаге: выбор уточняет её, а не
 * откладывает. Видно сразу, что найдётся, и можно остановиться в любой
 * момент, не доходя до последнего шага.
 */
export function CategoryStepPage({ mode }: { mode: 'sell' | 'buy' | 'service' }) {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isService = mode === 'service';
  const categories = useAsync(
    () => api.categories(isService ? 'SERVICE' : 'PRODUCT', isService ? undefined : mode === 'buy' ? 'BUY' : 'SELL'),
    [mode],
  );
  const attributes = useAsync(() => api.categoryAttributes(slug), [slug]);

  /** Выбранные характеристики — в адресе, чтобы «назад» возвращал на шаг назад. */
  const chosen = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) if (key !== 'city') result[key] = value;
    return result;
  }, [searchParams]);

  const attrs = Object.entries(chosen)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');

  const { section, current } = useMemo(() => findCategory(categories.data ?? [], slug), [categories.data, slug]);
  const children = current?.children ?? [];

  // Шаги-характеристики идут после подкатегорий: сначала «что», потом «какое».
  const steps = (attributes.data ?? []).filter((attribute) => attribute.isStep);
  const nextStep = steps.find((attribute) => !chosen[attribute.slug]);

  const listings = usePagedFeed(
    (page) =>
      isService
        ? Promise.resolve({ items: [], total: 0, page, pageSize: FEED_PAGE_SIZE, hasMore: false })
        : api.listings({
            kind: mode === 'buy' ? 'BUY' : 'SELL',
            categorySlug: slug,
            attrs: attrs || undefined,
            pageSize: FEED_PAGE_SIZE,
            sort: 'new',
            page,
          }),
    [slug, attrs, mode],
  );

  const specialists = usePagedFeed(
    (page) =>
      isService
        ? api.specialists({ categorySlug: slug, pageSize: FEED_PAGE_SIZE, page })
        : Promise.resolve({ items: [], total: 0, page, pageSize: FEED_PAGE_SIZE, hasMore: false }),
    [slug, mode],
  );

  const feed = isService ? specialists : listings;

  const openCategory = (next: string) => {
    haptic.tap();
    navigate(`${basePath(mode)}/${next}`);
  };

  const pickValue = (attribute: CategoryAttribute, value: string) => {
    haptic.tap();
    const next = new URLSearchParams(searchParams);
    next.set(attribute.slug, value);
    setSearchParams(next);
  };

  const dropValue = (attributeSlug: string) => {
    haptic.tap();
    const next = new URLSearchParams(searchParams);
    next.delete(attributeSlug);
    // Всё, что зависело от снятого шага, теряет смысл вместе с ним.
    for (const attribute of steps) {
      if (attribute.dependsOn === attributeSlug) next.delete(attribute.slug);
    }
    setSearchParams(next);
  };

  const showAll = () => {
    haptic.tap();
    const params = new URLSearchParams({ category: slug });
    if (attrs) params.set('attrs', attrs);
    navigate(`${resultsPath(mode)}?${params.toString()}`);
  };

  if (categories.loading && !categories.data) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 180 }} />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="page">
        <EmptyState icon="🤷" title="Раздел не найден" hint="Возможно, его переименовали" />
      </div>
    );
  }

  return (
    <div className="page">
      {/* Путь: где человек находится и что уже выбрал. Каждый шаг можно снять. */}
      <div className="crumbs">
        <button type="button" className="crumbs__item" onClick={() => navigate(rootPath(mode))}>
          {isService ? 'Услуги' : mode === 'buy' ? 'Запросы' : 'Товары'}
        </button>
        {section && section.slug !== current.slug && (
          <>
            <span className="crumbs__sep">›</span>
            <button type="button" className="crumbs__item" onClick={() => openCategory(section.slug)}>
              {section.name}
            </button>
          </>
        )}
        <span className="crumbs__sep">›</span>
        <span className="crumbs__item crumbs__item--current">{current.name}</span>
        {steps
          .filter((attribute) => chosen[attribute.slug])
          .map((attribute) => (
            <span key={attribute.slug} className="crumbs__sep-group">
              <span className="crumbs__sep">›</span>
              <button type="button" className="crumbs__item" onClick={() => dropValue(attribute.slug)}>
                {chosen[attribute.slug]} ✕
              </button>
            </span>
          ))}
      </div>

      <h1 className="page__title">
        {children.length > 0 ? current.name : (nextStep?.name ?? current.name)}
      </h1>

      {/* Шаг первый: подкатегории раздела. */}
      {children.length > 0 && (
        <div className="steps">
          {children.map((child) => (
            <button key={child.id} type="button" className="step" onClick={() => openCategory(child.slug)}>
              <span className="step__name">{child.name}</span>
              <span className="step__side">
                {child.itemCount > 0 && <span className="step__count">{child.itemCount}</span>}
                <span className="step__chevron" aria-hidden>
                  ›
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Шаг второй и далее: марка, модель, память — в порядке важности. */}
      {children.length === 0 && nextStep && (
        <div className="steps">
          {optionsFor(nextStep, chosen).map((option) => (
            <button key={option} type="button" className="step" onClick={() => pickValue(nextStep, option)}>
              <span className="step__name">{option}</span>
              <span className="step__chevron" aria-hidden>
                ›
              </span>
            </button>
          ))}
          {optionsFor(nextStep, chosen).length === 0 && (
            <p className="form-hint">Для этой марки список пока не заведён — смотрите всё, что есть.</p>
          )}
        </div>
      )}

      {/* Выход в выдачу доступен на любом шаге: дошагивать до конца никто
          не обязан, а «показать всё» — самый частый ответ на «уже хватит». */}
      <button type="button" className="button button--secondary" onClick={showAll}>
        {feed.total > 0
          ? `Показать ${feed.total} ${
              isService
                ? pluralize(feed.total, ['мастера', 'мастеров', 'мастеров'])
                : pluralize(feed.total, ['объявление', 'объявления', 'объявлений'])
            }`
          : 'Смотреть всё в разделе'}
      </button>

      {/* Лента под выбором — она и показывает, ради чего эти шаги. */}
      <h2 className="section-title">{isService ? 'Мастера' : 'Объявления'}</h2>

      {feed.items.length > 0 ? (
        <>
          {isService ? (
            <div className="card-list">
              {specialists.items.map((specialist) => (
                <SpecialistCard key={specialist.id} specialist={specialist} />
              ))}
            </div>
          ) : (
            <div className="listing-grid">
              {listings.items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
          <FeedMore feed={feed} />
        </>
      ) : (
        !feed.loading && (
          <EmptyState
            icon={isService ? '🛠' : '📦'}
            title="Здесь пока пусто"
            hint={
              isService
                ? 'Мастера этой категории ещё не пришли — загляните позже'
                : 'Никто ещё не выложил такое. Может быть, вы первый?'
            }
          />
        )
      )}
    </div>
  );
}

/** Куда ведут ссылки шагов и выдачи — у каждой двери свой адрес. */
function basePath(mode: 'sell' | 'buy' | 'service'): string {
  if (mode === 'service') return '/services/c';
  if (mode === 'buy') return '/wanted/c';
  return '/market/c';
}

function rootPath(mode: 'sell' | 'buy' | 'service'): string {
  if (mode === 'service') return '/';
  if (mode === 'buy') return '/wanted';
  return '/market/browse';
}

function resultsPath(mode: 'sell' | 'buy' | 'service'): string {
  if (mode === 'service') return '/specialists';
  if (mode === 'buy') return '/wanted/all';
  return '/market/listings';
}

/** Ищет категорию в дереве и её раздел — для пути наверху. */
function findCategory(
  tree: Category[],
  slug: string,
): { section: Category | null; current: Category | null } {
  for (const root of tree) {
    if (root.slug === slug) return { section: root, current: root };
    const child = (root.children ?? []).find((item) => item.slug === slug);
    if (child) return { section: root, current: child };
  }
  return { section: null, current: null };
}

/**
 * Варианты шага с учётом зависимости.
 *
 * Список моделей хранится с приставкой марки — «Apple::iPhone 15», —
 * поэтому показываем только те, что относятся к уже выбранному.
 */
function optionsFor(attribute: CategoryAttribute, chosen: Record<string, string>): string[] {
  if (!attribute.dependsOn) return attribute.options;
  const parent = chosen[attribute.dependsOn];
  if (!parent) return [];
  return attribute.options
    .filter((option) => option.startsWith(`${parent}::`))
    .map((option) => option.slice(parent.length + 2));
}
