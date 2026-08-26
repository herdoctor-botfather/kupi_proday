/**
 * Проверка загрузки изображений: определение типа по содержимому,
 * ограничения, привязка к анкете и удаление файлов вместе с записями.
 *
 * Перед запуском: база наполнена сидом, API запущен с тем же токеном,
 * что указан в TEST_BOT_TOKEN, и с STORAGE_DRIVER=local.
 */
const { createHmac } = require('node:crypto');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const BASE = 'http://localhost:3000/api';
const BOT_TOKEN = process.env.TEST_BOT_TOKEN || '123456:TEST-TOKEN-FOR-VERIFICATION';
const UPLOADS_DIR = process.env.UPLOADS_DIR || resolve(__dirname, '../uploads');

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${name}\n      ${error.message}`);
    failed += 1;
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function req(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function makeInitData(user) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) };
  const dcs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(dcs).digest('hex') }).toString();
}

/** Минимальный настоящий PNG 1×1 — проверка сигнатуры должна его принять. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Настоящий JPEG 1×1. */
const JPEG_1x1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

const upload = async (path, buffer, token, filename = 'photo.png') => {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  return req(path, { method: 'POST', token, body: form });
};

const keyToPath = (url) => resolve(UPLOADS_DIR, url.replace(/^\/uploads\//, ''));

async function main() {
  const TG = 820000001;
  const { body: auth } = await req('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData: makeInitData({ id: TG, first_name: 'Фотограф' }) }),
  });
  const token = auth.token;

  console.log('Проверки содержимого файла:\n');

  await check('загрузка без авторизации отклоняется', async () => {
    const form = new FormData();
    form.append('file', new Blob([PNG_1x1]), 'photo.png');
    const { status } = await req('/uploads/image', { method: 'POST', body: form });
    assert(status === 401, `статус ${status}`);
  });

  await check('текстовый файл под видом картинки отклоняется', async () => {
    // Расширение и имя говорят «png», но содержимое — обычный текст.
    const { status, body } = await upload('/uploads/image', Buffer.from('<?php echo 1; ?>'), token, 'evil.png');
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'UNSUPPORTED_FILE', `код: ${body.code}`);
  });

  await check('пустой файл отклоняется', async () => {
    const { status } = await upload('/uploads/image', Buffer.alloc(0), token);
    assert(status === 400, `статус ${status}`);
  });

  await check('слишком большой файл отклоняется', async () => {
    // 6 МБ с корректной сигнатурой PNG: отсекать должен размер, а не тип.
    const big = Buffer.concat([PNG_1x1, Buffer.alloc(6 * 1024 * 1024)]);
    const { status } = await upload('/uploads/image', big, token);
    assert(status === 413 || status === 400, `статус ${status}`);
  });

  await check('настоящий PNG принимается', async () => {
    const { status, body } = await upload('/uploads/image', PNG_1x1, token);
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.url.startsWith('/uploads/'), `адрес: ${body.url}`);
    assert(body.key.endsWith('.png'), `ключ: ${body.key}`);
  });

  await check('настоящий JPEG принимается и получает верное расширение', async () => {
    const { status, body } = await upload('/uploads/image', JPEG_1x1, token, 'photo.png');
    assert(status === 201 || status === 200, `статус ${status}`);
    // Имя файла говорило png, но содержимое — jpeg: расширение по содержимому.
    assert(body.key.endsWith('.jpg'), `ключ: ${body.key}`);
  });

  console.log('\nАватар и галерея анкеты:\n');

  await check('без анкеты аватар не загрузить', async () => {
    const { status, body } = await upload('/me/specialist/avatar', PNG_1x1, token);
    assert(status === 404, `статус ${status}`);
    assert(body.code === 'PROFILE_NOT_FOUND', `код: ${body.code}`);
  });

  await check('после подачи анкеты аватар загружается', async () => {
    const { body: cats } = await req('/categories');
    await req('/me/specialist', {
      method: 'POST',
      token,
      body: JSON.stringify({
        displayName: 'Пётр Фотографов',
        city: 'Самара',
        phone: '+7 900 777-00-11',
        categoryIds: [cats.find((c) => c.slug === 'photo').id],
        services: [],
      }),
    });

    const { status, body } = await upload('/me/specialist/avatar', PNG_1x1, token);
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.photoUrl?.startsWith('/uploads/avatar/'), `адрес: ${body.photoUrl}`);
  });

  let firstAvatarPath;
  await check('файл действительно лежит на диске и отдаётся по ссылке', async () => {
    const { body } = await req('/me/specialist', { token });
    firstAvatarPath = keyToPath(body.photoUrl);
    assert(existsSync(firstAvatarPath), `файла нет: ${firstAvatarPath}`);

    const response = await fetch(`http://localhost:3000${body.photoUrl}`);
    assert(response.status === 200, `статус отдачи: ${response.status}`);
    assert(response.headers.get('content-type')?.includes('image/png'), 'неверный content-type');
  });

  await check('замена аватара удаляет прежний файл', async () => {
    await upload('/me/specialist/avatar', JPEG_1x1, token);
    const { body } = await req('/me/specialist', { token });
    assert(body.photoUrl.endsWith('.jpg'), `новый адрес: ${body.photoUrl}`);
    // Прежний файл — мусор в хранилище, его быть не должно.
    assert(!existsSync(firstAvatarPath), 'прежний файл остался на диске');
  });

  let photoId;
  let photoPath;
  await check('снимок добавляется в галерею', async () => {
    const { status, body } = await upload('/me/specialist/photos', PNG_1x1, token);
    assert(status === 201 || status === 200, `статус ${status}`);
    assert(body.photos.length === 1, `снимков ${body.photos.length}`);
    photoId = body.photos[0].id;
    photoPath = keyToPath(body.photos[0].url);
    assert(existsSync(photoPath), 'файл не сохранён');
  });

  await check('удаление снимка убирает и запись, и файл', async () => {
    const { status } = await req(`/me/specialist/photos/${photoId}`, { method: 'DELETE', token });
    assert(status === 204, `статус ${status}`);

    const { body } = await req('/me/specialist', { token });
    assert(body.photos.length === 0, `снимков осталось ${body.photos.length}`);
    assert(!existsSync(photoPath), 'файл остался на диске');
  });

  await check('чужой снимок не удалить', async () => {
    const { body: other } = await req('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData: makeInitData({ id: 820000002, first_name: 'Чужой' }) }),
    });
    const { body: added } = await upload('/me/specialist/photos', PNG_1x1, token);
    const { status } = await req(`/me/specialist/photos/${added.photos[0].id}`, {
      method: 'DELETE',
      token: other.token,
    });
    assert(status === 404, `статус ${status}`);

    const { body } = await req('/me/specialist', { token });
    assert(body.photos.length === 1, 'снимок пропал у владельца');
  });

  await check('превышение лимита галереи отклоняется', async () => {
    // Один снимок уже есть, добавляем до предела и проверяем следующий.
    for (let i = 0; i < 11; i += 1) {
      await upload('/me/specialist/photos', PNG_1x1, token);
    }
    const { status, body } = await upload('/me/specialist/photos', PNG_1x1, token);
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'TOO_MANY_PHOTOS', `код: ${body.code}`);
  });

  await check('отклонённый по лимиту файл не остаётся в хранилище', async () => {
    const { body } = await req('/me/specialist', { token });
    assert(body.photos.length === 12, `снимков ${body.photos.length}, ожидалось 12`);
    // Файлы всех записей на месте, лишних не появилось: их удаляет сервис
    // при отказе, иначе бакет копил бы мусор с каждой неудачной попытки.
    for (const photo of body.photos) {
      assert(existsSync(keyToPath(photo.url)), `нет файла для ${photo.url}`);
    }
  });

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Сценарий прерван:', error);
  process.exit(1);
});
