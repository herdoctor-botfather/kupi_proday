import { useEffect, useState } from 'react';
import { haptic } from '../lib/telegram';

/**
 * Подсказка «ниже ещё есть».
 *
 * Экран приложения короткий, а дверей, обещаний и лент много: нижняя
 * часть уходит за край, и человек, не привыкший листать внутри
 * Telegram, считает увиденное всем содержимым. Стрелка в углу говорит,
 * что список продолжается, и по нажатию пролистывает на экран вперёд.
 *
 * Пропадает, как только до низа остаётся меньше экрана: подсказка нужна
 * ровно до тех пор, пока о продолжении можно не догадаться.
 */
export function ScrollHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.page');
    if (!page) return;

    const check = () => {
      const left = page.scrollHeight - page.scrollTop - page.clientHeight;
      setVisible(left > 120);
    };

    check();
    page.addEventListener('scroll', check, { passive: true });

    // Содержимое приезжает частями — ленты, категории, картинки, — и
    // высота страницы меняется уже после первой проверки.
    const observer = new ResizeObserver(check);
    observer.observe(page);

    return () => {
      page.removeEventListener('scroll', check);
      observer.disconnect();
    };
  });

  if (!visible) return null;

  return (
    <button
      type="button"
      className="scroll-hint"
      aria-label="Показать, что ниже"
      onClick={() => {
        haptic.tap();
        const page = document.querySelector<HTMLElement>('.page');
        page?.scrollBy({ top: page.clientHeight * 0.8, behavior: 'smooth' });
      }}
    >
      ↓
    </button>
  );
}
