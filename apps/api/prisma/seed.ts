/**
 * Наполнение базы стартовыми данными.
 * Запуск: npm run db:seed -w @app/api
 *
 * Скрипт идемпотентен — его можно выполнять повторно.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadEnvFile } from '../src/load-env';

loadEnvFile();

const prisma = new PrismaClient();

/**
 * Обложки демонстрационных карточек.
 *
 * Настоящих фотографий у проекта нет: снимок вещи или портрет мастера
 * нужно снять, а не сгенерировать. Вместо пустых плашек — нарисованные
 * обложки в оформлении приложения (см. scripts/demo-photos.mjs). Файлы
 * лежат в репозитории и при сиде копируются в хранилище, поэтому сид
 * не зависит ни от сети, ни от браузера.
 */
const PHOTO_DIR = resolve(__dirname, 'demo-photos');
const STORAGE_DIR = resolve(__dirname, '..', process.env.STORAGE_LOCAL_DIR ?? './uploads');
const PUBLIC_PREFIX = process.env.STORAGE_PUBLIC_URL ?? '/uploads';

/** Привязывает обложку к объявлению, переписывая прежнюю: сид идемпотентен. */
async function attachCover(listingId: string, name: string): Promise<void> {
  const photo = await placeCover(name);
  if (!photo) return;

  await prisma.listingPhoto.deleteMany({ where: { listingId } });
  await prisma.listingPhoto.create({
    data: { listingId, url: photo.url, storageKey: photo.key, sortOrder: 0 },
  });
}

/** Кладёт обложку в хранилище под предсказуемым ключом и возвращает ссылку. */
async function placeCover(name: string): Promise<{ key: string; url: string } | null> {
  const source = join(PHOTO_DIR, `${name}.jpg`);
  if (!existsSync(source)) return null;

  const key = `demo/${name}.jpg`;
  const target = join(STORAGE_DIR, key);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);

  return { key, url: `${PUBLIC_PREFIX}/${key}` };
}

/**
 * Список первичных администраторов читается напрямую, а не из config:
 * наполнение базы не должно требовать токена бота.
 */
const adminTelegramIds = (process.env.ADMIN_TELEGRAM_IDS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => BigInt(value));

/** Категории товаров для витрины объявлений. */
const PRODUCT_CATEGORIES = [
  { slug: 'electronics', name: 'Электроника', icon: '📱', sortOrder: 10 },
  { slug: 'home', name: 'Для дома', icon: '🏠', sortOrder: 20 },
  { slug: 'clothes', name: 'Одежда и обувь', icon: '👕', sortOrder: 30 },
  { slug: 'kids', name: 'Детское', icon: '🧸', sortOrder: 40 },
  { slug: 'sport', name: 'Спорт и отдых', icon: '⚽️', sortOrder: 50 },
  { slug: 'auto-parts', name: 'Запчасти', icon: '🔩', sortOrder: 60 },
  { slug: 'tools', name: 'Инструменты', icon: '🧰', sortOrder: 70 },
  { slug: 'hobby', name: 'Хобби', icon: '🎸', sortOrder: 80 },
];

/**
 * Демо-объявления и их продавец.
 *
 * Без них витрина «Купи-продай» открывается пустой, и проверить каталог
 * не на чем. Продавец — служебная учётная запись с заведомо несуществующим
 * telegramId: писать ему можно, но ответа не будет, ровно как и демо-мастерам.
 * Убрать всю демонстрацию разом: DELETE FROM users WHERE "telegramId" = 1.
 */
const DEMO_SELLER_TELEGRAM_ID = 1n;
/** Автор демонстрационных запросов на обратной витрине. */
const DEMO_BUYER_TELEGRAM_ID = 2n;

const DEMO_LISTINGS = [
  {
    slug: 'iphone-13-128-gb-demo',
    cover: 'listing-iphone',
    title: 'iPhone 13, 128 ГБ',
    description: 'Полностью рабочий, ёмкость аккумулятора 89%. Коробка и кабель в комплекте, чехол в подарок. Смотреть у метро Чистые пруды.',
    priceAmount: 3990000,
    condition: 'USED_PERFECT' as const,
    city: 'Москва',
    isNegotiable: true,
    categorySlug: 'electronics',
  },
  {
    slug: 'divan-uglovoy-demo',
    cover: 'listing-divan',
    title: 'Угловой диван, раскладной',
    description: 'Ширина 260 см, спальное место 200×140. Ткань рогожка, следов от животных нет. Самовывоз, помогу вынести.',
    priceAmount: 1800000,
    condition: 'USED' as const,
    city: 'Москва',
    isNegotiable: true,
    categorySlug: 'home',
  },
  {
    slug: 'kurtka-zimnyaya-demo',
    cover: 'listing-kurtka',
    title: 'Куртка зимняя, размер M',
    description: 'Носил один сезон, дефектов нет. Пуховый наполнитель, капюшон отстёгивается.',
    priceAmount: 450000,
    condition: 'USED_PERFECT' as const,
    city: 'Санкт-Петербург',
    isNegotiable: false,
    categorySlug: 'clothes',
  },
  {
    slug: 'kolyaska-progulochnaya-demo',
    cover: 'listing-kolyaska',
    title: 'Коляска прогулочная',
    description: 'Лёгкая, складывается одной рукой. Дождевик и москитная сетка в комплекте. Ребёнок вырос.',
    priceAmount: 800000,
    condition: 'USED' as const,
    city: 'Москва',
    isNegotiable: true,
    categorySlug: 'kids',
  },
  {
    slug: 'velosiped-gornyy-demo',
    cover: 'listing-velosiped',
    title: 'Велосипед горный, 26"',
    description: 'Алюминиевая рама, 21 скорость, дисковые тормоза. Недавно обслужен: смазана цепь, отрегулированы переключатели.',
    priceAmount: 1200000,
    condition: 'USED' as const,
    city: 'Казань',
    isNegotiable: false,
    categorySlug: 'sport',
  },
  {
    slug: 'perforator-bosch-demo',
    cover: 'listing-perforator',
    title: 'Перфоратор Bosch',
    description: 'Брал под ремонт, сделал и больше не нужен. Три бура и кейс в комплекте.',
    priceAmount: 650000,
    condition: 'USED_PERFECT' as const,
    city: 'Москва',
    isNegotiable: false,
    categorySlug: 'tools',
  },
  {
    slug: 'gitara-akusticheskaya-demo',
    cover: 'listing-gitara',
    title: 'Гитара акустическая',
    description: 'Дредноут, верхняя дека — ель. Новые струны, чехол в комплекте. Играть учился, не пошло.',
    priceAmount: 900000,
    condition: 'USED' as const,
    city: 'Санкт-Петербург',
    isNegotiable: true,
    categorySlug: 'hobby',
  },
];

/** Демо-запросы: чего люди ищут. Цена здесь — потолок покупателя. */
const DEMO_WANTED = [
  {
    slug: 'ishchu-playstation-5-demo',
    cover: 'wanted-ps5',
    title: 'Ищу PlayStation 5',
    description: 'Нужна с одним геймпадом, состояние не принципиально. Заберу сам в пределах города.',
    priceAmount: 3500000,
    condition: 'USED' as const,
    city: 'Москва',
    isNegotiable: true,
    categorySlug: 'electronics',
  },
  {
    slug: 'ishchu-detskoe-kreslo-demo',
    cover: 'wanted-kreslo',
    title: 'Ищу детское автокресло',
    description: 'От 9 до 18 кг, без следов аварии. Важен чистый чехол.',
    priceAmount: 400000,
    condition: 'USED_PERFECT' as const,
    city: 'Москва',
    isNegotiable: false,
    categorySlug: 'kids',
  },
  {
    slug: 'ishchu-shurupovert-demo',
    cover: 'wanted-shurupovert',
    title: 'Ищу шуруповёрт на время ремонта',
    description: 'Куплю недорогой, лишь бы держал заряд. Готов забрать сегодня вечером.',
    priceAmount: 250000,
    condition: 'USED' as const,
    city: 'Санкт-Петербург',
    isNegotiable: true,
    categorySlug: 'tools',
  },
  {
    slug: 'ishchu-velotrenazher-demo',
    cover: 'wanted-trenazher',
    title: 'Ищу велотренажёр',
    description: 'Домашний, складной. Самовывоз, машина есть.',
    priceAmount: 800000,
    condition: 'USED' as const,
    city: 'Казань',
    isNegotiable: true,
    categorySlug: 'sport',
  },
];

const CATEGORIES = [
  { slug: 'beauty', name: 'Красота', icon: '💅', sortOrder: 10 },
  { slug: 'repair', name: 'Ремонт и стройка', icon: '🔨', sortOrder: 20 },
  { slug: 'auto', name: 'Авто', icon: '🚗', sortOrder: 30 },
  { slug: 'health', name: 'Здоровье', icon: '🩺', sortOrder: 40 },
  { slug: 'tutors', name: 'Репетиторы', icon: '📚', sortOrder: 50 },
  { slug: 'cleaning', name: 'Уборка', icon: '🧹', sortOrder: 60 },
  { slug: 'photo', name: 'Фото и видео', icon: '📷', sortOrder: 70 },
  { slug: 'it', name: 'IT и техника', icon: '💻', sortOrder: 80 },
  { slug: 'pets', name: 'Животные', icon: '🐾', sortOrder: 90 },
  { slug: 'events', name: 'Праздники', icon: '🎉', sortOrder: 100 },
];

/** Демо-карточки. Координаты — центр Москвы, чтобы карта была не пустой. */
const DEMO_SPECIALISTS = [
  {
    slug: 'anna-manicure',
    cover: 'master-anna',
    displayName: 'Анна Соколова',
    headline: 'Мастер маникюра, 8 лет опыта',
    about: 'Аппаратный и комбинированный маникюр, укрепление, дизайн. Работаю на материалах премиум-класса. Принимаю в своей студии рядом с метро Чистые пруды.',
    city: 'Москва',
    address: 'ул. Мясницкая, 24',
    lat: 55.7639, lng: 37.6364,
    phone: '+7 900 111-22-33',
    telegram: '@anna_nails_demo',
    categorySlug: 'beauty',
    services: [
      { name: 'Маникюр с покрытием', priceAmount: 250000, priceIsFrom: false },
      { name: 'Наращивание ногтей', priceAmount: 400000, priceIsFrom: true },
      { name: 'Дизайн (за ноготь)', priceAmount: 15000, priceIsFrom: true },
    ],
  },
  {
    slug: 'sergey-plumber',
    cover: 'master-sergey',
    displayName: 'Сергей Никитин',
    headline: 'Сантехник, выезд в день обращения',
    about: 'Устранение протечек, замена смесителей и труб, установка сантехники. Выезжаю по всей Москве, работаю без выходных.',
    city: 'Москва',
    address: 'Ленинский проспект, 45',
    lat: 55.7014, lng: 37.5731,
    phone: '+7 900 222-33-44',
    whatsapp: '79002223344',
    categorySlug: 'repair',
    services: [
      { name: 'Диагностика и выезд', priceAmount: 100000, priceIsFrom: false },
      { name: 'Замена смесителя', priceAmount: 250000, priceIsFrom: true },
    ],
  },
  {
    slug: 'marina-english',
    cover: 'master-marina',
    displayName: 'Марина Верещагина',
    headline: 'Репетитор английского, подготовка к экзаменам',
    about: 'Готовлю к ОГЭ, ЕГЭ и IELTS. Занятия онлайн и очно. Первый урок — бесплатная диагностика уровня.',
    city: 'Москва',
    address: 'Профсоюзная ул., 12',
    lat: 55.6774, lng: 37.5626,
    telegram: '@marina_english_demo',
    categorySlug: 'tutors',
    services: [
      { name: 'Индивидуальное занятие, 60 мин', priceAmount: 250000, priceIsFrom: false },
      { name: 'Подготовка к IELTS, пакет 10 занятий', priceAmount: 2200000, priceIsFrom: false },
    ],
  },
  {
    slug: 'dmitry-auto',
    cover: 'master-dmitry',
    displayName: 'Дмитрий Орлов',
    headline: 'Автоэлектрик, диагностика любой сложности',
    about: 'Компьютерная диагностика, ремонт проводки, установка сигнализаций. Собственный бокс на юге Москвы.',
    city: 'Москва',
    address: 'Каширское шоссе, 61',
    lat: 55.6146, lng: 37.7134,
    phone: '+7 900 333-44-55',
    categorySlug: 'auto',
    services: [{ name: 'Компьютерная диагностика', priceAmount: 200000, priceIsFrom: false }],
  },
  {
    slug: 'olga-cleaning',
    cover: 'master-olga',
    displayName: 'Ольга Панина',
    headline: 'Генеральная уборка квартир и офисов',
    about: 'Уборка после ремонта, генеральная и поддерживающая. Свои экосредства и оборудование.',
    city: 'Москва',
    address: 'ул. Тверская, 6',
    lat: 55.7601, lng: 37.6110,
    phone: '+7 900 444-55-66',
    whatsapp: '79004445566',
    categorySlug: 'cleaning',
    services: [
      { name: 'Поддерживающая уборка, 1-комн.', priceAmount: 300000, priceIsFrom: true },
      { name: 'Уборка после ремонта, за м²', priceAmount: 15000, priceIsFrom: true },
    ],
  },
];

async function main() {
  console.log('Загружаю категории услуг...');
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...category, kind: 'SERVICE' },
      update: { name: category.name, icon: category.icon, sortOrder: category.sortOrder, kind: 'SERVICE' },
    });
  }
  console.log(`  категорий услуг: ${CATEGORIES.length}`);

  console.log('Загружаю категории товаров...');
  for (const category of PRODUCT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...category, kind: 'PRODUCT' },
      update: { name: category.name, icon: category.icon, sortOrder: category.sortOrder, kind: 'PRODUCT' },
    });
  }
  console.log(`  категорий товаров: ${PRODUCT_CATEGORIES.length}`);

  console.log('Загружаю демо-специалистов...');
  for (const demo of DEMO_SPECIALISTS) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: demo.categorySlug } });
    const { categorySlug, services, cover, ...data } = demo;
    const photo = await placeCover(cover);

    const specialist = await prisma.specialist.upsert({
      where: { slug: demo.slug },
      create: {
        ...data,
        status: 'ACTIVE',
        publishedAt: new Date(),
        ...(photo ? { photoUrl: photo.url, photoKey: photo.key } : {}),
      },
      update: { ...data, status: 'ACTIVE', ...(photo ? { photoUrl: photo.url, photoKey: photo.key } : {}) },
    });

    // Связи и услуги переписываем целиком — так сид остаётся идемпотентным.
    await prisma.specialistCategory.deleteMany({ where: { specialistId: specialist.id } });
    await prisma.specialistCategory.create({
      data: { specialistId: specialist.id, categoryId: category.id },
    });

    await prisma.service.deleteMany({ where: { specialistId: specialist.id } });
    await prisma.service.createMany({
      data: services.map((s, index) => ({ ...s, specialistId: specialist.id, sortOrder: index })),
    });
  }
  console.log(`  специалистов: ${DEMO_SPECIALISTS.length}`);

  console.log('Загружаю демо-объявления...');
  const demoSeller = await prisma.user.upsert({
    where: { telegramId: DEMO_SELLER_TELEGRAM_ID },
    create: { telegramId: DEMO_SELLER_TELEGRAM_ID, firstName: 'Пётр', lastName: 'Демидов' },
    update: {},
  });

  for (const demo of DEMO_LISTINGS) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: demo.categorySlug } });
    const { categorySlug, cover, ...data } = demo;

    const listing = await prisma.listing.upsert({
      where: { slug: demo.slug },
      create: { ...data, userId: demoSeller.id, status: 'ACTIVE', publishedAt: new Date() },
      update: { ...data, status: 'ACTIVE' },
    });

    await prisma.listingCategory.deleteMany({ where: { listingId: listing.id } });
    await prisma.listingCategory.create({
      data: { listingId: listing.id, categoryId: category.id },
    });

    await attachCover(listing.id, cover);
  }
  console.log(`  объявлений: ${DEMO_LISTINGS.length}`);

  console.log('Загружаю демо-запросы...');
  const demoBuyer = await prisma.user.upsert({
    where: { telegramId: DEMO_BUYER_TELEGRAM_ID },
    create: { telegramId: DEMO_BUYER_TELEGRAM_ID, firstName: 'Мария', lastName: 'Кузнецова' },
    update: {},
  });

  for (const demo of DEMO_WANTED) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: demo.categorySlug } });
    const { categorySlug, cover, ...data } = demo;

    const wanted = await prisma.listing.upsert({
      where: { slug: demo.slug },
      create: { ...data, kind: 'BUY', userId: demoBuyer.id, status: 'ACTIVE', publishedAt: new Date() },
      update: { ...data, kind: 'BUY', status: 'ACTIVE' },
    });

    await prisma.listingCategory.deleteMany({ where: { listingId: wanted.id } });
    await prisma.listingCategory.create({
      data: { listingId: wanted.id, categoryId: category.id },
    });

    await attachCover(wanted.id, cover);
  }
  console.log(`  запросов: ${DEMO_WANTED.length}`);

  if (adminTelegramIds.length > 0) {
    console.log('Назначаю администраторов...');
    for (const telegramId of adminTelegramIds) {
      // Пользователь появится сам при первом входе; если его ещё нет — создаём заготовку.
      await prisma.user.upsert({
        where: { telegramId },
        create: { telegramId, firstName: 'Администратор', role: 'ADMIN' },
        update: { role: 'ADMIN' },
      });
      console.log(`  ADMIN: ${telegramId}`);
    }
  } else {
    console.warn('  ADMIN_TELEGRAM_IDS не задан — администраторы не назначены.');
  }

  console.log('Готово.');
}

main()
  .catch((error) => {
    console.error('Сид завершился ошибкой:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
