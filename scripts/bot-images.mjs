/**
 * Рисует баннеры для сообщений бота.
 *
 *   node scripts/bot-images.mjs
 *
 * Сообщение с картинкой читается одним взглядом, а список строк с эмодзи
 * приходится вычитывать. Рисуем в том же оформлении, что и приложение:
 * человек, открыв мини-приложение, попадает в знакомую картинку,
 * а не в другое приложение.
 *
 * Рисует браузер — он единственный на этой машине умеет цветные эмодзи
 * и градиенты сразу. Готовые файлы лежат в репозитории, чтобы бот
 * не зависел ни от браузера, ни от сети.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/bot/assets');
const tmpDir = join(root, '.bot-images-tmp');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = `${process.env.HOME}/.local/bin/ffmpeg`;

/** Ширина к высоте примерно 16:9 — Telegram показывает такую картинку целиком. */
const WIDTH = 1280;
const HEIGHT = 720;

/**
 * Каждой двери — своя картинка. Имена файлов постоянные: чтобы поставить
 * свои снимки, достаточно положить их в apps/bot/assets под теми же
 * именами, ничего в коде менять не нужно.
 */
const BANNERS = [
  {
    file: 'door-catalog',
    title: 'Я ищу специалиста',
    subtitle: 'Мастера с отзывами, ценами и картой',
    rows: [
      ['🔎', 'Поиск', 'по категориям или «найти рядом»'],
      ['⭐️', 'Отзывы', 'оценки от тех, кто уже обращался'],
      ['🗺', 'Карта', 'видно, кто работает поблизости'],
    ],
  },
  {
    file: 'door-apply',
    title: 'Я оказываю услуги',
    subtitle: 'Разместите анкету — вас будут находить',
    rows: [
      ['📝', 'Анкета', 'услуги, цены, фотографии работ'],
      ['✅', 'Проверка', 'модератор смотрит и публикует'],
      ['💬', 'Заказы', 'клиенты пишут прямо в приложении'],
    ],
  },
  {
    file: 'door-market',
    title: 'Купи-продай',
    subtitle: 'Вещи от людей поблизости',
    rows: [
      ['🛍', 'Покупаю', 'каталог по категориям и фильтры'],
      ['🏷', 'Продаю', 'название, цена, фотографии'],
      ['🤝', 'Без комиссий', 'договариваетесь напрямую'],
    ],
  },
  {
    file: 'door-wanted',
    title: 'Люди ищут прямо сейчас',
    subtitle: 'Кому-то нужно то, что у вас уже есть',
    rows: [
      ['🔎', 'Запросы', 'что люди хотят купить сегодня'],
      ['💡', 'Ваш шанс', 'вещь лежит без дела — предложите её'],
      ['📨', 'Отклик', 'пишете покупателю и договариваетесь'],
    ],
  },
  {
    file: 'market',
    title: 'Купи-продай',
    subtitle: 'Доска объявлений от людей рядом',
    rows: [
      ['🛍', 'Я покупаю', 'каталог по категориям, поиск и фильтры'],
      ['🏷', 'Я продаю', 'название, цена, фотографии — и на витрину'],
      ['💬', 'Связь', 'покупатель и продавец пишут друг другу здесь'],
    ],
  },
  {
    file: 'help',
    title: 'Как здесь всё устроено',
    subtitle: 'Четыре двери и одна переписка',
    rows: [
      ['🔎', 'Ищете мастера', 'категория или «найти рядом» — по расстоянию'],
      ['🛠', 'Вы мастер', 'анкета проходит проверку и попадает в каталог'],
      ['🏷', 'Продаёте вещь', 'объявление публикуется после модерации'],
      ['💬', 'Переписка', 'телефоны и ссылки скрываются — история остаётся'],
    ],
  },
];

const page = ({ title, subtitle, rows }) => `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    padding: 64px 72px;
    display: flex; flex-direction: column; justify-content: center; gap: 40px;
    background:
      radial-gradient(60% 50% at 6% 0%, rgba(204, 255, 51, 0.16), transparent 70%),
      radial-gradient(55% 45% at 100% 100%, rgba(80, 255, 190, 0.12), transparent 72%),
      linear-gradient(160deg, #0d0f0c, #08090a);
    color: #f1f3ef;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  h1 {
    font-size: 58px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.05;
  }
  .subtitle {
    margin-top: 12px; font-size: 25px; color: #8a9186;
  }
  .rows { display: flex; flex-direction: column; gap: 22px; }
  .row { display: flex; align-items: center; gap: 22px; }
  .glyph {
    width: 74px; height: 74px; flex: none;
    display: flex; align-items: center; justify-content: center;
    border-radius: 22px; font-size: 38px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
  }
  .name { font-size: 29px; font-weight: 650; color: #ccff33; }
  .text { font-size: 24px; color: #a7ada3; margin-top: 3px; }
</style>
<div>
  <h1>${title}</h1>
  <div class="subtitle">${subtitle}</div>
</div>
<div class="rows">
  ${rows
    .map(
      ([glyph, name, text]) => `
  <div class="row">
    <div class="glyph">${glyph}</div>
    <div>
      <div class="name">${name}</div>
      <div class="text">${text}</div>
    </div>
  </div>`,
    )
    .join('')}
</div>
`;

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  for (const banner of BANNERS) {
    const html = join(tmpDir, `${banner.file}.html`);
    const png = join(tmpDir, `${banner.file}.png`);
    const jpg = join(outDir, `${banner.file}.jpg`);

    await writeFile(html, page(banner));
    await run(CHROME, [
      '--headless',
      '--hide-scrollbars',
      '--use-gl=swiftshader',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--virtual-time-budget=3000',
      `--screenshot=${png}`,
      `file://${html}`,
    ]).catch(() => {});

    // JPEG вместо PNG: Telegram всё равно пережимает, а весит вчетверо меньше.
    await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-q:v', '3', jpg]);
    console.log(`  ✓ ${banner.file}.jpg`);
  }

  await rm(tmpDir, { recursive: true, force: true });
  console.log(`\nГотово: ${BANNERS.length} баннера в apps/bot/assets`);
}

await main();
