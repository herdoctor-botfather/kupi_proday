import type { CategoryNode } from './category-tree';
import type { AttributeSpec } from './category-attributes';

/**
 * Отрасли и должности для вакансий и резюме.
 *
 * Разделы названы по отраслям — так же, как на больших досках: человек,
 * искавший работу раньше, узнаёт привычные слова и не тратит время на
 * разгадывание. Внутри отрасли стоят конкретные должности, потому что
 * ищут всё-таки не «производство», а «сварщика».
 *
 * Одно дерево на вакансии и резюме: должность у них общая, разница
 * только в том, с какой стороны человек пришёл. Работодатель выбирает
 * «нужен повар», соискатель — «я повар», и они встречаются в одной полке.
 */
export const CAREER_TREE: CategoryNode[] = [
  {
    slug: 'job-sales',
    name: 'Продажи и торговля',
    icon: '🛍',
    children: [
      { slug: 'job-sales-cashier', name: 'Продавец, кассир' },
      { slug: 'job-sales-consultant', name: 'Продавец-консультант' },
      { slug: 'job-sales-manager', name: 'Менеджер по продажам' },
      { slug: 'job-sales-merch', name: 'Мерчандайзер, выкладка' },
      { slug: 'job-sales-director', name: 'Директор магазина' },
      { slug: 'job-sales-promo', name: 'Промоутер' },
    ],
  },
  {
    slug: 'job-transport',
    name: 'Транспорт и логистика',
    icon: '🚚',
    children: [
      { slug: 'job-transport-courier', name: 'Курьер' },
      { slug: 'job-transport-driver', name: 'Водитель категории B' },
      { slug: 'job-transport-truck', name: 'Водитель грузовика' },
      { slug: 'job-transport-taxi', name: 'Водитель такси' },
      { slug: 'job-transport-loader', name: 'Грузчик' },
      { slug: 'job-transport-storeman', name: 'Кладовщик, комплектовщик' },
      { slug: 'job-transport-logist', name: 'Логист, диспетчер' },
      { slug: 'job-transport-forklift', name: 'Водитель погрузчика' },
    ],
  },
  {
    slug: 'job-build',
    name: 'Строительство и ремонт',
    icon: '🔨',
    children: [
      { slug: 'job-build-worker', name: 'Разнорабочий' },
      { slug: 'job-build-finish', name: 'Отделочник, маляр' },
      { slug: 'job-build-plumber', name: 'Сантехник' },
      { slug: 'job-build-electric', name: 'Электрик' },
      { slug: 'job-build-welder', name: 'Сварщик' },
      { slug: 'job-build-carpenter', name: 'Плотник, столяр' },
      { slug: 'job-build-master', name: 'Прораб, бригадир' },
      { slug: 'job-build-crane', name: 'Машинист спецтехники' },
    ],
  },
  {
    slug: 'job-production',
    name: 'Производство',
    icon: '🏭',
    children: [
      { slug: 'job-production-worker', name: 'Рабочий на производство' },
      { slug: 'job-production-operator', name: 'Оператор станка' },
      { slug: 'job-production-turner', name: 'Токарь, фрезеровщик' },
      { slug: 'job-production-packer', name: 'Упаковщик, фасовщик' },
      { slug: 'job-production-tech', name: 'Технолог, мастер цеха' },
      { slug: 'job-production-qc', name: 'Контролёр качества' },
    ],
  },
  {
    slug: 'job-food',
    name: 'Кафе и рестораны',
    icon: '🍳',
    children: [
      { slug: 'job-food-cook', name: 'Повар' },
      { slug: 'job-food-helper', name: 'Помощник повара, кухонный работник' },
      { slug: 'job-food-waiter', name: 'Официант' },
      { slug: 'job-food-barista', name: 'Бариста, бармен' },
      { slug: 'job-food-baker', name: 'Пекарь, кондитер' },
      { slug: 'job-food-dish', name: 'Посудомойщик' },
      { slug: 'job-food-admin', name: 'Администратор зала' },
    ],
  },
  {
    slug: 'job-service',
    name: 'Услуги и сервис',
    icon: '🧹',
    children: [
      { slug: 'job-service-cleaner', name: 'Уборщик, клинер' },
      { slug: 'job-service-janitor', name: 'Дворник' },
      { slug: 'job-service-laundry', name: 'Прачечная, химчистка' },
      { slug: 'job-service-repair', name: 'Мастер по ремонту техники' },
      { slug: 'job-service-hotel', name: 'Горничная, персонал гостиницы' },
      { slug: 'job-service-handyman', name: 'Разнорабочий по хозяйству' },
    ],
  },
  {
    slug: 'job-beauty',
    name: 'Красота и спорт',
    icon: '💅',
    children: [
      { slug: 'job-beauty-hair', name: 'Парикмахер' },
      { slug: 'job-beauty-nails', name: 'Мастер маникюра' },
      { slug: 'job-beauty-cosmetology', name: 'Косметолог' },
      { slug: 'job-beauty-massage', name: 'Массажист' },
      { slug: 'job-beauty-admin', name: 'Администратор салона' },
      { slug: 'job-beauty-coach', name: 'Тренер, инструктор' },
    ],
  },
  {
    slug: 'job-auto',
    name: 'Автобизнес',
    icon: '🚗',
    children: [
      { slug: 'job-auto-mechanic', name: 'Автомеханик, автослесарь' },
      { slug: 'job-auto-electric', name: 'Автоэлектрик' },
      { slug: 'job-auto-body', name: 'Кузовщик, маляр' },
      { slug: 'job-auto-tyres', name: 'Шиномонтажник' },
      { slug: 'job-auto-wash', name: 'Мойщик автомобилей' },
      { slug: 'job-auto-sales', name: 'Менеджер автосалона' },
    ],
  },
  {
    slug: 'job-medicine',
    name: 'Медицина и уход',
    icon: '🩺',
    children: [
      { slug: 'job-medicine-doctor', name: 'Врач' },
      { slug: 'job-medicine-nurse', name: 'Медсестра, медбрат' },
      { slug: 'job-medicine-pharmacy', name: 'Фармацевт, провизор' },
      { slug: 'job-medicine-care', name: 'Сиделка' },
      { slug: 'job-medicine-vet', name: 'Ветеринар' },
      { slug: 'job-medicine-lab', name: 'Лаборант' },
    ],
  },
  {
    slug: 'job-education',
    name: 'Образование и дети',
    icon: '📚',
    children: [
      { slug: 'job-education-teacher', name: 'Учитель, преподаватель' },
      { slug: 'job-education-tutor', name: 'Репетитор' },
      { slug: 'job-education-nanny', name: 'Няня' },
      { slug: 'job-education-kinder', name: 'Воспитатель' },
      { slug: 'job-education-coach', name: 'Педагог допобразования' },
    ],
  },
  {
    slug: 'job-office',
    name: 'Офис и финансы',
    icon: '💼',
    children: [
      { slug: 'job-office-admin', name: 'Администратор, секретарь' },
      { slug: 'job-office-accountant', name: 'Бухгалтер' },
      { slug: 'job-office-hr', name: 'Кадровик, HR' },
      { slug: 'job-office-lawyer', name: 'Юрист' },
      { slug: 'job-office-analyst', name: 'Экономист, аналитик' },
      { slug: 'job-office-support', name: 'Оператор call-центра' },
    ],
  },
  {
    slug: 'job-it',
    name: 'IT, интернет и дизайн',
    icon: '💻',
    children: [
      { slug: 'job-it-dev', name: 'Программист' },
      { slug: 'job-it-design', name: 'Дизайнер' },
      { slug: 'job-it-smm', name: 'SMM, маркетолог' },
      { slug: 'job-it-content', name: 'Копирайтер, контент' },
      { slug: 'job-it-support', name: 'Системный администратор, техподдержка' },
      { slug: 'job-it-video', name: 'Монтажёр, видеограф' },
    ],
  },
  {
    slug: 'job-security',
    name: 'Охрана и безопасность',
    icon: '🛡',
    children: [
      { slug: 'job-security-guard', name: 'Охранник' },
      { slug: 'job-security-watch', name: 'Сторож, вахтёр' },
      { slug: 'job-security-controller', name: 'Контролёр торгового зала' },
    ],
  },
  {
    slug: 'job-agro',
    name: 'Сельское хозяйство',
    icon: '🌾',
    children: [
      { slug: 'job-agro-worker', name: 'Рабочий в поле, теплицу' },
      { slug: 'job-agro-tractor', name: 'Тракторист, комбайнёр' },
      { slug: 'job-agro-farm', name: 'Животновод, птичник' },
      { slug: 'job-agro-agronom', name: 'Агроном, зоотехник' },
    ],
  },
  {
    slug: 'job-parttime',
    name: 'Подработка и разовые задания',
    icon: '⚡️',
    children: [
      { slug: 'job-parttime-day', name: 'Работа на день' },
      { slug: 'job-parttime-shift', name: 'Разовая смена' },
      { slug: 'job-parttime-remote', name: 'Удалённая подработка' },
      { slug: 'job-parttime-student', name: 'Для студентов и подростков' },
      { slug: 'job-parttime-event', name: 'Помощь на мероприятии' },
    ],
  },
  {
    slug: 'job-other',
    name: 'Другое',
    icon: '🧩',
    children: [],
  },
];

/**
 * Что спрашивать в вакансии и резюме.
 *
 * Оплата — вилкой: «от» берётся из цены объявления, «до» и период
 * живут здесь. Одна сумма без периода ничего не значит: «3000» это
 * и дневная смена курьера, и месяц подработки школьника.
 */
export const CAREER_ATTRIBUTES: AttributeSpec[] = [
  {
    slug: 'salaryPeriod',
    name: 'Оплата за',
    options: ['Месяц', 'Смену', 'Час', 'Проект', 'Сдельно'],
    required: true,
  },
  { slug: 'salaryTo', name: 'Оплата до', kind: 'NUMBER', unit: '₽' },
  {
    slug: 'schedule',
    name: 'График',
    options: ['Полный день', 'Сменный график', 'Гибкий график', 'Подработка', 'Вахта', 'Удалённо'],
    required: true,
    isStep: true,
  },
  {
    slug: 'experience',
    name: 'Опыт работы',
    options: ['Без опыта', 'До года', 'От 1 до 3 лет', 'Больше 3 лет'],
    isStep: true,
  },
  {
    slug: 'employment',
    name: 'Оформление',
    options: ['По трудовой книжке', 'Договор ГПХ', 'Самозанятость', 'Без оформления', 'Обсуждается'],
  },
];
