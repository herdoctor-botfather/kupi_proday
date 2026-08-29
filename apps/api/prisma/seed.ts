/**
 * Наполнение базы стартовыми данными.
 * Запуск: npm run db:seed -w @app/api
 *
 * Скрипт идемпотентен — его можно выполнять повторно.
 */
import { PrismaClient } from '@prisma/client';
import { loadEnvFile } from '../src/load-env';

loadEnvFile();

const prisma = new PrismaClient();

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

const DEMO_LISTINGS = [
  {
    slug: 'iphone-13-128-gb-demo',
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
    title: 'Гитара акустическая',
    description: 'Дредноут, верхняя дека — ель. Новые струны, чехол в комплекте. Играть учился, не пошло.',
    priceAmount: 900000,
    condition: 'USED' as const,
    city: 'Санкт-Петербург',
    isNegotiable: true,
    categorySlug: 'hobby',
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
    const { categorySlug, services, ...data } = demo;

    const specialist = await prisma.specialist.upsert({
      where: { slug: demo.slug },
      create: { ...data, status: 'ACTIVE', publishedAt: new Date() },
      update: { ...data, status: 'ACTIVE' },
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
    const { categorySlug, ...data } = demo;

    const listing = await prisma.listing.upsert({
      where: { slug: demo.slug },
      create: { ...data, userId: demoSeller.id, status: 'ACTIVE', publishedAt: new Date() },
      update: { ...data, status: 'ACTIVE' },
    });

    await prisma.listingCategory.deleteMany({ where: { listingId: listing.id } });
    await prisma.listingCategory.create({
      data: { listingId: listing.id, categoryId: category.id },
    });
  }
  console.log(`  объявлений: ${DEMO_LISTINGS.length}`);

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
