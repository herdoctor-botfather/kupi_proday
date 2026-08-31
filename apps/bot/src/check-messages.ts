import { config } from './config';
import * as messages from './messages';

/**
 * Проверка разметки сообщений бота без доставки:
 *
 *   npm run check:messages -w @app/bot
 *
 * Сломанный HTML Telegram не показывает вовсе — вместо сообщения человек
 * видит пустоту, а в логе появляется ошибка, которую никто не читает.
 * Поймать это глазами трудно: теги теряются при правке текста.
 *
 * Telegram разбирает parse_mode раньше, чем ищет чат, поэтому отправка
 * в заведомо несуществующий чат отвечает «chat not found» при исправной
 * разметке и «can't parse entities» при сломанной. Сообщение при этом
 * никому не доставляется.
 */

/** Чата с таким идентификатором не существует. */
const NOWHERE = 1;

const SAMPLES: Array<[string, string]> = [
  ['подпись баннера: имя и числа', messages.welcomeCaption('Денис', { specialists: 5, listings: 7 })],
  ['подпись баннера: без имени', messages.welcomeCaption(undefined, null)],
  ['подпись баннера: имя с < и &', messages.welcomeCaption('Вася <b>&', { specialists: 1, listings: 1 })],
  ['подпись барахолки', messages.marketCaption({ specialists: 5, listings: 21 })],
  ['подпись справки', messages.HELP_CAPTION],
  ['приветствие: имя и живые числа', messages.welcome('Денис', { specialists: 5, listings: 7 })],
  ['приветствие: без имени, API молчит', messages.welcome(undefined, null)],
  ['приветствие: имя с < и &', messages.welcome('Вася <b>&', { specialists: 1, listings: 1 })],
  ['приветствие: пустой каталог', messages.welcome('Аня', { specialists: 0, listings: 0 })],
  ['барахолка', messages.market({ specialists: 5, listings: 21 })],
  ['справка', messages.HELP],
];

async function main() {
  let failed = 0;

  for (const [name, text] of SAMPLES) {
    const response = await fetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: NOWHERE, text, parse_mode: 'HTML' }),
      },
    );

    const body = (await response.json()) as { description?: string };
    const reason = body.description ?? '';
    // Всё, кроме претензий к разметке, считаем успехом: «chat not found»
    // означает, что текст Telegram разобрал и дошёл до поиска чата.
    const ok = !/parse|entit|tag/i.test(reason);

    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${reason}`}`);
    if (!ok) failed += 1;
  }

  console.log(`\nИтого: проверено ${SAMPLES.length}, с ошибками ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error('Проверка не удалась:', error);
  process.exit(1);
});
