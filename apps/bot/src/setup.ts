import { Bot } from 'grammy';
import { config } from './config';

/**
 * Разовая настройка бота в Telegram: команды, описание и кнопка меню,
 * открывающая Mini App. Запускается один раз после деплоя:
 *
 *   npm run setup -w @app/bot
 *
 * То же самое можно сделать руками через @BotFather, но скриптом это
 * воспроизводимо и не забывается при переезде на другой бот-токен.
 */
async function main() {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  await bot.api.setMyCommands([
    { command: 'start', description: 'Открыть каталог специалистов' },
    { command: 'help', description: 'Справка' },
  ]);

  await bot.api.setMyDescription(
    'Каталог специалистов сферы услуг: поиск по категориям, рейтинги, отзывы и карта мастеров рядом с вами.',
  );

  await bot.api.setMyShortDescription('Каталог проверенных специалистов рядом с вами');

  // Кнопка меню рядом с полем ввода — основной вход в приложение.
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Каталог',
      web_app: { url: config.MINIAPP_URL },
    },
  });

  const me = await bot.api.getMe();
  console.log(`Настройки применены для @${me.username}`);
  console.log(`Кнопка меню открывает: ${config.MINIAPP_URL}`);
}

void main().catch((error: unknown) => {
  console.error('Настройка не удалась:', error);
  process.exit(1);
});
