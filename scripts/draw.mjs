/**
 * Рисует картинку по описанию.
 *
 *   node scripts/draw.mjs "витрина маленького магазина, тёплый свет" out.png
 *
 * Рисует FLUX на видеокарте этой машины через ComfyUI — он должен быть
 * запущен (scripts/draw-server.cmd). Ни ключей, ни интернета не нужно:
 * всё считается локально, и сгенерировать можно сколько угодно.
 *
 * Зачем скрипт, если у ComfyUI есть свой экран с узлами: там картинку
 * делают руками, а здесь — командой, и значит её может сделать и человек,
 * и сборка, и ассистент, не открывая браузер.
 */
import { writeFile } from 'node:fs/promises';
import { argv, exit, env } from 'node:process';

const HOST = env.COMFY_HOST ?? 'http://127.0.0.1:8188';

/** Модель, размеры и число шагов. FLUX schnell рисует за четыре — это его особенность. */
const CHECKPOINT = env.COMFY_CHECKPOINT ?? 'flux1-schnell-fp8.safetensors';
const STEPS = Number(env.COMFY_STEPS ?? 4);

const [, , prompt, output = 'out.png', sizeArg = '1024x1024'] = argv;

if (!prompt) {
  console.error('Нужно описание: node scripts/draw.mjs "что нарисовать" [файл] [ШИРИНАxВЫСОТА]');
  exit(1);
}

/*
 * Описание должно быть по-английски.
 *
 * Модель понимает только его: на «мастер с ящиком инструментов» она
 * нарисовала старика с гитарой — не ошибку, а совсем другую картинку,
 * и понять это можно лишь посмотрев на результат. Поэтому предупреждаем
 * сразу, а не оставляем человека гадать, почему вышло не то.
 */
if (/[а-яё]/i.test(prompt)) {
  console.error('Внимание: описание по-русски модель не понимает — переведите его на английский.');
}

const [width, height] = sizeArg.split('x').map(Number);
if (!width || !height) {
  console.error(`Размер не разобран: ${sizeArg}. Ожидается вид 1280x720.`);
  exit(1);
}

/**
 * Схема работы в том виде, в каком её ждёт ComfyUI: узлы и связи между ними.
 * Ключи — номера узлов, ссылка на чужой выход записывается парой
 * [номер узла, номер выхода].
 */
const workflow = {
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
  2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
  // Пустая строка вместо «чего не надо»: FLUX её не использует, но узел
  // выборки требует вход, и молча пропустить его нельзя.
  3: { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
  4: { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
  5: {
    class_type: 'KSampler',
    inputs: {
      model: ['1', 0],
      positive: ['2', 0],
      negative: ['3', 0],
      latent_image: ['4', 0],
      // Своё зерно на каждый запуск: иначе одно и то же описание всегда
      // давало бы одну и ту же картинку, и «нарисуй другую» не работало бы.
      seed: Number(env.COMFY_SEED ?? Math.floor(Math.random() * 2 ** 31)),
      steps: STEPS,
      // Единица — это «без усиления»: schnell обучен работать так.
      cfg: 1,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
    },
  },
  6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  7: { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'draw' } },
};

const post = await fetch(`${HOST}/prompt`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: workflow }),
}).catch(() => null);

if (!post) {
  console.error(`ComfyUI не отвечает на ${HOST}. Запустите scripts/draw-server.cmd.`);
  exit(1);
}

if (!post.ok) {
  // Ошибку схемы ComfyUI объясняет подробно — показываем как есть,
  // догадываться по коду ответа тут не о чем.
  console.error(await post.text());
  exit(1);
}

const { prompt_id: id } = await post.json();
process.stderr.write('Рисую');

/** Ждём, пока задание не появится в истории: там же лежит имя готового файла. */
let done = null;
while (!done) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  process.stderr.write('.');
  const history = await (await fetch(`${HOST}/history/${id}`)).json();
  const entry = history[id];
  if (!entry) continue;

  const failed = entry.status?.status_str === 'error';
  if (failed) {
    console.error('\n' + JSON.stringify(entry.status.messages ?? entry.status, null, 2));
    exit(1);
  }
  done = entry.outputs?.['7']?.images?.[0] ?? null;
}

const params = new URLSearchParams({
  filename: done.filename,
  subfolder: done.subfolder ?? '',
  type: done.type ?? 'output',
});
const image = await fetch(`${HOST}/view?${params}`);
await writeFile(output, Buffer.from(await image.arrayBuffer()));

console.error(`\nГотово: ${output}`);
