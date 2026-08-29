/**
 * Разбор параметра запуска, с которым бот открывает Mini App.
 *
 * Telegram передаёт значение из ссылки `?startapp=<param>` или из кнопки
 * `web_app` с `?tgWebAppStartParam=<param>`. Бот пользуется этим, чтобы
 * открыть приложение не на главной, а сразу на нужном экране: карточке
 * специалиста из «поделиться», витрине объявлений, форме анкеты.
 *
 * Без разбора параметра ссылка вида «открываю профиль мастера» вела бы
 * в общий каталог — обещание в сообщении бота не совпадало бы с тем,
 * что человек увидит.
 */

/** Разрешённые адреса. Произвольный путь из параметра брать нельзя: он приходит извне. */
const ROUTES: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^specialist_([a-z0-9-]{1,64})$/i, (m) => `/specialist/${m[1]}`],
  [/^listing_([a-z0-9-]{1,64})$/i, (m) => `/listing/${m[1]}`],
  [/^catalog$/i, () => '/'],
  [/^market$/i, () => '/market'],
  [/^wanted$/i, () => '/wanted'],
  [/^buy$/i, () => '/market/browse'],
  [/^sell$/i, () => '/market/sell'],
  [/^apply$/i, () => '/profile/my-card'],
  [/^chats$/i, () => '/chats'],
];

function resolve(): string | null {
  const raw =
    window.Telegram?.WebApp?.initDataUnsafe?.start_param ??
    new URLSearchParams(window.location.search).get('tgWebAppStartParam');

  if (!raw) return null;

  for (const [pattern, build] of ROUTES) {
    const match = raw.match(pattern);
    if (match) return build(match);
  }

  return null;
}

/**
 * Значение считается один раз за запуск и запоминается: параметр остаётся
 * в адресной строке, и без запоминания приложение возвращалось бы на этот
 * экран после каждого перехода.
 */
let resolved: string | null | undefined;

export function startRoute(): string | null {
  if (resolved === undefined) resolved = resolve();
  return resolved;
}

/** Параметр использован — дальше приложение живёт обычной навигацией. */
export function clearStartRoute(): void {
  resolved = null;
}
