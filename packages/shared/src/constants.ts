/** Значения, на которые опираются и API, и фронтенд. */

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Максимальная длина текста отзыва. Ограничение и в форме, и на сервере. */
export const REVIEW_TEXT_MAX = 2000;

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

/** Радиусы для кнопки «Найти рядом», км. */
export const NEARBY_RADII_KM = [1, 3, 5, 10, 25, 50] as const;
export const NEARBY_RADIUS_DEFAULT_KM = 10;

/** Сколько времени действует JWT, выданный по Telegram initData. */
export const AUTH_TOKEN_TTL = '7d';

/**
 * Максимальный возраст initData, который мы принимаем.
 * Telegram рекомендует не доверять данным старше суток — это защищает
 * от повторного использования перехваченной строки.
 */
export const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
