/**
 * Рисует обложки для демонстрационных карточек.
 *
 *   node scripts/demo-photos.mjs
 *
 * Настоящих фотографий у проекта нет и взяться им неоткуда: снимок гитары
 * или портрет мастера нужно снять, а не сгенерировать. Поэтому обложки
 * рисуются в том же оформлении, что и само приложение, — фон в цвете
 * категории, крупный значок, подпись. Пустая карточка выглядит поломкой,
 * а такая обложка выглядит решением.
 *
 * Рисует браузер: он единственный на этой машине умеет цветные эмодзи
 * и градиенты сразу. Готовые файлы лежат в репозитории, чтобы сид
 * не зависел ни от браузера, ни от сети.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/api/prisma/demo-photos');
const tmpDir = join(root, '.demo-photos-tmp');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = `${process.env.HOME}/.local/bin/ffmpeg`;

/** Тон плитки категории — те же значения, что в приложении. */
const HUES = {
  photo: 15, repair: 38, pets: 80, health: 150, cleaning: 185,
  auto: 215, it: 250, tutors: 280, events: 315, beauty: 340,
  tools: 15, home: 45, kids: 75, sport: 130, hobby: 170,
  electronics: 210, 'auto-parts': 255, clothes: 320,
};

const COVERS = [
  // Объявления о продаже
  { file: 'listing-iphone', hue: HUES.electronics, emoji: '📱', label: 'iPhone 13' },
  { file: 'listing-divan', hue: HUES.home, emoji: '🛋', label: 'Угловой диван' },
  { file: 'listing-kurtka', hue: HUES.clothes, emoji: '🧥', label: 'Куртка зимняя' },
  { file: 'listing-kolyaska', hue: HUES.kids, emoji: '🍼', label: 'Коляска' },
  { file: 'listing-velosiped', hue: HUES.sport, emoji: '🚲', label: 'Велосипед' },
  { file: 'listing-perforator', hue: HUES.tools, emoji: '🧰', label: 'Перфоратор' },
  { file: 'listing-gitara', hue: HUES.hobby, emoji: '🎸', label: 'Гитара' },

  // Запросы на покупку
  { file: 'wanted-ps5', hue: HUES.electronics, emoji: '🎮', label: 'Ищу PlayStation' },
  { file: 'wanted-kreslo', hue: HUES.kids, emoji: '🧸', label: 'Ищу автокресло' },
  { file: 'wanted-shurupovert', hue: HUES.tools, emoji: '🔩', label: 'Ищу шуруповёрт' },
  { file: 'wanted-trenazher', hue: HUES.sport, emoji: '🚴', label: 'Ищу велотренажёр' },

  // Аватары мастеров
  { file: 'master-anna', hue: HUES.beauty, emoji: '💅', label: 'Маникюр', square: true },
  { file: 'master-sergey', hue: HUES.repair, emoji: '🔧', label: 'Сантехник', square: true },
  { file: 'master-dmitry', hue: HUES.auto, emoji: '🚗', label: 'Автоэлектрик', square: true },
  { file: 'master-marina', hue: HUES.tutors, emoji: '📚', label: 'Репетитор', square: true },
  { file: 'master-olga', hue: HUES.cleaning, emoji: '🧹', label: 'Уборка', square: true },
];

/**
 * Аватар обрезается кругом, и подпись в него не помещается — остаётся
 * обрубок текста у нижнего края. Поэтому у аватаров только значок,
 * и он стоит ровно по центру кадра.
 */
const page = ({ hue, emoji, label, square }) => `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 900px; height: 900px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 24px;
    background:
      radial-gradient(120% 90% at 20% 0%, hsl(${hue} 62% 30%), transparent 62%),
      linear-gradient(155deg, hsl(${hue} 45% 18%), hsl(${hue} 55% 9%));
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .glyph {
    /* Обложку чаще всего видят плиткой в сто с небольшим точек: значок
       должен занимать почти весь кадр, иначе в списке от него остаётся
       неразличимая точка. */
    font-size: ${square ? 460 : 420}px; line-height: 1;
    filter: drop-shadow(0 24px 50px rgba(0, 0, 0, 0.45));
  }
  .label {
    font-size: 54px; font-weight: 650; letter-spacing: 0.01em;
    color: hsl(${hue} 70% 88%);
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }
</style>
<div class="glyph">${emoji}</div>
${square ? '' : `<div class="label">${label}</div>`}
`;

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  for (const cover of COVERS) {
    const html = join(tmpDir, `${cover.file}.html`);
    const png = join(tmpDir, `${cover.file}.png`);
    const jpg = join(outDir, `${cover.file}.jpg`);

    await writeFile(html, page(cover));
    await run(CHROME, [
      '--headless',
      '--hide-scrollbars',
      '--use-gl=swiftshader',
      '--force-device-scale-factor=1',
      '--window-size=900,900',
      '--virtual-time-budget=3000',
      `--screenshot=${png}`,
      `file://${html}`,
    ]).catch(() => {});

    // JPEG вместо PNG: обложка с градиентом весит вчетверо меньше,
    // а разницы на экране телефона не видно.
    await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-q:v', '4', jpg]);
    console.log(`  ✓ ${cover.file}.jpg`);
  }

  await rm(tmpDir, { recursive: true, force: true });
  console.log(`\nГотово: ${COVERS.length} обложек в apps/api/prisma/demo-photos`);
}

await main();
