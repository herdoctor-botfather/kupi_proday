import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../lib/telegram';

/**
 * Полоса фильтров с прокруткой.
 *
 * Полоса и раньше прокручивалась пальцем, но об этом нельзя было
 * догадаться: последняя видимая категория обрывалась ровно по краю
 * экрана и выглядела как последняя вообще. Стрелки появляются только
 * с той стороны, где действительно что-то есть, — стрелка в никуда
 * обманывала бы так же, как её отсутствие.
 *
 * На мышином компьютере это ещё и единственный удобный способ листать:
 * горизонтального колеса у обычной мыши нет.
 */
export function ChipsRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Запас в один пиксель: при дробном масштабе крайние значения
    // не сходятся точно, и стрелка мигала бы в самом конце прокрутки.
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();
    el.addEventListener('scroll', measure, { passive: true });

    // Ширина полосы меняется не только при повороте экрана: категории
    // приходят с сервера уже после первого рендера, и без наблюдателя
    // стрелка не появилась бы до первой прокрутки.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, children]);

  const scrollBy = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    haptic.tap();
    // Не на всю ширину: кусочек предыдущей категории остаётся видимым,
    // и по нему понятно, что список продолжается, а не начался заново.
    el.scrollBy({ left: direction * el.clientWidth * 0.75, behavior: 'smooth' });
  };

  return (
    <div className="chips-row">
      <div className="chips" ref={ref}>
        {children}
      </div>

      {canLeft && (
        <button
          type="button"
          className="chips-row__arrow chips-row__arrow--left"
          aria-label="Предыдущие категории"
          onClick={() => scrollBy(-1)}
        >
          <Chevron />
        </button>
      )}

      {canRight && (
        <button
          type="button"
          className="chips-row__arrow chips-row__arrow--right"
          aria-label="Следующие категории"
          onClick={() => scrollBy(1)}
        >
          <Chevron />
        </button>
      )}
    </div>
  );
}

/** Одна стрелка на обе стороны: левая — та же, развёрнутая через CSS. */
function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
