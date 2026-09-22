/**
 * Дерево категорий: разделы и подкатегории.
 *
 * Два уровня, не больше. Третий уровень честно описывает мир вещей,
 * но требует, чтобы в нём было что показывать: на молодой площадке
 * нижние ветки стоят пустыми, и человек, дойдя до «Ноутбуки → Игровые»,
 * видит ноль объявлений там, где рядом их десяток. Раздел и подкатегория
 * дают ту же подробность выбора при размещении и не обещают глубины,
 * которой пока нет.
 *
 * Слаги уже существующих категорий сохранены, даже когда категория
 * переехала вглубь дерева: к ним привязаны выложенные объявления и
 * анкеты, и смена слага порвала бы эти связи.
 *
 * Иконка задана только разделам. Подкатегории показываются строкой
 * или чипом внутри раздела, и ряд из двадцати эмодзи там превращается
 * в рябь, мешающую прочитать сами названия.
 */

export type CategoryNode = {
  slug: string;
  name: string;
  icon?: string;
  children?: { slug: string; name: string }[];
};

/** Товары. Верхний уровень крупный, как в больших досках объявлений. */
export const PRODUCT_TREE: CategoryNode[] = [
  {
    slug: 'transport',
    name: 'Транспорт',
    icon: '🚗',
    children: [
      { slug: 'transport-cars', name: 'Автомобили' },
      { slug: 'transport-moto', name: 'Мотоциклы и мототехника' },
      { slug: 'transport-trucks', name: 'Грузовики и спецтехника' },
      { slug: 'transport-water', name: 'Водный транспорт' },
      { slug: 'transport-bikes', name: 'Велосипеды и самокаты' },
      { slug: 'transport-trailers', name: 'Прицепы и дома на колёсах' },
    ],
  },
  {
    slug: 'realty',
    name: 'Недвижимость',
    icon: '🏢',
    children: [
      { slug: 'realty-flats', name: 'Квартиры' },
      { slug: 'realty-rooms', name: 'Комнаты и доли' },
      { slug: 'realty-houses', name: 'Дома, дачи, коттеджи' },
      { slug: 'realty-land', name: 'Земельные участки' },
      { slug: 'realty-garages', name: 'Гаражи и машиноместа' },
      { slug: 'realty-commercial', name: 'Коммерческая недвижимость' },
      { slug: 'realty-rent-daily', name: 'Посуточная аренда' },
    ],
  },
  {
    slug: 'electronics',
    name: 'Электроника',
    icon: '📱',
    children: [
      { slug: 'electronics-phones', name: 'Телефоны' },
      // Комплектующие и периферия — внутри, первым шагом «Тип»: отдельная
      // полка рядом с компьютерами путала — видеокарту искали в обеих.
      { slug: 'electronics-computers', name: 'Ноутбуки, компьютеры и комплектующие' },
      { slug: 'electronics-tablets', name: 'Планшеты и электронные книги' },
      { slug: 'electronics-tv', name: 'Телевизоры и проекторы' },
      { slug: 'electronics-audio', name: 'Аудио и наушники' },
      { slug: 'electronics-photo', name: 'Фото и видео' },
      { slug: 'electronics-consoles', name: 'Игровые приставки' },
      { slug: 'electronics-office', name: 'Оргтехника и расходники' },
      { slug: 'electronics-smart', name: 'Умный дом и гаджеты' },
    ],
  },
  {
    slug: 'home',
    name: 'Для дома и дачи',
    icon: '🏠',
    children: [
      { slug: 'furniture', name: 'Мебель' },
      { slug: 'home-appliances', name: 'Бытовая техника' },
      { slug: 'home-kitchen', name: 'Посуда и кухня' },
      { slug: 'home-textile', name: 'Текстиль и интерьер' },
      { slug: 'home-light', name: 'Освещение' },
      { slug: 'home-repair', name: 'Ремонт и стройматериалы' },
      { slug: 'tools', name: 'Инструменты' },
      { slug: 'home-garden', name: 'Сад и огород' },
      { slug: 'home-plants', name: 'Растения' },
    ],
  },
  {
    slug: 'personal',
    name: 'Личные вещи',
    icon: '👜',
    children: [
      { slug: 'clothes', name: 'Одежда и обувь' },
      { slug: 'personal-bags', name: 'Сумки и аксессуары' },
      { slug: 'personal-watches', name: 'Часы и украшения' },
      { slug: 'kids', name: 'Детское' },
      { slug: 'personal-kids-clothes', name: 'Детская одежда и обувь' },
      { slug: 'personal-beauty', name: 'Красота и здоровье' },
    ],
  },
  {
    slug: 'hobby',
    name: 'Хобби и отдых',
    icon: '🎸',
    children: [
      { slug: 'sport', name: 'Спорт и тренажёры' },
      { slug: 'hobby-music', name: 'Музыкальные инструменты' },
      { slug: 'hobby-books', name: 'Книги и журналы' },
      { slug: 'hobby-collect', name: 'Коллекционирование' },
      { slug: 'hobby-games', name: 'Настольные игры' },
      { slug: 'hobby-tourism', name: 'Туризм и рыбалка' },
      { slug: 'hobby-art', name: 'Творчество и рукоделие' },
      { slug: 'hobby-tickets', name: 'Билеты и путешествия' },
    ],
  },
  {
    slug: 'animals',
    name: 'Животные',
    icon: '🐾',
    children: [
      { slug: 'animals-dogs', name: 'Собаки' },
      { slug: 'animals-cats', name: 'Кошки' },
      { slug: 'animals-birds', name: 'Птицы' },
      { slug: 'animals-aquarium', name: 'Аквариум' },
      { slug: 'animals-rodents', name: 'Грызуны и кролики' },
      { slug: 'animals-goods', name: 'Товары для животных' },
    ],
  },
  {
    slug: 'parts',
    name: 'Запчасти и аксессуары',
    icon: '🔩',
    children: [
      { slug: 'auto-parts', name: 'Запчасти для авто' },
      { slug: 'parts-tyres', name: 'Шины и диски' },
      { slug: 'parts-accessories', name: 'Аксессуары для авто' },
      { slug: 'parts-audio', name: 'Автоэлектроника и звук' },
      { slug: 'parts-moto', name: 'Мотозапчасти и экипировка' },
      { slug: 'parts-tools', name: 'Инструменты для гаража' },
    ],
  },
  {
    slug: 'digital',
    name: 'Цифровые товары',
    icon: '💳',
    children: [
      { slug: 'gaming', name: 'Игры и аккаунты' },
      { slug: 'digital-subscriptions', name: 'Подписки и сервисы' },
      { slug: 'digital-cards', name: 'Карты оплаты и коды' },
      { slug: 'digital-items', name: 'Внутриигровые предметы' },
      { slug: 'digital-software', name: 'Программы и лицензии' },
      { slug: 'digital-content', name: 'Курсы и цифровой контент' },
    ],
  },
  {
    slug: 'business',
    name: 'Бизнес и оборудование',
    icon: '📦',
    children: [
      { slug: 'business-equipment', name: 'Оборудование' },
      { slug: 'business-trade', name: 'Торговое оборудование' },
      { slug: 'business-food', name: 'Для общепита' },
      { slug: 'business-materials', name: 'Сырьё и материалы' },
      { slug: 'business-ready', name: 'Готовый бизнес' },
    ],
  },
  {
    slug: 'other-goods',
    name: 'Другое',
    icon: '🧩',
    children: [],
  },
];

/**
 * Услуги. Разделы те же, что были: к ним уже привязаны анкеты мастеров,
 * и человек, нашедший себя в «Красоте», не должен искать себя заново.
 * Новое здесь — второй уровень, где мастер называет, что именно делает.
 */
export const SERVICE_TREE: CategoryNode[] = [
  {
    slug: 'beauty',
    name: 'Красота',
    icon: '💅',
    children: [
      { slug: 'beauty-nails', name: 'Маникюр и педикюр' },
      { slug: 'beauty-hair', name: 'Парикмахеры' },
      { slug: 'beauty-brows', name: 'Брови и ресницы' },
      { slug: 'beauty-makeup', name: 'Макияж' },
      { slug: 'beauty-cosmetology', name: 'Косметология' },
      { slug: 'beauty-massage', name: 'Массаж и СПА' },
      { slug: 'beauty-epilation', name: 'Эпиляция' },
      { slug: 'beauty-tattoo', name: 'Тату и пирсинг' },
    ],
  },
  {
    slug: 'repair',
    name: 'Ремонт и стройка',
    icon: '🔨',
    children: [
      { slug: 'repair-plumbing', name: 'Сантехника' },
      { slug: 'repair-electric', name: 'Электрика' },
      { slug: 'repair-finishing', name: 'Отделка и ремонт под ключ' },
      { slug: 'repair-furniture', name: 'Сборка мебели' },
      { slug: 'repair-windows', name: 'Окна и двери' },
      { slug: 'repair-handyman', name: 'Мастер на час' },
      { slug: 'repair-build', name: 'Строительство и кровля' },
      { slug: 'repair-welding', name: 'Сварка и металл' },
    ],
  },
  {
    slug: 'auto',
    name: 'Авто',
    icon: '🚗',
    children: [
      { slug: 'auto-service', name: 'Автосервис и диагностика' },
      { slug: 'auto-tyres', name: 'Шиномонтаж' },
      { slug: 'auto-body', name: 'Кузовной ремонт и покраска' },
      { slug: 'auto-wash', name: 'Мойка и химчистка салона' },
      { slug: 'auto-tow', name: 'Эвакуатор и техпомощь' },
      { slug: 'auto-tuning', name: 'Тюнинг и оклейка' },
      { slug: 'auto-select', name: 'Подбор и проверка авто' },
    ],
  },
  {
    slug: 'health',
    name: 'Здоровье',
    icon: '🩺',
    children: [
      { slug: 'health-doctors', name: 'Врачи и медсёстры' },
      { slug: 'health-dental', name: 'Стоматология' },
      { slug: 'health-psychology', name: 'Психологи' },
      { slug: 'health-nutrition', name: 'Диетологи и питание' },
      { slug: 'health-fitness', name: 'Тренеры и фитнес' },
      { slug: 'health-care', name: 'Уход и сиделки' },
    ],
  },
  {
    slug: 'tutors',
    name: 'Репетиторы',
    icon: '📚',
    children: [
      { slug: 'tutors-school', name: 'Школьные предметы' },
      { slug: 'tutors-languages', name: 'Иностранные языки' },
      { slug: 'tutors-exams', name: 'Подготовка к ЕГЭ и ОГЭ' },
      { slug: 'tutors-it', name: 'Программирование' },
      { slug: 'tutors-music', name: 'Музыка и вокал' },
      { slug: 'tutors-kids', name: 'Дошкольники' },
    ],
  },
  {
    slug: 'cleaning',
    name: 'Уборка',
    icon: '🧹',
    children: [
      { slug: 'cleaning-flat', name: 'Уборка квартир' },
      { slug: 'cleaning-after-repair', name: 'После ремонта' },
      { slug: 'cleaning-chem', name: 'Химчистка мебели и ковров' },
      { slug: 'cleaning-windows', name: 'Мытьё окон' },
      { slug: 'cleaning-office', name: 'Уборка офисов' },
      { slug: 'cleaning-laundry', name: 'Стирка и глажка' },
    ],
  },
  {
    slug: 'payments',
    name: 'Пополнение и оплата',
    icon: '💳',
    children: [
      { slug: 'payments-foreign', name: 'Зарубежные сервисы' },
      { slug: 'payments-games', name: 'Игры и приложения' },
      { slug: 'payments-subscriptions', name: 'Подписки' },
      { slug: 'payments-purchase', name: 'Выкуп и доставка товаров' },
    ],
  },
  {
    slug: 'delivery',
    name: 'Перевозки и грузчики',
    icon: '🚚',
    children: [
      { slug: 'delivery-moving', name: 'Переезды' },
      { slug: 'delivery-loaders', name: 'Грузчики' },
      { slug: 'delivery-cargo', name: 'Грузоперевозки' },
      { slug: 'delivery-courier', name: 'Курьеры' },
      { slug: 'delivery-trash', name: 'Вывоз мусора' },
    ],
  },
  {
    slug: 'legal',
    name: 'Документы и право',
    icon: '📄',
    children: [
      { slug: 'legal-lawyer', name: 'Юристы и адвокаты' },
      { slug: 'legal-accounting', name: 'Бухгалтерия и налоги' },
      { slug: 'legal-realty', name: 'Сделки с недвижимостью' },
      { slug: 'legal-translate', name: 'Переводы документов' },
      { slug: 'legal-registration', name: 'Регистрация бизнеса' },
    ],
  },
  {
    slug: 'photo',
    name: 'Фото и видео',
    icon: '📷',
    children: [
      { slug: 'photo-shoot', name: 'Фотосъёмка' },
      { slug: 'photo-video', name: 'Видеосъёмка и монтаж' },
      { slug: 'photo-retouch', name: 'Обработка и ретушь' },
      { slug: 'photo-drone', name: 'Съёмка с дрона' },
      { slug: 'photo-studio', name: 'Аренда студии' },
    ],
  },
  {
    slug: 'it',
    name: 'IT и техника',
    icon: '💻',
    children: [
      { slug: 'it-computers', name: 'Ремонт компьютеров' },
      { slug: 'it-phones', name: 'Ремонт телефонов' },
      { slug: 'it-appliances', name: 'Ремонт бытовой техники' },
      { slug: 'it-web', name: 'Сайты и приложения' },
      { slug: 'it-design', name: 'Дизайн и графика' },
      { slug: 'it-marketing', name: 'Реклама и продвижение' },
      { slug: 'it-networks', name: 'Сети и видеонаблюдение' },
    ],
  },
  {
    slug: 'pets',
    name: 'Животные',
    icon: '🐾',
    children: [
      { slug: 'pets-grooming', name: 'Груминг' },
      { slug: 'pets-vet', name: 'Ветеринары' },
      { slug: 'pets-walking', name: 'Выгул и передержка' },
      { slug: 'pets-training', name: 'Дрессировка' },
    ],
  },
  {
    slug: 'events',
    name: 'Праздники',
    icon: '🎉',
    children: [
      { slug: 'events-host', name: 'Ведущие и тамада' },
      { slug: 'events-music', name: 'Музыканты и диджеи' },
      { slug: 'events-animators', name: 'Аниматоры' },
      { slug: 'events-decor', name: 'Оформление и шары' },
      { slug: 'events-catering', name: 'Кейтеринг и торты' },
      { slug: 'events-rent', name: 'Аренда оборудования' },
    ],
  },
  {
    slug: 'other-services',
    name: 'Другое',
    icon: '🧩',
    children: [],
  },
];
