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
  Lada: ['Granta', 'Vesta', 'Niva', 'Largus', 'XRAY', 'Kalina', 'Priora', '2107'],
  Toyota: ['Camry', 'Corolla', 'RAV4', 'Land Cruiser', 'Land Cruiser Prado', 'Highlander', 'Avensis'],
  Kia: ['Rio', 'Sportage', 'Ceed', 'Sorento', 'Optima', 'Seltos', 'Soul'],
  Hyundai: ['Solaris', 'Creta', 'Tucson', 'Santa Fe', 'Elantra', 'Sonata', 'Accent'],
  Volkswagen: ['Polo', 'Tiguan', 'Passat', 'Golf', 'Touareg', 'Jetta'],
  Nissan: ['Qashqai', 'X-Trail', 'Almera', 'Juke', 'Note', 'Teana'],
  Renault: ['Logan', 'Duster', 'Sandero', 'Kaptur', 'Arkana'],
  Skoda: ['Octavia', 'Rapid', 'Kodiaq', 'Superb', 'Karoq'],
  BMW: ['3 серия', '5 серия', '7 серия', 'X3', 'X5', 'X6'],
  'Mercedes-Benz': ['C-класс', 'E-класс', 'S-класс', 'GLC', 'GLE', 'Sprinter'],
  Audi: ['A3', 'A4', 'A6', 'Q5', 'Q7'],
  Chevrolet: ['Niva', 'Cruze', 'Lacetti', 'Aveo'],
  Ford: ['Focus', 'Mondeo', 'Kuga', 'Transit'],
  Mazda: ['3', '6', 'CX-5'],
  Haval: ['Jolion', 'F7', 'Dargo'],
  Chery: ['Tiggo 4', 'Tiggo 7 Pro', 'Tiggo 8 Pro'],
  Geely: ['Coolray', 'Atlas', 'Monjaro'],
  UAZ: ['Patriot', 'Hunter', 'Буханка'],
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
  XRAY: ['2015–2022 · хетчбэк'],
  Kalina: ['2004–2013 · первое поколение', '2013–2018 · второе поколение'],
  Priora: ['2007–2013 · дорестайлинг', '2013–2018 · рестайлинг'],
  '2107': ['1982–2012 · седан'],

  Camry: ['2006–2011 · XV40::toyota-camry-40', '2011–2017 · XV50::toyota-camry-50', '2017–наст. время · XV70::toyota-camry-70'],
  Corolla: ['2006–2013 · E140', '2013–2019 · E170', '2019–наст. время · E210'],
  RAV4: ['2005–2012 · XA30', '2012–2018 · XA40', '2018–наст. время · XA50'],
  'Land Cruiser': ['2007–2021 · 200', '2021–наст. время · 300'],
  'Land Cruiser Prado': ['2009–2023 · 150', '2023–наст. время · 250'],

  Rio: ['2011–2017 · седан::kia-rio-3', '2017–2023 · седан::kia-rio-4', '2017–2023 · X-Line::kia-rio-xline'],
  Sportage: ['2010–2015 · SL', '2015–2021 · QL', '2021–наст. время · NQ5'],
  Ceed: ['2012–2018 · второе поколение', '2018–наст. время · третье поколение'],
  Solaris: ['2010–2017 · первое поколение::hyundai-solaris-1', '2017–2022 · второе поколение::hyundai-solaris-2'],
  Creta: ['2016–2021 · первое поколение::hyundai-creta-1', '2021–наст. время · второе поколение::hyundai-creta-2'],
  Tucson: ['2015–2020 · третье поколение', '2020–наст. время · четвёртое поколение'],

  Polo: ['2010–2020 · седан', '2020–2022 · лифтбек'],
  Tiguan: ['2007–2016 · первое поколение', '2016–наст. время · второе поколение'],
  Passat: ['2010–2015 · B7', '2015–наст. время · B8'],
  Golf: ['2012–2020 · VII', '2020–наст. время · VIII'],

  Qashqai: ['2006–2013 · J10', '2013–2021 · J11'],
  'X-Trail': ['2007–2014 · T31', '2014–2022 · T32'],
  Logan: ['2004–2015 · первое поколение', '2014–наст. время · второе поколение'],
  Duster: ['2010–2021 · первое поколение', '2021–наст. время · второе поколение'],

  Octavia: ['2008–2013 · A5', '2013–2020 · A7', '2020–наст. время · A8'],
  '3 серия': ['2005–2012 · E90', '2012–2018 · F30', '2018–наст. время · G20'],
  '5 серия': ['2010–2017 · F10', '2017–2023 · G30', '2023–наст. время · G60'],
  X5: ['2006–2013 · E70', '2013–2018 · F15', '2018–наст. время · G05'],
  'E-класс': ['2009–2016 · W212', '2016–2023 · W213', '2023–наст. время · W214'],
  'C-класс': ['2007–2014 · W204', '2014–2021 · W205', '2021–наст. время · W206'],
  A4: ['2007–2015 · B8', '2015–наст. время · B9'],
  A6: ['2011–2018 · C7', '2018–наст. время · C8'],

  Focus: ['2004–2011 · второе поколение', '2011–2019 · третье поколение'],
  '3': ['2009–2013 · BL', '2013–2019 · BM', '2019–наст. время · BP'],
  '6': ['2007–2012 · GH', '2012–наст. время · GJ'],
  'CX-5': ['2011–2017 · KE', '2017–наст. время · KF'],
  Jolion: ['2020–наст. время · кроссовер'],
  Coolray: ['2018–наст. время · кроссовер'],
  Patriot: ['2005–2016 · дорестайлинг', '2016–наст. время · рестайлинг'],
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
