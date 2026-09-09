/**
 * Значки нижней навигации.
 *
 * Раньше здесь стояли эмодзи. Они удобны тем, что ничего не нужно рисовать,
 * но у них есть собственный цвет: выделить активную вкладку акцентом
 * невозможно — эмодзи останется прежним. Контурные значки наследуют
 * цвет текста, поэтому вкладка целиком меняет цвет вместе с подписью.
 */

const base = {
  width: 23,
  height: 23,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconCatalog() {
  return (
    <svg {...base}>
      <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="2.2" />
      <rect x="13.2" y="3.2" width="7.6" height="7.6" rx="2.2" />
      <rect x="3.2" y="13.2" width="7.6" height="7.6" rx="2.2" />
      <rect x="13.2" y="13.2" width="7.6" height="7.6" rx="2.2" />
    </svg>
  );
}

export function IconMap() {
  return (
    <svg {...base}>
      <path d="M12 20.8s6.8-5.6 6.8-10.8a6.8 6.8 0 1 0-13.6 0c0 5.2 6.8 10.8 6.8 10.8Z" />
      <circle cx="12" cy="9.8" r="2.5" />
    </svg>
  );
}

export function IconMarket() {
  return (
    <svg {...base}>
      <path d="M4.6 7.8h14.8l-1.15 11a2 2 0 0 1-2 1.8H7.75a2 2 0 0 1-2-1.8L4.6 7.8Z" />
      <path d="M8.9 7.8V6.3a3.1 3.1 0 0 1 6.2 0v1.5" />
    </svg>
  );
}

export function IconChats() {
  return (
    <svg {...base}>
      <path d="M20.4 12.2c0 4-3.75 7.2-8.4 7.2-.98 0-1.93-.14-2.8-.4L4.2 20.6l1.4-3.7a6.9 6.9 0 0 1-2-4.7C3.6 8.2 7.35 5 12 5s8.4 3.2 8.4 7.2Z" />
    </svg>
  );
}

export function IconProfile() {
  return (
    <svg {...base}>
      <circle cx="12" cy="8.1" r="3.5" />
      <path d="M5.3 20c.7-3.4 3.4-5.5 6.7-5.5s6 2.1 6.7 5.5" />
    </svg>
  );
}

/**
 * Кошелёк: сумка с застёжкой и звёздочка внутри.
 * Звезда важнее самой сумки — она сразу говорит, в чём здесь счёт.
 */
export function IconWallet() {
  return (
    <svg {...base}>
      <path d="M3.4 8.6a2.4 2.4 0 0 1 2.4-2.4h12.4a2.4 2.4 0 0 1 2.4 2.4v8.8a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4z" />
      <path d="m12 10.4.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" />
    </svg>
  );
}