/**
 * Проверка ответов специалиста на отзывы и жалоб на карточки и отзывы.
 *
 * Перед запуском: база наполнена сидом, API запущен с тем же токеном,
 * что указан в TEST_BOT_TOKEN.
 */
const { createHmac } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const BOT_TOKEN = process.env.TEST_BOT_TOKEN || '123456:TEST-TOKEN-FOR-VERIFICATION';
const PSQL = process.env.PSQL_BIN || 'psql';
const DB_URL = process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/tgspec';

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
      'Content-Type': 'application/json',
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

const login = async (id, name) => {
  const { body } = await req('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData: makeInitData({ id, first_name: name }) }),
  });
  return body;
};

// Через execFileSync, а не execSync: оболочка съедает кавычки вокруг
// имён столбцов, и PostgreSQL перестаёт узнавать "telegramId".
const sql = (query) => execFileSync(PSQL, [DB_URL, '-tAc', query], { encoding: 'utf8' }).trim();

async function main() {
  const MASTER_TG = 830000001;
  const CLIENT_TG = 830000002;
  const OTHER_TG = 830000003;
  const ADMIN_TG = 830000004;

  const master = await login(MASTER_TG, 'Мастер');
  const client = await login(CLIENT_TG, 'Клиент');
  const other = await login(OTHER_TG, 'Прохожий');
  await login(ADMIN_TG, 'Админ');
  sql(`UPDATE users SET role='ADMIN' WHERE \"telegramId\"=${ADMIN_TG}`);
  const admin = await login(ADMIN_TG, 'Админ');

  // Готовим опубликованную карточку с одобренным отзывом.
  const { body: cats } = await req('/categories');
  const { body: profile } = await req('/me/specialist', {
    method: 'POST',
    token: master.token,
    body: JSON.stringify({
      displayName: 'Ольга Ответова',
      city: 'Пермь',
      phone: '+7 900 111-00-11',
      categoryIds: [cats.find((c) => c.slug === 'cleaning').id],
      services: [],
    }),
  });
  await req(`/admin/specialists/${profile.id}/moderate`, {
    method: 'PATCH',
    token: admin.token,
    body: JSON.stringify({ action: 'approve' }),
  });

  const { body: review } = await req(`/specialists/${profile.id}/reviews`, {
    method: 'POST',
    token: client.token,
    body: JSON.stringify({ rating: 2, text: 'Опоздала на час' }),
  });

  console.log('Ответ специалиста на отзыв:\n');

  await check('на неопубликованный отзыв ответить нельзя', async () => {
    const { status, body } = await req(`/me/specialist/reviews/${review.id}/reply`, {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({ text: 'Извините' }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'REVIEW_NOT_PUBLISHED', `код: ${body.code}`);
  });

  await check('после публикации отзыва ответ сохраняется', async () => {
    await req(`/admin/reviews/${review.id}`, {
      method: 'PATCH',
      token: admin.token,
      body: JSON.stringify({ action: 'approve' }),
    });

    const { status } = await req(`/me/specialist/reviews/${review.id}/reply`, {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({ text: 'Прошу прощения за задержку, в тот день была авария на дороге.' }),
    });
    assert(status === 201 || status === 200, `статус ${status}`);
  });

  await check('ответ виден всем в публичном списке отзывов', async () => {
    const { body } = await req(`/specialists/${profile.id}/reviews`);
    assert(body.items.length === 1, `отзывов ${body.items.length}`);
    assert(body.items[0].reply !== null, 'ответа нет');
    assert(/авария на дороге/.test(body.items[0].reply.text), `текст: ${body.items[0].reply.text}`);
    assert(body.items[0].reply.createdAt, 'нет даты ответа');
  });

  await check('чужой специалист ответить не может', async () => {
    const { body: otherProfile } = await req('/me/specialist', {
      method: 'POST',
      token: other.token,
      body: JSON.stringify({
        displayName: 'Чужой Мастер',
        city: 'Пермь',
        phone: '+7 900 222-00-22',
        categoryIds: [cats.find((c) => c.slug === 'repair').id],
        services: [],
      }),
    });
    assert(otherProfile.id, 'анкета не создалась');

    const { status } = await req(`/me/specialist/reviews/${review.id}/reply`, {
      method: 'POST',
      token: other.token,
      body: JSON.stringify({ text: 'Захват' }),
    });
    assert(status === 404, `статус ${status}`);

    const { body } = await req(`/specialists/${profile.id}/reviews`);
    assert(/авария на дороге/.test(body.items[0].reply.text), 'чужой ответ перезаписал наш');
  });

  await check('пустой текст удаляет ответ', async () => {
    await req(`/me/specialist/reviews/${review.id}/reply`, {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({ text: '   ' }),
    });
    const { body } = await req(`/specialists/${profile.id}/reviews`);
    assert(body.items[0].reply === null, 'ответ остался');
  });

  console.log('\nЖалобы:\n');

  await check('жалоба без авторизации отклоняется', async () => {
    const { status } = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({ target: 'SPECIALIST', targetId: profile.id, reason: 'Мошенничество' }),
    });
    assert(status === 401, `статус ${status}`);
  });

  await check('причина «Другое» требует пояснения', async () => {
    const { status } = await req('/reports', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ target: 'SPECIALIST', targetId: profile.id, reason: 'Другое' }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('причина не из списка отклоняется', async () => {
    const { status } = await req('/reports', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ target: 'SPECIALIST', targetId: profile.id, reason: 'Не нравится' }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('жалоба на несуществующий объект отклоняется', async () => {
    const { status, body } = await req('/reports', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ target: 'SPECIALIST', targetId: 'no_such_id', reason: 'Мошенничество' }),
    });
    assert(status === 404, `статус ${status}`);
    assert(body.code === 'TARGET_NOT_FOUND', `код: ${body.code}`);
  });

  await check('на себя пожаловаться нельзя', async () => {
    const { status, body } = await req('/reports', {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({ target: 'SPECIALIST', targetId: profile.id, reason: 'Мошенничество' }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'SELF_REPORT', `код: ${body.code}`);
  });

  await check('на свой отзыв пожаловаться нельзя', async () => {
    const { status, body } = await req('/reports', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ target: 'REVIEW', targetId: review.id, reason: 'Реклама или спам' }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'SELF_REPORT', `код: ${body.code}`);
  });

  await check('корректная жалоба принимается', async () => {
    const { status, body } = await req('/reports', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({
        target: 'SPECIALIST',
        targetId: profile.id,
        reason: 'Недостоверные сведения',
        comment: 'Указан чужой адрес',
      }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.status === 'OPEN', `статус жалобы: ${body.status}`);
  });

  await check('повторная жалоба на тот же объект отклоняется', async () => {
    const { status, body } = await req('/reports', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ target: 'SPECIALIST', targetId: profile.id, reason: 'Мошенничество' }),
    });
    assert(status === 409, `статус ${status}`);
    assert(body.code === 'ALREADY_REPORTED', `код: ${body.code}`);
  });

  await check('жалоба не влияет на видимость карточки автоматически', async () => {
    // Автоматическое скрытие превратило бы жалобы в оружие против конкурентов.
    const { status } = await req(`/specialists/${profile.id}`);
    assert(status === 200, `карточка скрылась сама: ${status}`);
  });

  await check('жалоба видна в очереди администратора', async () => {
    const { status, body } = await req('/admin/reports', { token: admin.token });
    assert(status === 200, `статус ${status}`);
    assert(body.length === 1, `жалоб ${body.length}`);
    assert(body[0].specialist?.displayName === 'Ольга Ответова', 'объект жалобы не подтянулся');
    assert(body[0].reporter.firstName === 'Клиент', 'автор жалобы не подтянулся');
  });

  await check('обычный пользователь очередь жалоб не видит', async () => {
    const { status } = await req('/admin/reports', { token: client.token });
    assert(status === 403, `статус ${status}`);
  });

  await check('рассмотренная жалоба уходит из очереди', async () => {
    const { body: list } = await req('/admin/reports', { token: admin.token });
    const { status } = await req(`/admin/reports/${list[0].id}`, {
      method: 'PATCH',
      token: admin.token,
      body: JSON.stringify({ action: 'dismiss', note: 'Адрес подтверждён' }),
    });
    assert(status === 200, `статус ${status}`);

    const { body: after } = await req('/admin/reports', { token: admin.token });
    assert(after.length === 0, `в очереди осталось ${after.length}`);
  });

  await check('жалоба на отзыв подтягивает его текст', async () => {
    await req('/reports', {
      method: 'POST',
      token: other.token,
      body: JSON.stringify({ target: 'REVIEW', targetId: review.id, reason: 'Оскорбления или нецензурная лексика' }),
    });
    const { body } = await req('/admin/reports', { token: admin.token });
    assert(body.length === 1, `жалоб ${body.length}`);
    assert(body[0].review?.text === 'Опоздала на час', `текст отзыва: ${body[0].review?.text}`);
  });

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Сценарий прерван:', error);
  process.exit(1);
});
