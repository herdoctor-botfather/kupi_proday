import type { AttributeSpec } from '../category-attributes';

/**
 * Компьютерное железо и периферия.
 *
 * Раздел «Комплектующие и периферия» был пустым шагом: человек
 * проваливался в него и упирался в «смотреть всё». Теперь он ведёт
 * дальше — к типу устройства, а затем к марке, причём марки у каждого
 * типа свои: видеокарты не бывают Logitech, а коврики — Nvidia.
 */

/** Марки по типу устройства: у каждой полки свой круг производителей. */
const BRANDS_BY_TYPE: Record<string, string[]> = {
  Монитор: ['Samsung', 'LG', 'Dell', 'Asus', 'Acer', 'BenQ', 'AOC', 'MSI', 'Philips', 'Xiaomi', 'HP', 'Iiyama', 'Другая'],
  Клавиатура: ['Logitech', 'Razer', 'HyperX', 'SteelSeries', 'Keychron', 'A4Tech', 'Defender', 'Red Square', 'Corsair', 'Xiaomi', 'Другая'],
  Мышь: ['Logitech', 'Razer', 'SteelSeries', 'HyperX', 'A4Tech', 'Bloody', 'Defender', 'Corsair', 'Xiaomi', 'Другая'],
  'Наушники и гарнитуры': ['HyperX', 'Razer', 'Logitech', 'SteelSeries', 'Sony', 'JBL', 'A4Tech', 'Другая'],
  Видеокарта: ['NVIDIA', 'AMD', 'Asus', 'MSI', 'Gigabyte', 'Palit', 'Zotac', 'Sapphire', 'PowerColor', 'Inno3D', 'Другая'],
  Процессор: ['Intel', 'AMD'],
  'Оперативная память': ['Kingston', 'Corsair', 'G.Skill', 'Crucial', 'Patriot', 'ADATA', 'Другая'],
  'Накопитель SSD или HDD': ['Samsung', 'Kingston', 'Western Digital', 'Seagate', 'Crucial', 'ADATA', 'Netac', 'Другая'],
  'Материнская плата': ['Asus', 'MSI', 'Gigabyte', 'ASRock', 'Biostar', 'Другая'],
  'Блок питания': ['be quiet!', 'Corsair', 'Chieftec', 'DeepCool', 'Thermaltake', 'Cooler Master', 'Другая'],
  Корпус: ['DeepCool', 'Zalman', 'Cooler Master', 'NZXT', 'Thermaltake', 'Ardor Gaming', 'Другая'],
  Охлаждение: ['DeepCool', 'be quiet!', 'Noctua', 'Cooler Master', 'Arctic', 'Другая'],
  'Принтер или МФУ': ['HP', 'Canon', 'Epson', 'Brother', 'Pantum', 'Kyocera', 'Xerox', 'Другая'],
  'Веб-камера': ['Logitech', 'A4Tech', 'Defender', 'Razer', 'Другая'],
  Колонки: ['Edifier', 'Logitech', 'SVEN', 'JBL', 'Creative', 'Другая'],
  'Сетевое оборудование': ['TP-Link', 'Keenetic', 'Asus', 'D-Link', 'Mercusys', 'Xiaomi', 'Другая'],
  'Коврик и аксессуары': ['Razer', 'SteelSeries', 'Logitech', 'Ardor Gaming', 'Другая'],
  Другое: ['Другая'],
};

const TYPES = Object.keys(BRANDS_BY_TYPE);

const brands = Object.entries(BRANDS_BY_TYPE).flatMap(([type, list]) =>
  list.map((brand) => `${type}::${brand}`),
);

/** Диагонали мониторов — те, что действительно продаются. */
const MONITOR_SIZES = ['21.5″', '23.8″', '24″', '27″', '31.5″', '34″', '49″'];

export const PERIPHERAL_ATTRIBUTES: AttributeSpec[] = [
  { slug: 'type', name: 'Что именно', options: TYPES, required: true, isStep: true },
  { slug: 'brand', name: 'Марка', options: brands, dependsOn: 'type', isStep: true },
  {
    slug: 'diagonal',
    name: 'Диагональ монитора',
    options: MONITOR_SIZES.map((size) => `Монитор::${size}`),
    dependsOn: 'type',
  },
];

/**
 * Линейки ноутбуков по маркам.
 *
 * «Asus» покупателю не говорит ничего: под этим именем выпускают и
 * игровой ROG за две зарплаты, и офисный VivoBook. Линейка — то, чем
 * человек называет свой ноутбук вслух.
 */
const LAPTOP_LINES: Record<string, string[]> = {
  Apple: ['MacBook Air', 'MacBook Pro', 'iMac', 'Mac mini', 'Mac Studio'],
  Asus: ['VivoBook', 'ZenBook', 'ROG Strix', 'TUF Gaming', 'ProArt', 'ExpertBook', 'Chromebook'],
  Acer: ['Aspire', 'Nitro', 'Predator', 'Swift', 'Extensa', 'TravelMate'],
  Lenovo: ['IdeaPad', 'ThinkPad', 'Legion', 'Yoga', 'LOQ', 'ThinkBook', 'V-серия'],
  HP: ['Pavilion', 'ProBook', 'EliteBook', 'Victus', 'Omen', 'Envy', 'Laptop 15'],
  Dell: ['Inspiron', 'XPS', 'Latitude', 'Vostro', 'Precision', 'Alienware', 'G-серия'],
  MSI: ['Modern', 'Katana', 'Thin', 'Cyborg', 'Prestige', 'Stealth', 'Raider'],
  Huawei: ['MateBook D', 'MateBook X', 'MateBook 14', 'MateBook 16'],
  Samsung: ['Galaxy Book', 'Notebook'],
  Honor: ['MagicBook X', 'MagicBook Pro', 'MagicBook 14'],
  'Своя сборка': ['Игровой', 'Офисный', 'Для работы с графикой'],
  Другая: ['Другая линейка'],
};

/** Ноутбуки и системные блоки: экран списком, а не числом от руки. */
export const COMPUTER_ATTRIBUTES: AttributeSpec[] = [
  {
    slug: 'type',
    name: 'Тип',
    options: ['Ноутбук', 'Системный блок', 'Моноблок', 'Мини-ПК'],
    required: true,
    isStep: true,
  },
  {
    slug: 'brand',
    name: 'Марка',
    options: Object.keys(LAPTOP_LINES),
    isStep: true,
  },
  {
    slug: 'line',
    name: 'Линейка',
    options: Object.entries(LAPTOP_LINES).flatMap(([brand, list]) =>
      [...list, 'Другая линейка'].map((line) => `${brand}::${line}`),
    ),
    dependsOn: 'brand',
    isStep: true,
  },
  { slug: 'ram', name: 'Оперативная память', options: ['4 ГБ', '8 ГБ', '16 ГБ', '32 ГБ', '64 ГБ'] },
  { slug: 'storage', name: 'Накопитель', options: ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ', '2 ТБ'] },
  {
    slug: 'screen',
    name: 'Диагональ экрана',
    options: ['13.3″', '14″', '15.6″', '16″', '17.3″'],
  },
];

/** Бытовая техника: марки зависят от того, что именно продают. */
const APPLIANCE_BRANDS: Record<string, string[]> = {
  Холодильник: ['Bosch', 'LG', 'Samsung', 'Atlant', 'Indesit', 'Haier', 'Beko', 'Liebherr', 'Gorenje', 'Hotpoint', 'Бирюса', 'Другая'],
  'Стиральная машина': ['Bosch', 'LG', 'Samsung', 'Indesit', 'Candy', 'Atlant', 'Haier', 'Electrolux', 'Beko', 'Hotpoint', 'Другая'],
  Посудомойка: ['Bosch', 'Electrolux', 'Hansa', 'Midea', 'Weissgauff', 'Indesit', 'Другая'],
  Плита: ['Gefest', 'Gorenje', 'Hansa', 'Darina', 'Electrolux', 'Bosch', 'Другая'],
  'Духовой шкаф': ['Bosch', 'Electrolux', 'Gorenje', 'Hansa', 'Maunfeld', 'Другая'],
  Микроволновка: ['Samsung', 'LG', 'Midea', 'Panasonic', 'Redmond', 'Другая'],
  Пылесос: ['Dyson', 'Samsung', 'LG', 'Philips', 'Xiaomi', 'Thomas', 'Tefal', 'Karcher', 'Другая'],
  Кондиционер: ['Ballu', 'Electrolux', 'Haier', 'Midea', 'LG', 'Samsung', 'Hisense', 'Royal Clima', 'Другая'],
  Другое: ['Другая'],
};

export const APPLIANCE_ATTRIBUTES: AttributeSpec[] = [
  {
    slug: 'type',
    name: 'Что именно',
    options: Object.keys(APPLIANCE_BRANDS),
    required: true,
    isStep: true,
  },
  {
    slug: 'brand',
    name: 'Марка',
    options: Object.entries(APPLIANCE_BRANDS).flatMap(([type, list]) =>
      list.map((brand) => `${type}::${brand}`),
    ),
    dependsOn: 'type',
    isStep: true,
  },
];

/** Телевизоры: диагональ выбирается шагом из ходового ряда. */
export const TV_ATTRIBUTES: AttributeSpec[] = [
  {
    slug: 'brand',
    name: 'Марка',
    options: ['Samsung', 'LG', 'Sony', 'Xiaomi', 'Haier', 'TCL', 'Hisense', 'Philips', 'Yandex', 'Витязь', 'Другая'],
    isStep: true,
  },
  {
    slug: 'series',
    name: 'Серия',
    options: [
      ...['QLED', 'Neo QLED', 'Crystal UHD', 'The Frame', 'OLED'].map((x) => `Samsung::${x}`),
      ...['OLED', 'QNED', 'NanoCell', 'UHD'].map((x) => `LG::${x}`),
      ...['BRAVIA OLED', 'BRAVIA XR', 'BRAVIA LED'].map((x) => `Sony::${x}`),
      ...['TV A Pro', 'TV S Pro', 'TV Max', 'Mi TV'].map((x) => `Xiaomi::${x}`),
      ...['Smart TV', 'Обычный'].map((x) => `Haier::${x}`),
      ...['Smart TV', 'Обычный'].map((x) => `TCL::${x}`),
      ...['Smart TV', 'Обычный'].map((x) => `Hisense::${x}`),
      ...['Smart TV', 'Обычный'].map((x) => `Philips::${x}`),
      ...['Смарт ТВ с Алисой'].map((x) => `Yandex::${x}`),
      ...['Обычный'].map((x) => `Витязь::${x}`),
      ...['Другая серия'].map((x) => `Другая::${x}`),
    ],
    dependsOn: 'brand',
    isStep: true,
  },
  {
    slug: 'diagonal',
    name: 'Диагональ',
    options: ['24″', '32″', '40″', '43″', '50″', '55″', '65″', '75″', '85″ и больше'],
    isStep: true,
  },
  { slug: 'resolution', name: 'Разрешение', options: ['HD', 'Full HD', '4K', '8K'] },
  { slug: 'smart', name: 'Smart TV', kind: 'BOOLEAN' },
];

/** Приставки: объём памяти у каждой платформы свой. */
const CONSOLE_STORAGE: Record<string, string[]> = {
  'PlayStation 5': ['825 ГБ', '1 ТБ', '2 ТБ'],
  'PlayStation 4': ['500 ГБ', '1 ТБ', '2 ТБ'],
  'Xbox Series': ['512 ГБ', '1 ТБ', '2 ТБ'],
  'Xbox One': ['500 ГБ', '1 ТБ'],
  'Nintendo Switch': ['32 ГБ', '64 ГБ'],
  'Steam Deck': ['64 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
  Другая: ['Не знаю'],
};

export const CONSOLE_ATTRIBUTES: AttributeSpec[] = [
  {
    slug: 'platform',
    name: 'Платформа',
    options: Object.keys(CONSOLE_STORAGE),
    required: true,
    isStep: true,
  },
  {
    slug: 'storage',
    name: 'Память',
    options: Object.entries(CONSOLE_STORAGE).flatMap(([platform, list]) =>
      list.map((size) => `${platform}::${size}`),
    ),
    dependsOn: 'platform',
  },
];
