import type { AttributeSpec } from '../category-attributes';
import { GENERATIONS_EU } from './generations-eu';
import { GENERATIONS_ASIA } from './generations-asia';
import { GENERATIONS_RUS } from './generations-rus';

/**
 * Автомобили: марка, модель, поколение.
 *
 * Поколение — отдельный шаг с картинками. Продавец и покупатель мыслят
 * не годом выпуска, а внешностью машины: «Гранта дорестайл» и «Гранта
 * после 2018-го» — разные автомобили по цене и по виду, хотя модель
 * одна. Год в отрыве от кузова не говорит ничего: рестайлинг случается
 * посреди года, и одна и та же «Веста 2018» бывает двух разных лиц.
 *
 * Поэтому вариант поколения содержит годы и тип кузова сразу:
 * «2018–наст. время · седан». Картинка подбирается приложением по
 * марке и модели — рисовать каждое поколение отдельно дорого, поэтому
 * там, где снимка нет, шаг остаётся текстовым и работает так же.
 */

const BRANDS = [
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

/** Модели по маркам — самые ходовые на вторичном рынке. */
const MODELS: Record<string, string[]> = {
  UAZ: ['Patriot', 'Hunter', 'Буханка'],
  // Марки, у которых раньше шаг «Модель» оказывался пустым: человек
  // доходил до него и упирался в ничто. Поколения у них не расписаны —
  // для них шаг кузова просто не появится, и это честнее пустого списка.
  Mitsubishi: ['Outlander', 'Lancer', 'Pajero', 'Pajero Sport', 'ASX', 'L200', 'Eclipse Cross'],
  Honda: ['CR-V', 'Civic', 'Accord', 'Pilot', 'Fit', 'HR-V', 'Freed'],
  Opel: ['Astra', 'Insignia', 'Corsa', 'Zafira', 'Mokka', 'Vectra', 'Antara'],
  Peugeot: ['308', '408', '3008', '2008', '206', '207', '5008', 'Partner'],
  Citroen: ['C4', 'C5', 'C3', 'C3 Aircross', 'C5 Aircross', 'Berlingo', 'Jumpy'],
  Subaru: ['Forester', 'Outback', 'XV', 'Impreza', 'Legacy', 'Tribeca'],
  Suzuki: ['Grand Vitara', 'SX4', 'Vitara', 'Jimny', 'Swift', 'Liana'],
  Lexus: ['Lexus RX', 'Lexus NX', 'Lexus LX', 'Lexus GX', 'Lexus ES', 'Lexus IS', 'Lexus LS', 'Lexus UX'],
  Volvo: ['XC60', 'XC90', 'XC40', 'S60', 'S80', 'S90', 'V40', 'V90'],
  'Land Rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Range Rover Velar', 'Discovery', 'Discovery Sport', 'Defender', 'Freelander'],
  Jeep: ['Grand Cherokee', 'Cherokee', 'Wrangler', 'Compass', 'Renegade'],
  Changan: ['CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'CS95', 'Uni-K', 'Uni-V', 'Alsvin', 'Eado'],
  Exeed: ['TXL', 'VX', 'Exeed LX', 'Exeed RX', 'Exeed ES'],
  Omoda: ['Omoda C5', 'Omoda S5', 'Omoda C7', 'Omoda S5 GT'],
  Moskvich: ['Москвич 3', 'Москвич 3e', 'Москвич 6', 'Москвич 8', '2141', '412'],
  GAZ: ['Газель Next', 'Газель Бизнес', 'Газель 3302', 'Соболь', 'ГАЗон Next', 'Волга 3110', 'Волга 31105'],
  Chevrolet: ['Chevrolet Niva', 'Cruze', 'Lacetti', 'Aveo', 'Captiva', 'Epica', 'Spark', 'Tahoe'],
  Ford: ['Focus', 'Mondeo', 'Kuga', 'Transit', 'Fiesta', 'EcoSport', 'Explorer', 'Escape'],
  Mazda: ['Mazda 3', 'Mazda 6', 'CX-5', 'CX-7', 'CX-9', 'CX-30', 'Demio', 'Axela'],
  Haval: ['Jolion', 'F7', 'F7x', 'Dargo', 'H9', 'H5', 'M6'],
  Chery: ['Tiggo 4', 'Tiggo 7 Pro', 'Tiggo 8 Pro', 'Tiggo 2', 'Arrizo 8', 'Tiggo 9'],
  Geely: ['Coolray', 'Atlas', 'Monjaro', 'Tugella', 'Emgrand', 'Okavango', 'Cityray'],
  Toyota: ['Camry', 'Corolla', 'RAV4', 'Land Cruiser', 'Land Cruiser Prado', 'Highlander', 'Avensis', 'Hilux', 'Yaris', 'Vitz', 'Auris', 'Fortuner'],
  Kia: ['Rio', 'Sportage', 'Ceed', 'Sorento', 'Optima', 'Seltos', 'Soul', 'Picanto', 'Carnival', 'K5', 'Cerato', 'Mohave'],
  Hyundai: ['Solaris', 'Creta', 'Tucson', 'Santa Fe', 'Elantra', 'Sonata', 'Accent', 'i30', 'ix35', 'Getz', 'Palisade', 'Staria'],
  Nissan: ['Qashqai', 'X-Trail', 'Almera', 'Juke', 'Note', 'Teana', 'Murano', 'Patrol', 'Pathfinder', 'Terrano', 'Tiida'],
  Renault: ['Logan', 'Duster', 'Sandero', 'Kaptur', 'Arkana', 'Megane', 'Fluence', 'Symbol', 'Koleos'],
  Skoda: ['Octavia', 'Rapid', 'Kodiaq', 'Superb', 'Karoq', 'Fabia', 'Yeti', 'Kamiq'],
  Volkswagen: ['Polo', 'Tiguan', 'Passat', 'Golf', 'Touareg', 'Jetta', 'Teramont', 'Caddy', 'Transporter', 'Touran'],
  BMW: ['3 серия', '5 серия', '7 серия', 'X1', 'X3', 'X5', 'X6', 'X7', '1 серия', '4 серия', 'M5'],
  'Mercedes-Benz': ['C-класс', 'E-класс', 'S-класс', 'GLC', 'GLE', 'GLA', 'GLS', 'Sprinter', 'Vito', 'A-класс', 'V-класс'],
  Audi: ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'A5', 'TT'],
  Lada: ['Granta', 'Vesta', 'Lada Niva', 'Largus', 'XRAY', 'Kalina', 'Priora', '2107', 'Niva Travel', '2114', '2110', 'Iskra'],
};

/**
 * Поколения: годы, название и тип кузова.
 *
 * Разнесены по частям света: европейские марки, азиатские и наши.
 * В одном файле список на шестьсот с лишним строк перестаёт читаться,
 * а править его приходится каждый год — выходят новые поколения.
 */
const GENERATIONS: Record<string, string[]> = {
  ...GENERATIONS_EU,
  ...GENERATIONS_ASIA,
  ...GENERATIONS_RUS,
};

const models = Object.entries(MODELS).flatMap(([brand, list]) =>
  [...list, 'Другая модель'].map((model) => `${brand}::${model}`),
);

const generations = Object.entries(GENERATIONS).flatMap(([model, list]) =>
  list.map((generation) => `${model}::${generation}`),
);

export const CAR_ATTRIBUTES: AttributeSpec[] = [
  { slug: 'brand', name: 'Марка', options: BRANDS, required: true, isStep: true },
  { slug: 'model', name: 'Модель', options: models, dependsOn: 'brand', required: true, isStep: true },
  {
    slug: 'generation',
    name: 'Поколение и кузов',
    options: generations,
    dependsOn: 'model',
    isStep: true,
  },
  { slug: 'year', name: 'Год выпуска', kind: 'NUMBER' },
  { slug: 'mileage', name: 'Пробег', kind: 'NUMBER', unit: 'км' },
  { slug: 'transmission', name: 'Коробка', options: ['Механика', 'Автомат', 'Робот', 'Вариатор'] },
  { slug: 'fuel', name: 'Двигатель', options: ['Бензин', 'Дизель', 'Гибрид', 'Электро', 'Газ'] },
  {
    slug: 'body',
    name: 'Кузов',
    options: ['Седан', 'Хетчбэк', 'Универсал', 'Внедорожник', 'Кроссовер', 'Минивэн', 'Купе', 'Пикап', 'Лифтбек', 'Фургон'],
  },
  { slug: 'drive', name: 'Привод', options: ['Передний', 'Задний', 'Полный'] },
];
