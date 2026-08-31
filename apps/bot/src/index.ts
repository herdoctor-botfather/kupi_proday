import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';
import { currentMiniAppUrl } from './miniapp-url';
import { fetchCounts } from './stats';
import * as messages from './messages';
import { replyWithBanner } from './banner';

/**
 * Бот-обёртка вокруг Mini App.
 *
 * Вся содержательная работа происходит внутри Mini App; задача бота —
 * дать точку входа, отвечать на команды и обрабатывать deep link вида
 * https://t.me/имя_бота?start=specialist_адрес-карточки, по которому
 * пользователь попадает сразу в нужный профиль.
 */

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

/** Адрес Mini App с параметром запуска: по нему приложение откроет нужный экран. */
const appUrl = (startParam?: string): string => {
  const base = currentMiniAppUrl();
  return startParam ? `${base}?tgWebAppStartParam=${encodeURIComponent(startParam)}` : base;
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
  await replyWithBanner(
    ctx,
    'welcome',
    messages.welcomeCaption(name, counts),
    mainKeyboard(),
    // Запасной текст на случай, если картинка не ушла: он несёт то же,
    // что нарисовано на баннере, — иначе человек останется без объяснения.
    messages.welcome(name, counts),
  );
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
  console.log(`Бот @${me.username} запущен. Mini App: ${currentMiniAppUrl()}`);
  await bot.start();
}

void main().catch((error: unknown) => {
  console.error('Не удалось запустить бота:', error);
  process.exit(1);
});
