/**
 * Проверка админ-API: вход через Telegram Login Widget, разграничение прав
 * модератора и администратора, работа с категориями, карточками и подписками.
 *
 * Перед запуском:
 *   1. база наполнена сидом:  npm run db:seed
 *   2. API запущен с тем же BOT_TOKEN, что ниже, и с заданным ADMIN_DEV_TOKEN
 *
 * Сценарий пишет в базу — гоняйте на тестовой.
 * Сброс: npm run test:e2e:reset -w @app/api
 */
const { createHash, createHmac } = require('node:crypto');
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

/** Подпись Mini App: секрет — HMAC от строки «WebAppData». */
function makeInitData(user) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) };
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** Подпись Login Widget: секрет — SHA-256 от токена бота. Алгоритм другой. */
function makeWidgetPayload(user) {
  const fields = { ...user, auth_date: Math.floor(Date.now() / 1000) };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return { ...fields, hash };
}

// Через execFileSync, а не execSync: оболочка съедает кавычки вокруг
// имён столбцов, и PostgreSQL перестаёт узнавать "telegramId".
const sql = (query) => execFileSync(PSQL, [DB_URL, '-tAc', query], { encoding: 'utf8' }).trim();

async function main() {
  console.log('Вход в админку через Telegram Login Widget:\n');

  // Пользователя заводим обычным входом в Mini App — так он появляется в жизни.
  const ADMIN_TG = 700000001;
  const MODERATOR_TG = 700000002;
  const PLAIN_TG = 700000003;

  for (const [id, name] of [[ADMIN_TG, 'Админ'], [MODERATOR_TG, 'Модератор'], [PLAIN_TG, 'Клиент']]) {
    await req('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData: makeInitData({ id, first_name: name }) }),
    });
  }
  sql(`UPDATE users SET role='ADMIN' WHERE \"telegramId\"=${ADMIN_TG}`);
  sql(`UPDATE users SET role='MODERATOR' WHERE \"telegramId\"=${MODERATOR_TG}`);

  let adminToken;
  let moderatorToken;

  await check('администратор входит через виджет', async () => {
    const payload = makeWidgetPayload({ id: ADMIN_TG, first_name: 'Админ', username: 'admin_test' });
    const { status, body } = await req('/auth/telegram-login', { method: 'POST', body: JSON.stringify(payload) });
    assert(status === 200 || status === 201, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.user.role === 'ADMIN', `роль: ${body.user.role}`);
    adminToken = body.token;
  });

  await check('модератор входит через виджет', async () => {
    const payload = makeWidgetPayload({ id: MODERATOR_TG, first_name: 'Модератор' });
    const { status, body } = await req('/auth/telegram-login', { method: 'POST', body: JSON.stringify(payload) });
    assert(status === 200 || status === 201, `статус ${status}`);
    assert(body.user.role === 'MODERATOR', `роль: ${body.user.role}`);
    moderatorToken = body.token;
  });

  await check('обычный пользователь в админку не входит', async () => {
    const payload = makeWidgetPayload({ id: PLAIN_TG, first_name: 'Клиент' });
    const { status, body } = await req('/auth/telegram-login', { method: 'POST', body: JSON.stringify(payload) });
    assert(status === 401, `статус ${status}`);
    assert(body.code === 'NOT_STAFF', `код: ${body.code}`);
  });

  await check('подделанная подпись виджета отклоняется', async () => {
    const payload = makeWidgetPayload({ id: ADMIN_TG, first_name: 'Админ' });
    payload.id = 999999999; // подменяем после подписи
    const { status, body } = await req('/auth/telegram-login', { method: 'POST', body: JSON.stringify(payload) });
    assert(status === 401, `статус ${status}`);
    assert(body.code === 'INVALID_LOGIN_DATA', `код: ${body.code}`);
  });

  await check('подпись Mini App не подходит для входа в админку', async () => {
    // Ключевая проверка: у двух механизмов разные секретные ключи, и подпись
    // от Mini App здесь обязана быть отвергнута.
    const fields = { id: ADMIN_TG, first_name: 'Админ', auth_date: Math.floor(Date.now() / 1000) };
    const dataCheckString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
    const wrongSecret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const hash = createHmac('sha256', wrongSecret).update(dataCheckString).digest('hex');
    const { status } = await req('/auth/telegram-login', {
      method: 'POST',
      body: JSON.stringify({ ...fields, hash }),
    });
    assert(status === 401, `статус ${status}, ожидался 401`);
  });

  await check('устаревшая подпись виджета отклоняется', async () => {
    const fields = { id: ADMIN_TG, first_name: 'Админ', auth_date: Math.floor(Date.now() / 1000) - 7200 };
    const dataCheckString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
    const secret = createHash('sha256').update(BOT_TOKEN).digest();
    const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
    const { status, body } = await req('/auth/telegram-login', {
      method: 'POST',
      body: JSON.stringify({ ...fields, hash }),
    });
    assert(status === 401, `статус ${status}`);
    assert(/устарел/i.test(body.message), `сообщение: ${body.message}`);
  });

  console.log('\nРазграничение прав:\n');

  await check('модератор видит очередь отзывов', async () => {
    const { status } = await req('/admin/reviews/pending', { token: moderatorToken });
    assert(status === 200, `статус ${status}`);
  });

  await check('модератор не управляет специалистами', async () => {
    const { status } = await req('/admin/specialists', { token: moderatorToken });
    assert(status === 403, `статус ${status}, ожидался 403`);
  });

  await check('модератор не управляет категориями', async () => {
    const { status } = await req('/admin/categories', { token: moderatorToken });
    assert(status === 403, `статус ${status}, ожидался 403`);
  });

  await check('администратору доступно всё', async () => {
    for (const path of ['/admin/stats', '/admin/specialists', '/admin/categories', '/admin/reviews/pending']) {
      const { status } = await req(path, { token: adminToken });
      assert(status === 200, `${path} → ${status}`);
    }
  });

  console.log('\nКатегории:\n');

  let categoryId;
  await check('категория создаётся', async () => {
    const { status, body } = await req('/admin/categories', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ name: 'Тестовая', slug: 'test-cat', icon: '🧪', sortOrder: 999, isActive: true }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    categoryId = body.id;
  });

  await check('дублирующийся slug отклоняется', async () => {
    const { status } = await req('/admin/categories', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ name: 'Ещё одна', slug: 'test-cat', icon: '🧪', sortOrder: 1, isActive: true }),
    });
    assert(status >= 400, `статус ${status}, ожидалась ошибка`);
  });

  await check('slug с кириллицей отклоняется', async () => {
    const { status } = await req('/admin/categories', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ name: 'Плохая', slug: 'категория', icon: '🧪', sortOrder: 1, isActive: true }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('скрытая категория пропадает из публичного каталога', async () => {
    await req(`/admin/categories/${categoryId}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ name: 'Тестовая', slug: 'test-cat', icon: '🧪', sortOrder: 999, isActive: false }),
    });
    const { body } = await req('/categories');
    assert(!body.some((c) => c.slug === 'test-cat'), 'скрытая категория всё ещё видна');
  });

  console.log('\nКарточки специалистов:\n');

  let specialistId;
  await check('карточка создаётся со статусом «Черновик» и не видна в каталоге', async () => {
    const { body: cats } = await req('/admin/categories', { token: adminToken });
    const beauty = cats.find((c) => c.slug === 'beauty');

    const { status, body } = await req('/admin/specialists', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        displayName: 'Тестовый Мастер',
        slug: 'test-master',
        city: 'Казань',
        status: 'DRAFT',
        isPromoted: false,
        phone: '+7 900 000-00-00',
        categoryIds: [beauty.id],
      }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    specialistId = body.id;

    const { status: publicStatus } = await req('/specialists/test-master');
    assert(publicStatus === 404, `черновик виден публично: статус ${publicStatus}`);
  });

  await check('карточка без категории отклоняется', async () => {
    const { status } = await req('/admin/specialists', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        displayName: 'Без категории',
        slug: 'no-cat',
        city: 'Уфа',
        status: 'DRAFT',
        isPromoted: false,
        categoryIds: [],
      }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('несуществующая категория отклоняется', async () => {
    const { status, body } = await req('/admin/specialists', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        displayName: 'Фантом',
        slug: 'phantom',
        city: 'Омск',
        status: 'DRAFT',
        isPromoted: false,
        categoryIds: ['cat_does_not_exist'],
      }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'CATEGORY_NOT_FOUND', `код: ${body.code}`);
  });

  await check('публикация делает карточку видимой и проставляет дату', async () => {
    const { body: cats } = await req('/admin/categories', { token: adminToken });
    const beauty = cats.find((c) => c.slug === 'beauty');

    const { status, body } = await req(`/admin/specialists/${specialistId}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({
        displayName: 'Тестовый Мастер',
        slug: 'test-master',
        city: 'Казань',
        status: 'ACTIVE',
        isPromoted: false,
        phone: '+7 900 000-00-00',
        categoryIds: [beauty.id],
      }),
    });
    assert(status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.publishedAt, 'publishedAt не проставлен при публикации');

    const { status: publicStatus } = await req('/specialists/test-master');
    assert(publicStatus === 200, `карточка не появилась в каталоге: ${publicStatus}`);
  });

  await check('скрытие убирает карточку из каталога, но дату публикации сохраняет', async () => {
    const { body: before } = await req(`/admin/specialists/${specialistId}`, { token: adminToken });
    const { body: cats } = await req('/admin/categories', { token: adminToken });
    const beauty = cats.find((c) => c.slug === 'beauty');

    const { body: after } = await req(`/admin/specialists/${specialistId}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({
        displayName: 'Тестовый Мастер',
        slug: 'test-master',
        city: 'Казань',
        status: 'HIDDEN',
        isPromoted: false,
        categoryIds: [beauty.id],
      }),
    });
    assert(after.publishedAt === before.publishedAt, 'дата публикации изменилась при скрытии');

    const { status } = await req('/specialists/test-master');
    assert(status === 404, `скрытая карточка всё ещё видна: ${status}`);
  });

  await check('смена категорий переписывает связи, а не добавляет к ним', async () => {
    const { body: cats } = await req('/admin/categories', { token: adminToken });
    const repair = cats.find((c) => c.slug === 'repair');

    const { body } = await req(`/admin/specialists/${specialistId}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({
        displayName: 'Тестовый Мастер',
        slug: 'test-master',
        city: 'Казань',
        status: 'ACTIVE',
        isPromoted: false,
        categoryIds: [repair.id],
      }),
    });
    assert(body.categories.length === 1, `категорий стало ${body.categories.length}, ожидалась 1`);
    assert(body.categories[0].category.slug === 'repair', 'категория не заменилась');
  });

  await check('фильтр по статусу в админке работает', async () => {
    const { body } = await req('/admin/specialists?status=ACTIVE', { token: adminToken });
    assert(body.items.every((s) => s.status === 'ACTIVE'), 'в выдаче есть карточки с другим статусом');
  });

  await check('поиск по городу в админке работает', async () => {
    const { body } = await req('/admin/specialists?q=' + encodeURIComponent('Казань'), { token: adminToken });
    assert(body.total === 1, `найдено ${body.total}, ожидалась 1`);
  });

  console.log('\nПодписки:\n');

  await check('отметка об оплате включает продвижение', async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { status } = await req(`/admin/specialists/${specialistId}/subscriptions`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        plan: 'month',
        startsAt: now.toISOString(),
        endsAt: later.toISOString(),
        amount: 150000,
        currency: 'RUB',
        note: 'перевод на карту',
      }),
    });
    assert(status === 201 || status === 200, `статус ${status}`);

    const { body: card } = await req(`/admin/specialists/${specialistId}`, { token: adminToken });
    assert(card.isPromoted === true, 'продвижение не включилось');
    assert(card.subscriptionUntil, 'subscriptionUntil не проставлен');
  });

  await check('подписка с датой окончания раньше начала отклоняется', async () => {
    const now = new Date();
    const { status } = await req(`/admin/specialists/${specialistId}/subscriptions`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        plan: 'month',
        startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() - 1000).toISOString(),
        currency: 'RUB',
      }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('продвинутая карточка поднимается в выдаче каталога', async () => {
    const { body } = await req('/specialists');
    assert(body.items[0].slug === 'test-master', `сверху оказался ${body.items[0].slug}`);
    assert(body.items[0].isPromoted === true, 'признак продвижения не пришёл');
  });

  await check('истёкшая подписка снимает продвижение', async () => {
    sql(`UPDATE specialists SET \"subscriptionUntil\"=NOW() - INTERVAL '1 day' WHERE id='${specialistId}'`);
    const { status, body } = await req('/admin/subscriptions/expire', { method: 'POST', token: adminToken });
    assert(status === 201 || status === 200, `статус ${status}`);
    assert(body.expired >= 1, `снято с ${body.expired} карточек, ожидалась минимум 1`);

    const { body: card } = await req(`/admin/specialists/${specialistId}`, { token: adminToken });
    assert(card.isPromoted === false, 'продвижение осталось включённым');
  });

  console.log('\nЖурнал и удаление:\n');

  await check('действия администратора записаны в журнал', async () => {
    const count = Number(sql(`SELECT count(*) FROM audit_logs WHERE \"actorId\" IS NOT NULL`));
    assert(count > 0, 'журнал пуст');
    const actions = sql(`SELECT string_agg(DISTINCT action, ',') FROM audit_logs`);
    assert(actions.includes('specialist.create'), `в журнале нет создания карточки: ${actions}`);
    assert(actions.includes('subscription.create'), `в журнале нет отметки об оплате: ${actions}`);
  });

  await check('категорию со специалистами удалить нельзя', async () => {
    const { body: cats } = await req('/admin/categories', { token: adminToken });
    const repair = cats.find((c) => c.slug === 'repair');
    const { status, body } = await req(`/admin/categories/${repair.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'CATEGORY_IN_USE', `код: ${body.code}`);
  });

  await check('пустая категория удаляется', async () => {
    const { status } = await req(`/admin/categories/${categoryId}`, { method: 'DELETE', token: adminToken });
    assert(status === 204, `статус ${status}`);
  });

  await check('карточка удаляется вместе со связями', async () => {
    const { status } = await req(`/admin/specialists/${specialistId}`, { method: 'DELETE', token: adminToken });
    assert(status === 204, `статус ${status}`);
    const left = Number(sql(`SELECT count(*) FROM specialist_categories WHERE \"specialistId\"='${specialistId}'`));
    assert(left === 0, `осталось ${left} связей с категориями`);
  });

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Сценарий прерван:', error);
  process.exit(1);
});
