import { openExternal, tg } from '../lib/telegram';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

/**
 * Поделиться карточкой специалиста.
 *
 * Ссылка ведёт не на веб-страницу, а на бота с параметром: получатель
 * откроет её в Telegram и попадёт сразу в нужный профиль внутри Mini App.
 * Обработчик такой ссылки в боте уже есть — оставалось дать способ
 * её сгенерировать.
 */
export function ShareButton({ slug, displayName }: { slug: string; displayName: string }) {
  if (!BOT_USERNAME) return null;

  const deepLink = `https://t.me/${BOT_USERNAME}?start=specialist_${slug}`;
  const text = `${displayName} — в каталоге специалистов`;

  const share = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`;
    const app = tg();
    // openTelegramLink открывает диалог выбора чата внутри клиента,
    // не выбрасывая пользователя в браузер.
    if (app) app.openTelegramLink(url);
    else openExternal(url);
  };

  return (
    <button type="button" className="button button--secondary" onClick={share}>
      ↗ Поделиться карточкой
    </button>
  );
}
