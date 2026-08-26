import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';
import { currentMiniAppUrl } from './miniapp-url';

/**
 * Бот-обёртка вокруг Mini App.
 *
 * Вся содержательная работа происходит внутри Mini App; задача бота —
 * дать точку входа, отвечать на команды и обрабатывать deep link вида
 * https://t.me/<bot>?start=specialist_<slug>, по которому пользователь
 * попадает сразу в нужный профиль.
 */

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

const openAppKeyboard = (startParam?: string) => {
  const base = currentMiniAppUrl();
  const url = startParam ? `${base}?tgWebAppStartParam=${encodeURIComponent(startParam)}` : base;
  return new InlineKeyboard().webApp('🔎 Открыть каталог', url);
};

bot.command('start', async (ctx) => {
  // Полезная нагрузка deep link: /start specialist_anna-manicure
  const payload = ctx.match?.trim();

  if (payload?.startsWith('specialist_')) {
    await ctx.reply('Открываю профиль специалиста:', { reply_markup: openAppKeyboard(payload) });
    return;
  }

  await ctx.reply(
    'Привет! Здесь собраны проверенные специалисты сферы услуг.\n\n' +
      '• Поиск по категориям и услугам\n' +
      '• Рейтинги и отзывы клиентов\n' +
      '• Карта — видно, кто работает рядом\n\n' +
      'Нажмите кнопку ниже, чтобы открыть каталог.',
    { reply_markup: openAppKeyboard(payload) },
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Команды:\n' +
      '/start — открыть каталог\n' +
      '/help — эта справка\n\n' +
      'Хотите разместить свою анкету? Напишите администратору.',
    { reply_markup: openAppKeyboard() },
  );
});

// Любое сообщение вне команд возвращает пользователя к кнопке запуска,
// иначе диалог с ботом выглядит как тупик.
bot.on('message', async (ctx) => {
  await ctx.reply('Каталог открывается по кнопке ниже.', { reply_markup: openAppKeyboard() });
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
