/**
 * Сквозная проверка API против живой базы.
 * Проходит путь настоящего пользователя: каталог → поиск → профиль →
 * авторизация по подписи Telegram → отзыв → модерация → рейтинг.
 *
 * Перед запуском:
 *   1. база наполнена сидом:  npm run db:seed
 *   2. API запущен с тем же токеном, что указан в BOT_TOKEN ниже:
 *      TELEGRAM_BOT_TOKEN=123456:TEST-TOKEN-FOR-VERIFICATION npm run start -w @app/api
 *
 * Сценарий пишет в базу, поэтому гоняйте его на тестовой, а не на боевой.
 * Сброс между прогонами — npm run test:e2e:reset -w @app/api.
 */
const { createHmac } = require('node:crypto');

const BASE = 'http://localhost:3000/api';
const BOT_TOKEN = process.env.TEST_BOT_TOKEN || '123456:TEST-TOKEN-FOR-VERIFICATION';

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
      ...options.headers,
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
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAHtest',
    user: JSON.stringify(user),
  };
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

async function main() {
  console.log('Каталог и поиск:\n');

  let categories;
  await check('GET /categories возвращает категории со счётчиками', async () => {
    const { status, body } = await req('/categories');
    assert(status === 200, `статус ${status}`);
    assert(Array.isArray(body) && body.length === 10, `ожидалось 10 категорий, пришло ${body?.length}`);
    const beauty = body.find((c) => c.slug === 'beauty');
    assert(beauty, 'категория beauty не найдена');
    assert(beauty.specialistCount === 1, `счётчик beauty = ${beauty.specialistCount}, ожидался 1`);
    categories = body;
  });

  await check('GET /specialists отдаёт опубликованные карточки', async () => {
    const { status, body } = await req('/specialists');
    assert(status === 200, `статус ${status}`);
    assert(body.total === 5, `total = ${body.total}, ожидалось 5`);
    assert(body.items[0].categories.length > 0, 'категории не подтянулись в карточку');
  });

  await check('поиск по услуге находит мастера (услуга в прайсе, не в имени)', async () => {
    const { body } = await req('/specialists?q=' + encodeURIComponent('маникюр'));
    assert(body.total >= 1, `ничего не найдено по слову «маникюр»`);
    assert(body.items.some((s) => s.slug === 'anna-manicure'), 'Анна не найдена по названию услуги');
  });

  await check('поиск нечувствителен к регистру', async () => {
    const { body } = await req('/specialists?q=' + encodeURIComponent('САНТЕХНИК'));
    assert(body.total >= 1, 'поиск в верхнем регистре ничего не дал');
  });

  await check('фильтр по категории работает', async () => {
    const { body } = await req('/specialists?categorySlug=tutors');
    assert(body.total === 1, `в категории tutors ${body.total} карточек, ожидалась 1`);
    assert(body.items[0].slug === 'marina-english', 'найден не тот специалист');
  });

  await check('фильтр по несуществующей категории даёт пустой список, а не ошибку', async () => {
    const { status, body } = await req('/specialists?categorySlug=nonexistent');
    assert(status === 200, `статус ${status}`);
    assert(body.total === 0, `ожидалось 0, пришло ${body.total}`);
  });

  console.log('\nГео-поиск:\n');

  // Точка на Тверской. Ольга работает там же, Дмитрий — в 17 км на юге.
  const TVERSKAYA = 'lat=55.7601&lng=37.6110';

  await check('поиск рядом сортирует по расстоянию и считает километры', async () => {
    const { status, body } = await req(`/specialists?${TVERSKAYA}&sort=distance&radiusKm=50`);
    assert(status === 200, `статус ${status}`);
    assert(body.items.length > 0, 'никого не нашли в радиусе 50 км');
    assert(body.items[0].distanceKm !== undefined, 'distanceKm отсутствует');
    assert(body.items[0].distanceKm < 0.1, `ближайший в ${body.items[0].distanceKm} км, ожидался почти ноль`);
    const distances = body.items.map((s) => s.distanceKm);
    const sorted = [...distances].sort((a, b) => a - b);
    assert(JSON.stringify(distances) === JSON.stringify(sorted), `порядок нарушен: ${distances}`);
  });

  await check('малый радиус отсекает дальних', async () => {
    const { body: wide } = await req(`/specialists?${TVERSKAYA}&sort=distance&radiusKm=50`);
    const { body: narrow } = await req(`/specialists?${TVERSKAYA}&sort=distance&radiusKm=1`);
    assert(narrow.total < wide.total, `радиус 1 км дал ${narrow.total}, радиус 50 км — ${wide.total}`);
    assert(narrow.total >= 1, 'в радиусе 1 км не нашлось никого, хотя мастер там есть');
  });

  await check('сортировка по расстоянию без координат отклоняется', async () => {
    const { status } = await req('/specialists?sort=distance');
    assert(status === 400, `статус ${status}, ожидался 400`);
  });

  await check('одна координата без второй отклоняется', async () => {
    const { status } = await req('/specialists?lat=55.76');
    assert(status === 400, `статус ${status}, ожидался 400`);
  });

  await check('карта отдаёт маркеры в границах области', async () => {
    const { status, body } = await req('/specialists/map?north=56&south=55.5&east=38&west=37');
    assert(status === 200, `статус ${status}`);
    assert(body.length === 5, `в границах ${body.length} маркеров, ожидалось 5`);
    assert(body.every((s) => s.lat !== null && s.lng !== null), 'маркер без координат');
  });

  await check('карта не отдаёт то, что вне области', async () => {
    const { body } = await req('/specialists/map?north=60&south=59&east=31&west=30');
    assert(body.length === 0, `в Петербурге нашлось ${body.length} маркеров, ожидалось 0`);
  });

  console.log('\nПрофиль специалиста:\n');

  await check('профиль открывается по slug', async () => {
    const { status, body } = await req('/specialists/anna-manicure');
    assert(status === 200, `статус ${status}`);
    assert(body.displayName === 'Анна Соколова', `имя: ${body.displayName}`);
    assert(body.services.length === 3, `услуг ${body.services.length}, ожидалось 3`);
    assert(body.contacts.telegram === '@anna_nails_demo', 'контакт Telegram потерян');
    assert(body.ratingBreakdown['5'] === 0, 'разбивка оценок не инициализирована');
    assert(body.myReview === null, 'у гостя не должно быть своего отзыва');
  });

  await check('несуществующий профиль даёт 404 с кодом', async () => {
    const { status, body } = await req('/specialists/no-such-master');
    assert(status === 404, `статус ${status}`);
    assert(body.code === 'SPECIALIST_NOT_FOUND', `код: ${body.code}`);
  });

  console.log('\nАвторизация через подпись Telegram:\n');

  let token;
  let userId;
  await check('валидная initData принимается, выдаётся JWT', async () => {
    const initData = makeInitData({ id: 555000111, first_name: 'Денис', username: 'denis_test', language_code: 'ru' });
    const { status, body } = await req('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.token, 'токен не выдан');
    assert(body.user.firstName === 'Денис', `имя: ${body.user.firstName}`);
    assert(body.user.telegramId === '555000111', `telegramId пришёл как ${body.user.telegramId} (BigInt не сериализовался?)`);
    token = body.token;
    userId = body.user.id;
  });

  await check('поддельная initData отклоняется', async () => {
    const initData = makeInitData({ id: 555000111, first_name: 'Денис' }).replace('555000111', '999999999');
    const { status, body } = await req('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
    assert(status === 401, `статус ${status}`);
    assert(body.code === 'INVALID_INIT_DATA', `код: ${body.code}`);
  });

  await check('GET /auth/me по выданному токену', async () => {
    const { status, body } = await req('/auth/me', { token });
    assert(status === 200, `статус ${status}`);
    assert(body.id === userId, 'вернулся другой пользователь');
  });

  await check('личный кабинет без токена даёт 401', async () => {
    const { status } = await req('/me/history');
    assert(status === 401, `статус ${status}`);
  });

  await check('битый токен даёт 401', async () => {
    const { status, body } = await req('/auth/me', { token: 'not.a.valid.jwt' });
    assert(status === 401, `статус ${status}`);
    assert(body.code === 'INVALID_TOKEN', `код: ${body.code}`);
  });

  console.log('\nПросмотры, отзывы и рейтинг:\n');

  let specialistId;
  await check('просмотр профиля попадает в историю', async () => {
    const { body: profile } = await req('/specialists/anna-manicure', { token });
    specialistId = profile.id;
    // Запись просмотра идёт в фоне — даём ей завершиться.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { body: history } = await req('/me/history', { token });
    assert(history.length === 1, `в истории ${history.length} записей, ожидалась 1`);
    assert(history[0].specialist.slug === 'anna-manicure', 'в истории не тот специалист');
  });

  let reviewId;
  await check('отзыв создаётся и уходит на модерацию', async () => {
    const { status, body } = await req(`/specialists/${specialistId}/reviews`, {
      method: 'POST',
      token,
      body: JSON.stringify({ rating: 5, text: 'Отличная работа, всё аккуратно' }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.status === 'PENDING', `статус отзыва: ${body.status}`);
    reviewId = body.id;
  });

  await check('неодобренный отзыв не влияет на рейтинг', async () => {
    const { body } = await req('/specialists/anna-manicure');
    assert(body.ratingCount === 0, `ratingCount = ${body.ratingCount}, ожидался 0`);
    assert(body.ratingAvg === 0, `ratingAvg = ${body.ratingAvg}, ожидался 0`);
  });

  await check('неодобренный отзыв не виден в публичном списке', async () => {
    const { body } = await req(`/specialists/${specialistId}/reviews`);
    assert(body.total === 0, `в публичном списке ${body.total} отзывов, ожидалось 0`);
  });

  await check('свой отзыв виден автору в профиле', async () => {
    const { body } = await req('/specialists/anna-manicure', { token });
    assert(body.myReview !== null, 'myReview пуст');
    assert(body.myReview.status === 'PENDING', `статус: ${body.myReview.status}`);
  });

  await check('оценка вне диапазона 1..5 отклоняется', async () => {
    const { status } = await req(`/specialists/${specialistId}/reviews`, {
      method: 'POST',
      token,
      body: JSON.stringify({ rating: 9 }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('повторный отзыв заменяет прежний, а не создаёт второй', async () => {
    const { status, body } = await req(`/specialists/${specialistId}/reviews`, {
      method: 'POST',
      token,
      body: JSON.stringify({ rating: 4, text: 'Поправляю оценку' }),
    });
    assert(status === 201 || status === 200, `статус ${status}`);
    assert(body.id === reviewId, 'создан новый отзыв вместо замены прежнего');
    assert(body.rating === 4, `оценка: ${body.rating}`);
  });

  await check('обычный пользователь не попадает в админку', async () => {
    const { status } = await req('/admin/stats', { token });
    assert(status === 403, `статус ${status}, ожидался 403`);
  });

  console.log('\nМодерация и пересчёт рейтинга:\n');

  // Повышаем тестового пользователя до администратора прямо в базе —
  // так же, как это делал бы владелец проекта через Prisma Studio.
  const { execSync } = require('node:child_process');
  const PSQL = process.env.PSQL_BIN || 'psql';
  const DB_URL = process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/tgspec';
  execSync(`${PSQL} "${DB_URL}" -c "UPDATE users SET role='ADMIN' WHERE \\"telegramId\\"=555000111;"`, { stdio: 'ignore' });

  let adminToken;
  await check('после смены роли выдаётся токен администратора', async () => {
    const initData = makeInitData({ id: 555000111, first_name: 'Денис', username: 'denis_test' });
    const { body } = await req('/auth/telegram', { method: 'POST', body: JSON.stringify({ initData }) });
    assert(body.user.role === 'ADMIN', `роль: ${body.user.role}`);
    adminToken = body.token;
  });

  await check('очередь модерации содержит наш отзыв', async () => {
    const { status, body } = await req('/admin/reviews/pending', { token: adminToken });
    assert(status === 200, `статус ${status}`);
    assert(body.total === 1, `в очереди ${body.total}, ожидался 1`);
  });

  await check('отклонение без причины запрещено', async () => {
    const { status } = await req(`/admin/reviews/${reviewId}`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ action: 'reject' }),
    });
    assert(status === 400, `статус ${status}, ожидался 400`);
  });

  await check('одобрение публикует отзыв и пересчитывает рейтинг', async () => {
    const { status, body } = await req(`/admin/reviews/${reviewId}`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ action: 'approve' }),
    });
    assert(status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.status === 'APPROVED', `статус: ${body.status}`);

    const { body: profile } = await req('/specialists/anna-manicure');
    assert(profile.ratingCount === 1, `ratingCount = ${profile.ratingCount}, ожидался 1`);
    assert(profile.ratingAvg === 4, `ratingAvg = ${profile.ratingAvg}, ожидался 4`);
    assert(profile.ratingBreakdown['4'] === 1, 'разбивка оценок не обновилась');
  });

  await check('одобренный отзыв появился в публичном списке', async () => {
    const { body } = await req(`/specialists/${specialistId}/reviews`);
    assert(body.total === 1, `отзывов ${body.total}, ожидался 1`);
    assert(body.items[0].author.firstName === 'Денис', 'автор не подтянулся');
  });

  await check('фильтр по минимальному рейтингу учитывает пересчёт', async () => {
    const { body } = await req('/specialists?minRating=4');
    assert(body.total === 1, `с рейтингом 4+ найдено ${body.total}, ожидался 1`);
  });

  await check('статистика админки отражает реальные данные', async () => {
    const { status, body } = await req('/admin/stats', { token: adminToken });
    assert(status === 200, `статус ${status}`);
    assert(body.specialists.active === 5, `активных ${body.specialists.active}`);
    assert(body.reviews.total === 1, `отзывов ${body.reviews.total}`);
    assert(body.reviews.pending === 0, `в очереди ${body.reviews.pending}, ожидался 0`);
    assert(body.topViewed.length > 0, 'топ просмотров пуст');
  });

  await check('удаление своего отзыва возвращает рейтинг к нулю', async () => {
    const { status } = await req(`/reviews/${reviewId}`, { method: 'DELETE', token });
    assert(status === 204, `статус ${status}`);
    const { body: profile } = await req('/specialists/anna-manicure');
    assert(profile.ratingCount === 0, `ratingCount = ${profile.ratingCount}, ожидался 0`);
    assert(profile.ratingAvg === 0, `ratingAvg = ${profile.ratingAvg}, ожидался 0`);
  });

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Сценарий прерван:', error);
  process.exit(1);
});
