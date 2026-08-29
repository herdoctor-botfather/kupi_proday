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
    { command: 'start', description: '🚀 Начать' },
    { command: 'market', description: '🛍 Купи-продай' },
    { command: 'help', description: '❓ Как здесь всё устроено' },
  ]);

  // Описание видно на пустом экране до первого сообщения — это витрина бота,
  // и оно должно отвечать на вопрос «зачем сюда заходить», а не описывать
  // устройство приложения.
  await bot.api.setMyDescription(
    'Мастера и объявления в одном месте.\n\n' +
      '🔧 Услуги — с отзывами, ценами и картой: видно, кто работает рядом.\n' +
      '🛍 Купи-продай — вещи от людей поблизости.\n' +
      '💬 Переписка здесь же, уходить никуда не нужно.\n\n' +
      'Нажмите «Начать».',
  );

  await bot.api.setMyShortDescription('Мастера рядом и объявления о продаже — внутри Telegram');

  // Кнопка меню рядом с полем ввода — основной вход в приложение.
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Открыть',
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
