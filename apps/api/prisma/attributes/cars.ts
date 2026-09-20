import type { AttributeSpec } from '../category-attributes';

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
  Lexus: ['RX', 'NX', 'LX', 'GX', 'ES', 'IS', 'LS', 'UX'],
  Volvo: ['XC60', 'XC90', 'XC40', 'S60', 'S80', 'S90', 'V40', 'V90'],
  'Land Rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Range Rover Velar', 'Discovery', 'Discovery Sport', 'Defender', 'Freelander'],
  Jeep: ['Grand Cherokee', 'Cherokee', 'Wrangler', 'Compass', 'Renegade'],
  Changan: ['CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'CS95', 'Uni-K', 'Uni-V', 'Alsvin', 'Eado'],
  Exeed: ['TXL', 'VX', 'LX', 'RX', 'ES'],
  Omoda: ['C5', 'S5', 'C7', 'S5 GT'],
  Moskvich: ['3', '3e', '6', '8', '2141', '412'],
  GAZ: ['Газель Next', 'Газель Бизнес', 'Газель 3302', 'Соболь', 'ГАЗон Next', 'Волга 3110', 'Волга 31105'],
  Chevrolet: ['Niva', 'Cruze', 'Lacetti', 'Aveo', 'Captiva', 'Epica', 'Spark', 'Tahoe'],
  Ford: ['Focus', 'Mondeo', 'Kuga', 'Transit', 'Fiesta', 'EcoSport', 'Explorer', 'Escape'],
  Mazda: ['3', '6', 'CX-5', 'CX-7', 'CX-9', 'CX-30', 'Demio', 'Axela'],
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
  Lada: ['Granta', 'Vesta', 'Niva', 'Largus', 'XRAY', 'Kalina', 'Priora', '2107', 'Niva Travel', '2114', '2110', 'Iskra'],
};

/**
 * Поколения: годы и кузов. Пишутся так, как их называет продавец, —
 * по годам выпуска, потому что именно это написано в документах.
 */
const GENERATIONS: Record<string, string[]> = {
  Granta: [
    '2011–2018 · седан::lada-granta-1',
    '2018–наст. время · седан::lada-granta-2',
    '2018–наст. время · лифтбек::lada-granta-liftback',
    '2018–наст. время · универсал::lada-granta-wagon',
  ],
  Vesta: [
    '2015–2022 · седан::lada-vesta-1',
    '2015–2022 · SW Cross::lada-vesta-sw',
    '2022–наст. время · седан::lada-vesta-2',
    '2022–наст. время · SW Cross::lada-vesta-sw2',
  ],
  Niva: ['1977–2021 · 3 двери::lada-niva-legend', '2021–наст. время · Legend::lada-niva-legend2', '2020–наст. время · Travel::lada-niva-travel'],
  Largus: ['2012–2021 · универсал::lada-largus-1', '2021–наст. время · универсал::lada-largus-2', 'фургон::lada-largus-van'],
  XRAY: ['2015–2022 · хетчбэк::lada-xray-2015-2022-hetchbek'],
  Kalina: ['2004–2013 · первое поколение::lada-kalina-2004-2013-pervoe-pokolen', '2013–2018 · второе поколение::lada-kalina-2013-2018-vtoroe-pokolen'],
  Priora: ['2007–2013 · дорестайлинг::lada-priora-2007-2013-dorestayling', '2013–2018 · рестайлинг::lada-priora-2013-2018-restayling'],
  '2107': ['1982–2012 · седан::lada-2107-1982-2012-sedan'],

  Camry: ['2006–2011 · XV40::toyota-camry-40', '2011–2017 · XV50::toyota-camry-50', '2017–наст. время · XV70::toyota-camry-70'],
  Corolla: ['2006–2013 · E140::toyota-corolla-2006-2013-e140', '2013–2019 · E170::toyota-corolla-2013-2019-e170', '2019–наст. время · E210::toyota-corolla-2019-nast-vremya-e210'],
  RAV4: ['2005–2012 · XA30::toyota-rav4-2005-2012-xa30', '2012–2018 · XA40::toyota-rav4-2012-2018-xa40', '2018–наст. время · XA50::toyota-rav4-2018-nast-vremya-xa50'],
  'Land Cruiser': ['2007–2021 · 200::toyota-land-cruiser-2007-2021-200', '2021–наст. время · 300::toyota-land-cruiser-2021-nast-vremya-300'],
  'Land Cruiser Prado': ['2009–2023 · 150::toyota-land-cruiser-prado-2009-2023-150', '2023–наст. время · 250::toyota-land-cruiser-prado-2023-nast-vremya-250'],

  Rio: ['2011–2017 · седан::kia-rio-3', '2017–2023 · седан::kia-rio-4', '2017–2023 · X-Line::kia-rio-xline'],
  Sportage: ['2010–2015 · SL::kia-sportage-2010-2015-sl', '2015–2021 · QL::kia-sportage-2015-2021-ql', '2021–наст. время · NQ5::kia-sportage-2021-nast-vremya-nq5'],
  Ceed: ['2012–2018 · второе поколение::kia-ceed-2012-2018-vtoroe-pokolen', '2018–наст. время · третье поколение::kia-ceed-2018-nast-vremya-trete-p'],
  Solaris: ['2010–2017 · первое поколение::hyundai-solaris-1', '2017–2022 · второе поколение::hyundai-solaris-2'],
  Creta: ['2016–2021 · первое поколение::hyundai-creta-1', '2021–наст. время · второе поколение::hyundai-creta-2'],
  Tucson: ['2015–2020 · третье поколение::hyundai-tucson-2015-2020-trete-pokoleni', '2020–наст. время · четвёртое поколение::hyundai-tucson-2020-nast-vremya-chetver'],

  Polo: ['2010–2020 · седан::volkswagen-polo-2010-2020-sedan', '2020–2022 · лифтбек::volkswagen-polo-2020-2022-liftbek'],
  Tiguan: ['2007–2016 · первое поколение::volkswagen-tiguan-2007-2016-pervoe-pokolen', '2016–наст. время · второе поколение::volkswagen-tiguan-2016-nast-vremya-vtoroe-'],
  Passat: ['2010–2015 · B7::volkswagen-passat-2010-2015-b7', '2015–наст. время · B8::volkswagen-passat-2015-nast-vremya-b8'],
  Golf: ['2012–2020 · VII::volkswagen-golf-2012-2020-vii', '2020–наст. время · VIII::volkswagen-golf-2020-nast-vremya-viii'],

  Qashqai: ['2006–2013 · J10::nissan-qashqai-2006-2013-j10', '2013–2021 · J11::nissan-qashqai-2013-2021-j11'],
  'X-Trail': ['2007–2014 · T31::nissan-x-trail-2007-2014-t31', '2014–2022 · T32::nissan-x-trail-2014-2022-t32'],
  Logan: ['2004–2015 · первое поколение::renault-logan-2004-2015-pervoe-pokolen', '2014–наст. время · второе поколение::renault-logan-2014-nast-vremya-vtoroe-'],
  Duster: ['2010–2021 · первое поколение::renault-duster-2010-2021-pervoe-pokolen', '2021–наст. время · второе поколение::renault-duster-2021-vtoroe-pokolenie'],

  Octavia: ['2008–2013 · A5::skoda-octavia-2008-2013-a5', '2013–2020 · A7::skoda-octavia-2013-2020-a7', '2020–наст. время · A8::skoda-octavia-2020-nast-vremya-a8'],
  '3 серия': ['2005–2012 · E90::bmw-3-seriya-2005-2012-e90', '2012–2018 · F30::bmw-3-seriya-2012-2018-f30', '2018–наст. время · G20::bmw-3-seriya-2018-nast-vremya-g20'],
  '5 серия': ['2010–2017 · F10::bmw-5-seriya-2010-2017-f10', '2017–2023 · G30::bmw-5-seriya-2017-2023-g30', '2023–наст. время · G60::bmw-5-seriya-2023-nast-vremya-g60'],
  X5: ['2006–2013 · E70::bmw-x5-2006-2013-e70', '2013–2018 · F15::bmw-x5-2013-2018-f15', '2018–наст. время · G05::bmw-x5-2018-nast-vremya-g05'],
  'E-класс': ['2009–2016 · W212::mercedes-benz-e-klass-2009-2016-w212', '2016–2023 · W213::mercedes-benz-e-klass-2016-2023-w213', '2023–наст. время · W214::mercedes-benz-e-klass-2023-nast-vremya-w214'],
  'C-класс': ['2007–2014 · W204::mercedes-benz-c-klass-2007-2014-w204', '2014–2021 · W205::mercedes-benz-c-klass-2014-2021-w205', '2021–наст. время · W206::mercedes-benz-c-klass-2021-nast-vremya-w206'],
  A4: ['2007–2015 · B8::audi-a4-2007-2015-b8', '2015–наст. время · B9::audi-a4-2015-nast-vremya-b9'],
  A6: ['2011–2018 · C7::audi-a6-2011-2018-c7', '2018–наст. время · C8::audi-a6-2018-nast-vremya-c8'],

  Focus: ['2004–2011 · второе поколение::ford-focus-2004-2011-vtoroe-pokolen', '2011–2019 · третье поколение::ford-focus-2011-2019-trete-pokoleni'],
  '3': ['2009–2013 · BL::mazda-3-2009-2013-bl', '2013–2019 · BM::mazda-3-2013-2019-bm', '2019–наст. время · BP::mazda-3-2019-nast-vremya-bp'],
  '6': ['2007–2012 · GH::mazda-6-2007-2012-gh', '2012–наст. время · GJ::mazda-6-2012-nast-vremya-gj'],
  'CX-5': ['2011–2017 · KE::mazda-cx-5-2011-2017-ke', '2017–наст. время · KF::mazda-cx-5-2017-nast-vremya-kf'],
  Jolion: ['2020–наст. время · кроссовер::haval-jolion-2020-nast-vremya-krossov'],
  Coolray: ['2018–наст. время · кроссовер::geely-coolray-2018-nast-vremya-krossov'],
  Patriot: ['2005–2016 · дорестайлинг::uaz-patriot-2005-2016-dorestayling', '2016–наст. время · рестайлинг::uaz-patriot-2016-nast-vremya-restayl'],
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
