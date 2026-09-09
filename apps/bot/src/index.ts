import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';
import { currentMiniAppUrl } from './miniapp-url';
import { fetchCounts } from './stats';
import * as messages from './messages';
import { replyWithBanner } from './banner';
import { registerPayments } from './payments';

/**
 * Бот-обёртка вокруг Mini App.
 *
 * Вся содержательная работа происходит внутри Mini App; задача бота —
 * дать точку входа, отвечать на команды и обрабатывать deep link вида
 * https://t.me/имя_бота?start=specialist_адрес-карточки, по которому
 * пользователь попадает сразу в нужный профиль.
 */

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

/**
 * Отпечаток запуска бота.
 *
 * Встроенный браузер Telegram держит открытую однажды страницу у себя
 * и при следующем открытии показывает её же — заголовки кэширования он
 * при этом уважает не всегда, и после выкладки человек видит прошлую
 * версию приложения. Уговорить его нельзя, зато можно менять адрес:
 * для другого адреса подставить нечего.
 *
 * Бот перезапускается при каждой выкладке, поэтому отметка времени
 * старта меняется ровно тогда, когда меняется и само приложение.
 */
const BUILD_STAMP = Math.floor(Date.now() / 1000).toString(36);

/** Адрес Mini App с параметром запуска: по нему приложение откроет нужный экран. */
const appUrl = (startParam?: string): string => {
  const base = currentMiniAppUrl();
  const params = new URLSearchParams({ v: BUILD_STAMP });
  if (startParam) params.set('tgWebAppStartParam', startParam);
  return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
};

/**
 * Три двери вместо одной.
 *
 * Раньше кнопка была одна — «Открыть каталог», и человек попадал на экран
 * выбора роли, ничего ещё не зная о разделах. Разложив вход по кнопкам,
 * мы заодно рассказываем, что здесь есть: заказ услуг, барахолка и своя
 * анкета. Выбор из бота приложение принимает как ответ на вопрос о роли
 * и экран выбора не показывает.
 */
const mainKeyboard = () =>
  new InlineKeyboard()
    .webApp('🔎 Найти исполнителя', appUrl('catalog'))
    .webApp('🛍 Купи-продай', appUrl('market'))
    .row()
    .webApp('💼 Стать исполнителем', appUrl('apply'));

const marketKeyboard = () =>
  new InlineKeyboard()
    .webApp('🛍 Смотреть витрину', appUrl('buy'))
    .row()
    .webApp('🏷 Разместить объявление', appUrl('sell'));

const singleButton = (text: string, startParam: string) =>
  new InlineKeyboard().webApp(text, appUrl(startParam));

bot.command('start', async (ctx) => {
  // Полезная нагрузка deep link: /start specialist_anna-manicure
  const payload = ctx.match?.trim();

  if (payload?.startsWith('specialist_')) {
    await ctx.reply(messages.OPENING_SPECIALIST, {
      reply_markup: singleButton('👤 Смотреть карточку', payload),
    });
    return;
  }

  if (payload?.startsWith('listing_')) {
    await ctx.reply(messages.OPENING_LISTING, {
      reply_markup: singleButton('📦 Смотреть объявление', payload),
    });
    return;
  }

  // Индикатор набора стоит первым: пока считаются числа, в чате видно,
  // что бот отвечает, а не молчит.
  await ctx.replyWithChatAction('typing');
  const counts = await fetchCounts();

  const name = ctx.from?.first_name?.trim();
  await ctx.reply(messages.greeting(name, counts), { parse_mode: 'HTML' });

  // Каждая дверь — отдельное сообщение: у кнопок Telegram картинок нет,
  // и связать снимок с конкретным разделом иначе нечем. Отправляем
  // по очереди, а не разом: параллельная отправка перемешивает порядок.
  for (const door of messages.DOORS) {
    await replyWithBanner(
      ctx,
      door.banner,
      door.caption,
      singleButton(door.button, door.param),
      door.caption,
    );
  }
});

bot.command('market', async (ctx) => {
  await ctx.replyWithChatAction('typing');
  const counts = await fetchCounts();

  await replyWithBanner(
    ctx,
    'market',
    messages.marketCaption(counts),
    marketKeyboard(),
    messages.market(counts),
  );
});

bot.command('help', async (ctx) => {
  await replyWithBanner(ctx, 'help', messages.HELP_CAPTION, mainKeyboard(), messages.HELP);
});

// Оплата — до общего обработчика сообщений: сообщение об успешном
// платеже приходит обычным сообщением, и иначе его перехватила бы
// заглушка «вернитесь к кнопкам».
registerPayments(bot);

// Любое сообщение вне команд возвращает пользователя к кнопкам запуска,
// иначе диалог с ботом выглядит как тупик.
bot.on('message', async (ctx) => {
  await ctx.reply(messages.FALLBACK, { reply_markup: mainKeyboard() });
});

bot.catch((error) => {
  console.error('Ошибка в обработчике бота:', error.message);
});

async function main() {
  const me = await bot.api.getMe();
  console.log(`Бот @${me.username} запущен. Mini App: ${appUrl()}`);

  // Кнопка меню рядом с полем ввода ведёт на тот же адрес, что и кнопки
  // в сообщениях, — иначе через неё открывалась бы прошлая версия из кэша.
  // Не критично для работы бота, поэтому ошибка сюда его не роняет.
  try {
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: appUrl() } },
    });
  } catch (error) {
    console.error('Не удалось обновить кнопку меню:', error);
  }

  await bot.start();
}

void main().catch((error: unknown) => {
  console.error('Не удалось запустить бота:', error);
  process.exit(1);
});
