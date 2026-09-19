/**
 * Характеристики категорий: что спрашивать у продавца и по чему искать.
 *
 * Держатся данными, а не кодом, по двум причинам. Во-первых, набор полей
 * у телефона, машины и дивана не имеет ничего общего, и любая попытка
 * описать их одной формой кончается формой, которая всем неудобна.
 * Во-вторых, список моделей устаревает каждый год: строчка в таблице
 * меняется без выкладки приложения.
 *
 * Характеристика висит на категории и наследуется её подкатегориями.
 * Поэтому «Марка» и «Модель» заведены у «Телефонов», а не отдельно
 * у каждой полки внутри.
 *
 * `isStep` означает, что характеристика спрашивается шагом при выборе
 * категории — как продолжение дерева. Марку и модель человек выбирает
 * до того, как увидит выдачу: «айфон 15» для него такой же раздел, как
 * «телефоны», и поиск начинается именно с него.
 *
 * У зависимой характеристики варианты записаны как «Родитель::Значение»:
 * модели показываются только для выбранной марки.
 */

export type AttributeSpec = {
  slug: string;
  name: string;
  kind?: 'SELECT' | 'NUMBER' | 'BOOLEAN' | 'TEXT';
  options?: string[];
  unit?: string;
  required?: boolean;
  isStep?: boolean;
  filterable?: boolean;
  dependsOn?: string;
};

/** Общие наборы, чтобы не повторять одно и то же в десятке категорий. */
const COLORS = [
  'Чёрный',
  'Белый',
  'Серый',
  'Серебристый',
  'Золотой',
  'Синий',
  'Голубой',
  'Зелёный',
  'Красный',
  'Розовый',
  'Фиолетовый',
  'Жёлтый',
  'Бежевый',
  'Коричневый',
  'Другой',
];

const color: AttributeSpec = { slug: 'color', name: 'Цвет', options: COLORS };

const PHONE_BRANDS = [
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

/**
 * Модели телефонов — по поколениям, от свежих к старым.
 * Список заведомо неполный: внизу каждой марки стоит «Другая модель»,
 * чтобы продавец редкого аппарата не оказался в тупике.
 */
const PHONE_MODELS = [
  ...[
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
    'Другая модель',
  ].map((model) => `Apple::${model}`),
  ...[
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
    'Другая модель',
  ].map((model) => `Samsung::${model}`),
  ...[
    'Xiaomi 15',
    'Xiaomi 14',
    'Redmi Note 14',
    'Redmi Note 13',
    'Redmi Note 12',
    'Redmi 14C',
    'POCO X7',
    'POCO F6',
    'POCO M6',
    'Другая модель',
  ].map((model) => `Xiaomi::${model}`),
  ...['Honor 200', 'Honor 90', 'Honor X9', 'Honor X8', 'Magic 6', 'Другая модель'].map(
    (model) => `Honor::${model}`,
  ),
  ...['Pixel 9', 'Pixel 8', 'Pixel 7', 'Pixel 6', 'Другая модель'].map((model) => `Google::${model}`),
];

const CAR_BRANDS = [
  'Lada',
  'Toyota',
  'Kia',
  'Hyundai',
  'Volkswagen',
  'Nissan',
  'Renault',
  'Chevrolet',
  'Ford',
  'Skoda',
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Mazda',
  'Mitsubishi',
  'Honda',
  'Opel',
  'Peugeot',
  'Citroen',
  'Subaru',
  'Suzuki',
  'Lexus',
  'Volvo',
  'Land Rover',
  'Jeep',
  'Geely',
  'Chery',
  'Haval',
  'Changan',
  'Exeed',
  'Omoda',
  'Moskvich',
  'UAZ',
  'GAZ',
  'Другая',
];

const CAR_MODELS = [
  ...['Granta', 'Vesta', 'Niva', 'Largus', 'Kalina', 'Priora', '2107', 'Другая модель'].map(
    (model) => `Lada::${model}`,
  ),
  ...['Camry', 'Corolla', 'RAV4', 'Land Cruiser', 'Highlander', 'Avensis', 'Другая модель'].map(
    (model) => `Toyota::${model}`,
  ),
  ...['Rio', 'Sportage', 'Ceed', 'Sorento', 'Optima', 'Seltos', 'Другая модель'].map(
    (model) => `Kia::${model}`,
  ),
  ...['Solaris', 'Creta', 'Tucson', 'Santa Fe', 'Elantra', 'Sonata', 'Другая модель'].map(
    (model) => `Hyundai::${model}`,
  ),
  ...['Polo', 'Tiguan', 'Passat', 'Golf', 'Touareg', 'Jetta', 'Другая модель'].map(
    (model) => `Volkswagen::${model}`,
  ),
  ...['X5', 'X3', '3 серия', '5 серия', '7 серия', 'X6', 'Другая модель'].map((model) => `BMW::${model}`),
  ...['E-класс', 'C-класс', 'S-класс', 'GLE', 'GLC', 'Sprinter', 'Другая модель'].map(
    (model) => `Mercedes-Benz::${model}`,
  ),
  ...['A4', 'A6', 'Q5', 'Q7', 'A3', 'Другая модель'].map((model) => `Audi::${model}`),
];

/** Характеристики по слагу категории. Наследуются подкатегориями. */
export const CATEGORY_ATTRIBUTES: Record<string, AttributeSpec[]> = {
  // ─── Электроника ───
  'electronics-phones': [
    { slug: 'brand', name: 'Марка', options: PHONE_BRANDS, required: true, isStep: true },
    {
      slug: 'model',
      name: 'Модель',
      options: PHONE_MODELS,
      dependsOn: 'brand',
      required: true,
      isStep: true,
    },
    {
      slug: 'storage',
      name: 'Память',
      options: ['32 ГБ', '64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
      isStep: true,
    },
    color,
  ],
  'electronics-computers': [
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
      options: ['Apple', 'Asus', 'Acer', 'Lenovo', 'HP', 'Dell', 'MSI', 'Huawei', 'Samsung', 'Своя сборка', 'Другая'],
      isStep: true,
    },
    { slug: 'ram', name: 'Оперативная память', options: ['4 ГБ', '8 ГБ', '16 ГБ', '32 ГБ', '64 ГБ'] },
    { slug: 'storage', name: 'Накопитель', options: ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ', '2 ТБ'] },
    { slug: 'screen', name: 'Диагональ', kind: 'NUMBER', unit: '″' },
  ],
  'electronics-tablets': [
    { slug: 'brand', name: 'Марка', options: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Lenovo', 'Другая'], isStep: true },
    { slug: 'storage', name: 'Память', options: ['32 ГБ', '64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'] },
    { slug: 'cellular', name: 'Сотовая связь', kind: 'BOOLEAN' },
    color,
  ],
  'electronics-tv': [
    { slug: 'brand', name: 'Марка', options: ['Samsung', 'LG', 'Sony', 'Xiaomi', 'Haier', 'TCL', 'Hisense', 'Philips', 'Другая'], isStep: true },
    { slug: 'diagonal', name: 'Диагональ', kind: 'NUMBER', unit: '″', isStep: true },
    { slug: 'resolution', name: 'Разрешение', options: ['HD', 'Full HD', '4K', '8K'] },
    { slug: 'smart', name: 'Smart TV', kind: 'BOOLEAN' },
  ],
  'electronics-audio': [
    {
      slug: 'type',
      name: 'Тип',
      options: ['Наушники', 'Колонка', 'Саундбар', 'Домашний кинотеатр', 'Микрофон', 'Другое'],
      isStep: true,
    },
    { slug: 'brand', name: 'Марка', options: ['Apple', 'Samsung', 'Sony', 'JBL', 'Xiaomi', 'Marshall', 'Yamaha', 'Другая'] },
    { slug: 'wireless', name: 'Беспроводные', kind: 'BOOLEAN' },
  ],
  'electronics-photo': [
    { slug: 'type', name: 'Тип', options: ['Зеркальный', 'Беззеркальный', 'Компакт', 'Экшн-камера', 'Объектив', 'Другое'], isStep: true },
    { slug: 'brand', name: 'Марка', options: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'GoPro', 'Другая'] },
  ],
  'electronics-consoles': [
    {
      slug: 'platform',
      name: 'Платформа',
      options: ['PlayStation 5', 'PlayStation 4', 'Xbox Series', 'Xbox One', 'Nintendo Switch', 'Steam Deck', 'Другая'],
      required: true,
      isStep: true,
    },
    { slug: 'storage', name: 'Память', options: ['500 ГБ', '825 ГБ', '1 ТБ', '2 ТБ'] },
  ],

  // ─── Транспорт ───
  'transport-cars': [
    { slug: 'brand', name: 'Марка', options: CAR_BRANDS, required: true, isStep: true },
    { slug: 'model', name: 'Модель', options: CAR_MODELS, dependsOn: 'brand', required: true, isStep: true },
    { slug: 'year', name: 'Год выпуска', kind: 'NUMBER', required: true, isStep: true },
    { slug: 'mileage', name: 'Пробег', kind: 'NUMBER', unit: 'км' },
    { slug: 'transmission', name: 'Коробка', options: ['Механика', 'Автомат', 'Робот', 'Вариатор'] },
    { slug: 'fuel', name: 'Двигатель', options: ['Бензин', 'Дизель', 'Гибрид', 'Электро', 'Газ'] },
    { slug: 'body', name: 'Кузов', options: ['Седан', 'Хетчбэк', 'Универсал', 'Внедорожник', 'Кроссовер', 'Минивэн', 'Купе', 'Пикап'] },
    { slug: 'drive', name: 'Привод', options: ['Передний', 'Задний', 'Полный'] },
    color,
  ],
  'transport-moto': [
    { slug: 'type', name: 'Тип', options: ['Мотоцикл', 'Скутер', 'Мопед', 'Квадроцикл', 'Снегоход', 'Питбайк'], isStep: true },
    { slug: 'brand', name: 'Марка', options: ['Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'BMW', 'Ducati', 'KTM', 'Racer', 'Другая'] },
    { slug: 'engine', name: 'Объём двигателя', kind: 'NUMBER', unit: 'см³' },
    { slug: 'year', name: 'Год выпуска', kind: 'NUMBER' },
  ],
  'transport-bikes': [
    { slug: 'type', name: 'Тип', options: ['Горный', 'Шоссейный', 'Городской', 'Складной', 'Детский', 'Электровелосипед', 'Самокат'], isStep: true },
    { slug: 'wheel', name: 'Диаметр колёс', kind: 'NUMBER', unit: '″' },
    { slug: 'frame', name: 'Рама', options: ['Алюминий', 'Сталь', 'Карбон'] },
  ],

  // ─── Недвижимость ───
  'realty-flats': [
    { slug: 'rooms', name: 'Комнат', options: ['Студия', '1', '2', '3', '4', '5 и больше'], required: true, isStep: true },
    { slug: 'deal', name: 'Сделка', options: ['Продажа', 'Аренда на длительный срок'], isStep: true },
    { slug: 'area', name: 'Площадь', kind: 'NUMBER', unit: 'м²', required: true },
    { slug: 'floor', name: 'Этаж', kind: 'NUMBER' },
    { slug: 'floors', name: 'Этажей в доме', kind: 'NUMBER' },
    { slug: 'renovation', name: 'Ремонт', options: ['Без ремонта', 'Косметический', 'Евро', 'Дизайнерский'] },
  ],
  'realty-houses': [
    { slug: 'deal', name: 'Сделка', options: ['Продажа', 'Аренда'], isStep: true },
    { slug: 'area', name: 'Площадь дома', kind: 'NUMBER', unit: 'м²', required: true },
    { slug: 'land', name: 'Участок', kind: 'NUMBER', unit: 'сот.' },
    { slug: 'material', name: 'Материал', options: ['Кирпич', 'Дерево', 'Газоблок', 'Каркас', 'Панель'] },
  ],
  'realty-land': [
    { slug: 'area', name: 'Площадь участка', kind: 'NUMBER', unit: 'сот.', required: true },
    { slug: 'purpose', name: 'Назначение', options: ['ИЖС', 'СНТ, ДНП', 'Сельхоз', 'Промышленное'] },
  ],
  'realty-garages': [
    { slug: 'type', name: 'Тип', options: ['Гараж', 'Машиноместо', 'Бокс'], isStep: true },
    { slug: 'area', name: 'Площадь', kind: 'NUMBER', unit: 'м²' },
  ],

  // ─── Для дома ───
  furniture: [
    {
      slug: 'type',
      name: 'Тип',
      options: ['Диван', 'Кровать', 'Шкаф', 'Стол', 'Стулья', 'Кресло', 'Комод', 'Кухня', 'Полки', 'Другое'],
      required: true,
      isStep: true,
    },
    { slug: 'material', name: 'Материал', options: ['ЛДСП', 'Массив', 'Металл', 'Стекло', 'Ткань', 'Кожа'] },
    color,
  ],
  'home-appliances': [
    {
      slug: 'type',
      name: 'Тип',
      options: ['Холодильник', 'Стиральная машина', 'Посудомойка', 'Плита', 'Духовой шкаф', 'Микроволновка', 'Пылесос', 'Кондиционер', 'Другое'],
      required: true,
      isStep: true,
    },
    { slug: 'brand', name: 'Марка', options: ['Bosch', 'Samsung', 'LG', 'Indesit', 'Atlant', 'Haier', 'Electrolux', 'Beko', 'Другая'] },
  ],

  // ─── Личные вещи ───
  clothes: [
    { slug: 'gender', name: 'Кому', options: ['Женское', 'Мужское', 'Унисекс'], required: true, isStep: true },
    { slug: 'type', name: 'Что именно', options: ['Верхняя одежда', 'Платья', 'Брюки и джинсы', 'Рубашки и блузы', 'Свитеры и кофты', 'Обувь', 'Спортивное', 'Другое'], isStep: true },
    { slug: 'size', name: 'Размер', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL и больше'] },
    { slug: 'season', name: 'Сезон', options: ['Зима', 'Лето', 'Демисезон', 'Всесезон'] },
    color,
  ],
  kids: [
    {
      slug: 'type',
      name: 'Что именно',
      options: ['Коляски', 'Автокресла', 'Кроватки', 'Игрушки', 'Одежда', 'Обувь', 'Стульчики', 'Другое'],
      required: true,
      isStep: true,
    },
    { slug: 'age', name: 'Возраст', options: ['0–1 год', '1–3 года', '3–7 лет', '7–12 лет', 'Подростковое'] },
  ],
  'personal-watches': [
    { slug: 'type', name: 'Тип', options: ['Наручные часы', 'Умные часы', 'Украшения', 'Другое'], isStep: true },
    { slug: 'material', name: 'Материал', options: ['Золото', 'Серебро', 'Сталь', 'Бижутерия'] },
  ],

  // ─── Хобби ───
  sport: [
    {
      slug: 'type',
      name: 'Что именно',
      options: ['Тренажёры', 'Гантели и штанги', 'Зимний спорт', 'Туризм', 'Единоборства', 'Игровые виды', 'Другое'],
      isStep: true,
    },
  ],
  'hobby-music': [
    { slug: 'type', name: 'Инструмент', options: ['Гитара', 'Клавишные', 'Ударные', 'Духовые', 'Струнные', 'Студийное оборудование', 'Другое'], isStep: true },
  ],

  // ─── Инструменты ───
  tools: [
    {
      slug: 'type',
      name: 'Тип',
      options: ['Электроинструмент', 'Ручной инструмент', 'Садовая техника', 'Измерительный', 'Сварочный', 'Другое'],
      isStep: true,
    },
    { slug: 'brand', name: 'Марка', options: ['Bosch', 'Makita', 'DeWalt', 'Metabo', 'Интерскол', 'Зубр', 'Другая'] },
  ],

  // ─── Цифровое ───
  gaming: [
    {
      slug: 'platform',
      name: 'Платформа',
      options: ['Steam', 'PlayStation', 'Xbox', 'Nintendo', 'Epic Games', 'Мобильные', 'Другое'],
      required: true,
      isStep: true,
    },
    { slug: 'kind', name: 'Что продаёте', options: ['Аккаунт', 'Игра или ключ', 'Внутриигровые предметы', 'Прокачка'] },
  ],
};
