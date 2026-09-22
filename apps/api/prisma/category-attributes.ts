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

import { PHONE_ATTRIBUTES } from './attributes/phones';
import {
  APPLIANCE_ATTRIBUTES,
  COMPUTER_ATTRIBUTES,
  CONSOLE_ATTRIBUTES,
  TV_ATTRIBUTES,
} from './attributes/computers';
import { CAR_ATTRIBUTES } from './attributes/cars';

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

/** Характеристики по слагу категории. Наследуются подкатегориями. */
export const CATEGORY_ATTRIBUTES: Record<string, AttributeSpec[]> = {
  // ─── Электроника ───
  // Наборы вынесены в отдельные файлы: у телефонов и машин списки
  // моделей длиннее, чем всё остальное вместе взятое.
  'electronics-phones': [...PHONE_ATTRIBUTES, color],
  'electronics-computers': COMPUTER_ATTRIBUTES,
  'electronics-tv': TV_ATTRIBUTES,
  'electronics-consoles': CONSOLE_ATTRIBUTES,
  'home-appliances': APPLIANCE_ATTRIBUTES,
  'electronics-tablets': [
    { slug: 'brand', name: 'Марка', options: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Honor', 'Lenovo', 'Другая'], isStep: true },
    { slug: 'storage', name: 'Память', options: ['64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'] },
    { slug: 'cellular', name: 'Сотовая связь', kind: 'BOOLEAN' },
    color,
  ],
  'electronics-audio': [
    {
      slug: 'type',
      name: 'Что именно',
      options: ['Наушники', 'Колонка', 'Саундбар', 'Домашний кинотеатр', 'Микрофон', 'Усилитель', 'Другое'],
      isStep: true,
    },
    {
      slug: 'brand',
      name: 'Марка',
      options: ['Apple', 'Samsung', 'Sony', 'JBL', 'Xiaomi', 'Marshall', 'Yamaha', 'Edifier', 'Sennheiser', 'Другая'],
      isStep: true,
    },
    { slug: 'wireless', name: 'Беспроводные', kind: 'BOOLEAN' },
  ],
  'electronics-photo': [
    {
      slug: 'type',
      name: 'Что именно',
      options: ['Зеркальный фотоаппарат', 'Беззеркальный фотоаппарат', 'Компакт', 'Экшн-камера', 'Объектив', 'Штатив и свет', 'Другое'],
      isStep: true,
    },
    {
      slug: 'brand',
      name: 'Марка',
      options: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'Olympus', 'GoPro', 'DJI', 'Другая'],
      isStep: true,
    },
  ],

  // ─── Транспорт ───
  'transport-cars': [...CAR_ATTRIBUTES, color],
  // ─── Недвижимость ───
  'realty-flats': [
    { slug: 'rooms', name: 'Комнат', options: ['Студия', '1', '2', '3', '4', '5 и больше'], required: true, isStep: true },
    { slug: 'deal', name: 'Что нужно', options: ['Покупка квартиры', 'Аренда на длительный срок'], isStep: true },
    { slug: 'area', name: 'Площадь', kind: 'NUMBER', unit: 'м²', required: true },
    { slug: 'floor', name: 'Этаж', kind: 'NUMBER' },
    { slug: 'floors', name: 'Этажей в доме', kind: 'NUMBER' },
    { slug: 'renovation', name: 'Ремонт', options: ['Без ремонта', 'Косметический', 'Евро', 'Дизайнерский'] },
  ],
  'realty-houses': [
    { slug: 'deal', name: 'Что нужно', options: ['Покупка дома', 'Аренда дома'], isStep: true },
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
