import type { AttributeSpec } from '../category-attributes';

/**
 * Телефоны: марка, модель, память.
 *
 * Память зависит от модели, а не висит общим списком. «iPhone 17 Pro Max
 * на 32 ГБ» — вещь несуществующая, и предлагать такой выбор значит либо
 * получить неверное объявление, либо выставить площадку не знающей
 * товара, которым торгует.
 *
 * Наборы памяти описаны по моделям и разворачиваются в варианты вида
 * «iPhone 17 Pro Max::256 ГБ»: так одна характеристика описывает все
 * сочетания, не превращаясь в отдельную таблицу.
 */

/** Сколько памяти бывает у конкретной модели. */
const STORAGE_BY_MODEL: Record<string, string[]> = {
  // ─── Apple ───
  'iPhone 17 Pro Max': ['256 ГБ', '512 ГБ', '1 ТБ', '2 ТБ'],
  'iPhone 17 Pro': ['256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 17': ['256 ГБ', '512 ГБ'],
  'iPhone Air': ['256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 16 Pro Max': ['256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 16 Pro': ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 16 Plus': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'iPhone 16': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'iPhone 15 Pro Max': ['256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 15 Pro': ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 15 Plus': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'iPhone 15': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'iPhone 14 Pro Max': ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 14 Pro': ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 14': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'iPhone 13 Pro Max': ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 13 Pro': ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
  'iPhone 13': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'iPhone 13 mini': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'iPhone 12': ['64 ГБ', '128 ГБ', '256 ГБ'],
  'iPhone 11': ['64 ГБ', '128 ГБ', '256 ГБ'],
  'iPhone SE': ['64 ГБ', '128 ГБ', '256 ГБ'],

  // ─── Samsung ───
  'Galaxy S25 Ultra': ['256 ГБ', '512 ГБ', '1 ТБ'],
  'Galaxy S25': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'Galaxy S24 Ultra': ['256 ГБ', '512 ГБ', '1 ТБ'],
  'Galaxy S24': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'Galaxy S23': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'Galaxy S22': ['128 ГБ', '256 ГБ'],
  'Galaxy Z Fold': ['256 ГБ', '512 ГБ', '1 ТБ'],
  'Galaxy Z Flip': ['128 ГБ', '256 ГБ', '512 ГБ'],
  'Galaxy A55': ['128 ГБ', '256 ГБ'],
  'Galaxy A35': ['128 ГБ', '256 ГБ'],
  'Galaxy A15': ['64 ГБ', '128 ГБ', '256 ГБ'],
  'Galaxy M': ['64 ГБ', '128 ГБ'],

  // ─── Xiaomi ───
  'Xiaomi 15': ['256 ГБ', '512 ГБ'],
  'Xiaomi 14': ['256 ГБ', '512 ГБ'],
  'Redmi Note 14': ['128 ГБ', '256 ГБ'],
  'Redmi Note 13': ['128 ГБ', '256 ГБ'],
  'Redmi Note 12': ['64 ГБ', '128 ГБ', '256 ГБ'],
  'Redmi 14C': ['64 ГБ', '128 ГБ', '256 ГБ'],
  'POCO X7': ['256 ГБ', '512 ГБ'],
  'POCO F6': ['256 ГБ', '512 ГБ'],
  'POCO M6': ['128 ГБ', '256 ГБ'],

  // ─── Honor ───
  'Honor 200': ['256 ГБ', '512 ГБ'],
  'Honor 90': ['256 ГБ', '512 ГБ'],
  'Honor X9': ['128 ГБ', '256 ГБ'],
  'Honor X8': ['128 ГБ', '256 ГБ'],
  'Magic 6': ['256 ГБ', '512 ГБ'],

  // ─── Google ───
  'Pixel 9': ['128 ГБ', '256 ГБ'],
  'Pixel 8': ['128 ГБ', '256 ГБ'],
  'Pixel 7': ['128 ГБ', '256 ГБ'],
  'Pixel 6': ['128 ГБ', '256 ГБ'],
};

/** Для модели вне списка предлагаем ходовой ряд — тупика быть не должно. */
const STORAGE_FALLBACK = ['32 ГБ', '64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'];

const BRANDS = [
  'Apple',
  'Samsung',
  'Xiaomi',
  'Honor',
  'Huawei',
  'Realme',
  'Google',
  'OnePlus',
  'Nothing',
  'Motorola',
  'Vivo',
  'OPPO',
  'Tecno',
  'Infinix',
  'ZTE',
  'Nokia',
  'Другая',
];

/** Какие модели у какой марки. Порядок — от новых к старым. */
const MODELS_BY_BRAND: Record<string, string[]> = {
  Apple: [
    'iPhone 17 Pro Max',
    'iPhone 17 Pro',
    'iPhone 17',
    'iPhone Air',
    'iPhone 16 Pro Max',
    'iPhone 16 Pro',
    'iPhone 16 Plus',
    'iPhone 16',
    'iPhone 15 Pro Max',
    'iPhone 15 Pro',
    'iPhone 15 Plus',
    'iPhone 15',
    'iPhone 14 Pro Max',
    'iPhone 14 Pro',
    'iPhone 14',
    'iPhone 13 Pro Max',
    'iPhone 13 Pro',
    'iPhone 13',
    'iPhone 13 mini',
    'iPhone 12',
    'iPhone 11',
    'iPhone SE',
  ],
  Samsung: [
    'Galaxy S25 Ultra',
    'Galaxy S25',
    'Galaxy S24 Ultra',
    'Galaxy S24',
    'Galaxy S23',
    'Galaxy S22',
    'Galaxy Z Fold',
    'Galaxy Z Flip',
    'Galaxy A55',
    'Galaxy A35',
    'Galaxy A15',
    'Galaxy M',
  ],
  Xiaomi: [
    'Xiaomi 15',
    'Xiaomi 14',
    'Redmi Note 14',
    'Redmi Note 13',
    'Redmi Note 12',
    'Redmi 14C',
    'POCO X7',
    'POCO F6',
    'POCO M6',
  ],
  Honor: ['Honor 200', 'Honor 90', 'Honor X9', 'Honor X8', 'Magic 6'],
  Google: ['Pixel 9', 'Pixel 8', 'Pixel 7', 'Pixel 6'],
};

const models = Object.entries(MODELS_BY_BRAND).flatMap(([brand, list]) =>
  [...list, 'Другая модель'].map((model) => `${brand}::${model}`),
);

/*
 * Память перечисляем для каждой модели, включая «Другую»: без неё
 * продавец редкого аппарата упирается в пустой шаг.
 */
const storage = [
  ...Object.entries(STORAGE_BY_MODEL).flatMap(([model, sizes]) =>
    sizes.map((size) => `${model}::${size}`),
  ),
  ...STORAGE_FALLBACK.map((size) => `Другая модель::${size}`),
];

export const PHONE_ATTRIBUTES: AttributeSpec[] = [
  { slug: 'brand', name: 'Марка', options: BRANDS, required: true, isStep: true },
  { slug: 'model', name: 'Модель', options: models, dependsOn: 'brand', required: true, isStep: true },
  { slug: 'storage', name: 'Память', options: storage, dependsOn: 'model', isStep: true },
];
