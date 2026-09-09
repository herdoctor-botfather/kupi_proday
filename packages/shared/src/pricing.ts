/**
 * Тарифы площадки.
 *
 * Все цены — в Telegram Stars, целыми числами: дробных звёзд не бывает.
 * Файл один на сервер, бота и приложение намеренно: цена, показанная
 * человеку на кнопке, и цена, на которую выставлен счёт, обязаны совпадать
 * до звезды, иначе оплата пройдёт не за то, что обещали.
 *
 * Что монетизируется и почему именно так:
 *
 *   • Специалисты платят подписку. Анкету можно завести бесплатно, но
 *     показывается она в каталоге и на карте, только пока подписка жива.
 *     Это ровно та ценность, за которой специалист сюда и приходит.
 *
 *   • Продавцы платят за объявления сверх бесплатного месячного лимита
 *     и за продвижение. Первые объявления бесплатны намеренно: пустая
 *     барахолка не стоит денег, и брать за вход в неё — верный способ
 *     остаться без товара.
 *
 *   • Запросы на покупку бесплатны. Это сторона спроса: она делает
 *     площадку осмысленной для продавцов, и облагать её платой — значит
 *     рубить сук. Когда спроса станет много, здесь появится цена.
 */

/** Валюта счетов Telegram Stars. Другой у них нет. */
export const STARS_CURRENCY = 'XTR';

/** Тарифы подписки специалиста. */
export const SPECIALIST_PLANS = {
  month: { days: 30, stars: 199, title: 'Месяц' },
  quarter: { days: 90, stars: 499, title: 'Три месяца' },
  year: { days: 365, stars: 1490, title: 'Год' },
} as const;

export type SpecialistPlan = keyof typeof SPECIALIST_PLANS;

export const SPECIALIST_PLAN_IDS = Object.keys(SPECIALIST_PLANS) as SpecialistPlan[];

export const isSpecialistPlan = (value: string): value is SpecialistPlan =>
  Object.prototype.hasOwnProperty.call(SPECIALIST_PLANS, value);

/**
 * Сколько объявлений в календарном месяце можно разместить бесплатно.
 * Считаются только объявления о продаже: запросы на покупку не платные
 * и в лимит не входят.
 */
export const LISTING_FREE_PER_MONTH = 3;

/** Цена одного объявления сверх бесплатного лимита. */
export const LISTING_EXTRA_STARS = 29;

/** Продвижение объявления: подъём в списке на срок. */
export const LISTING_PROMOTIONS = {
  week: { days: 7, stars: 79, title: 'Неделя в начале списка' },
  month: { days: 30, stars: 249, title: 'Месяц в начале списка' },
} as const;

export type ListingPromotion = keyof typeof LISTING_PROMOTIONS;

export const LISTING_PROMOTION_IDS = Object.keys(LISTING_PROMOTIONS) as ListingPromotion[];

export const isListingPromotion = (value: string): value is ListingPromotion =>
  Object.prototype.hasOwnProperty.call(LISTING_PROMOTIONS, value);

/**
 * Наборы для пополнения кошелька.
 *
 * Суммы фиксированные, а не произвольные: произвольная сумма заставляет
 * человека решать лишнюю задачу — «сколько мне надо?» — на которую он
 * не знает ответа, пока не изучил цены. Готовые наборы отвечают на неё
 * за него, и каждый привязан к тому, что на него можно купить.
 */
export const TOPUP_PACKS = [
  { stars: 199, hint: 'Месяц показа анкеты' },
  { stars: 499, hint: 'Три месяца показа' },
  { stars: 1000, hint: 'С запасом на продвижение' },
  { stars: 2500, hint: 'Год показа и объявления' },
] as const;

export const TOPUP_STARS = TOPUP_PACKS.map((pack) => pack.stars);

/**
 * Границы произвольной суммы.
 *
 * Нижняя отсекает пополнения, на которые всё равно ничего не купить:
 * человек отдал бы звёзды и остался ни с чем. Верхняя — защита от
 * опечатки в лишний ноль, а заодно от суммы, которую Telegram может
 * не пропустить: за его ограничениями мы не следим, а своё держим
 * заведомо ниже.
 */
export const TOPUP_MIN_STARS = 50;
export const TOPUP_MAX_STARS = 10_000;

/**
 * Сумма пополнения допустима.
 *
 * Готовые наборы — подсказка, а не ограничение: свою сумму назвать можно,
 * но целым числом и в разумных границах. Проверка одна на приложение
 * и сервер, чтобы поле ввода и счёт не расходились в том, что считать
 * правильным.
 */
export const isTopupAmount = (value: number): boolean =>
  Number.isInteger(value) && value >= TOPUP_MIN_STARS && value <= TOPUP_MAX_STARS;

/** За что именно платят. Хранится в базе и разбирается при подтверждении оплаты. */
export const PAYMENT_PURPOSES = [
  'SPECIALIST_SUBSCRIPTION',
  'LISTING_SLOT',
  'LISTING_PROMOTION',
  'WALLET_TOPUP',
] as const;

export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];
