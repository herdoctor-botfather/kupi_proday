/**
 * Проверка выбора роли и самостоятельной подачи анкеты специалистом:
 * подача → модерация → публикация → правка → повторная проверка.
 *
 * Перед запуском: база наполнена сидом, API запущен с тем же токеном,
 * что указан в TEST_BOT_TOKEN. Сброс: npm run test:e2e:reset -w @app/api
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

const login = async (id, firstName) => {
  const { body } = await req('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData: makeInitData({ id, first_name: firstName }) }),
  });
  return body;
};

// Через execFileSync, а не execSync: оболочка съедает кавычки вокруг
// имён столбцов, и PostgreSQL перестаёт узнавать "telegramId".
const sql = (query) => execFileSync(PSQL, [DB_URL, '-tAc', query], { encoding: 'utf8' }).trim();

async function main() {
  const MASTER_TG = 810000001;
  const CLIENT_TG = 810000002;
  const ADMIN_TG = 810000003;
  // Отдельный аккаунт для проверки смены роли: заводить анкету у CLIENT_TG
  // нельзя — на её отсутствие опираются проверки ниже.
  const SWITCHER_TG = 810000004;

  console.log('Выбор роли на стартовом экране:\n');

  let masterToken;
  await check('новый пользователь приходит без выбранной роли', async () => {
    const auth = await login(MASTER_TG, 'Мастер');
    assert(auth.user.onboardedAs === null, `onboardedAs = ${auth.user.onboardedAs}, ожидался null`);
    assert(auth.user.hasSpecialistProfile === false, 'анкеты быть не должно');
    masterToken = auth.token;
  });

  let clientToken;
  await check('выбор «заказчик» сохраняется', async () => {
    const auth = await login(CLIENT_TG, 'Клиент');
    clientToken = auth.token;
    const { status, body } = await req('/auth/onboarding', {
      method: 'PATCH',
      token: clientToken,
      body: JSON.stringify({ role: 'CLIENT' }),
    });
    assert(status === 200, `статус ${status}`);
    assert(body.onboardedAs === 'CLIENT', `onboardedAs = ${body.onboardedAs}`);
  });

  await check('выбор переживает повторный вход', async () => {
    const auth = await login(CLIENT_TG, 'Клиент');
    assert(auth.user.onboardedAs === 'CLIENT', `после входа: ${auth.user.onboardedAs}`);
  });

  await check('недопустимое значение роли отклоняется', async () => {
    const { status } = await req('/auth/onboarding', {
      method: 'PATCH',
      token: clientToken,
      body: JSON.stringify({ role: 'SOMETHING' }),
    });
    assert(status === 400, `статус ${status}`);
  });

  let switcherToken;
  await check('роль меняется в обе стороны, а не выбирается один раз', async () => {
    // Сценарий из жизни: человек пришёл искать мастера, а через неделю решил
    // разместить свою анкету. Если бы роль фиксировалась навсегда, он застрял бы.
    const auth = await login(SWITCHER_TG, 'Передумавший');
    switcherToken = auth.token;

    for (const role of ['CLIENT', 'SPECIALIST', 'CLIENT']) {
      const { status, body } = await req('/auth/onboarding', {
        method: 'PATCH',
        token: switcherToken,
        body: JSON.stringify({ role }),
      });
      assert(status === 200, `${role}: статус ${status}`);
      assert(body.onboardedAs === role, `${role}: пришло ${body.onboardedAs}`);
    }
  });

  await check('без авторизации роль не сохранить', async () => {
    const { status } = await req('/auth/onboarding', { method: 'PATCH', body: JSON.stringify({ role: 'CLIENT' }) });
    assert(status === 401, `статус ${status}`);
  });

  console.log('\nПодача анкеты:\n');

  await check('до подачи своя анкета пуста', async () => {
    const { status, body } = await req('/me/specialist', { token: masterToken });
    assert(status === 200, `статус ${status}`);
    assert(body === null || body === '', `ожидался null, пришло ${JSON.stringify(body)}`);
  });

  let categoryIds;
  await check('анкета без категории отклоняется, категории загружаются', async () => {
    const { body: cats } = await req('/categories');
    categoryIds = [cats.find((c) => c.slug === 'beauty').id];

    // Контакты в анкете больше не собираются — связь идёт через чат,
    // поэтому прежнее требование «укажите способ связи» отменено.
    const { status } = await req('/me/specialist', {
      method: 'POST',
      token: masterToken,
      body: JSON.stringify({ displayName: 'Мастер', city: 'Казань', categoryIds: [], services: [] }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('одна координата без второй отклоняется', async () => {
    const { status } = await req('/me/specialist', {
      method: 'POST',
      token: masterToken,
      body: JSON.stringify({
        displayName: 'Мастер', city: 'Казань', phone: '+79000000000',
        categoryIds, services: [], lat: 55.79,
      }),
    });
    assert(status === 400, `статус ${status}`);
  });

  let specialistId;
  let slug;
  await check('корректная анкета принимается и уходит на проверку', async () => {
    const { status, body } = await req('/me/specialist', {
      method: 'POST',
      token: masterToken,
      body: JSON.stringify({
        displayName: 'Ирина Кузнецова',
        headline: 'Парикмахер-стилист',
        about: 'Стрижки, окрашивание, уход.',
        city: 'Казань',
        address: 'ул. Баумана, 10',
        lat: 55.7903, lng: 49.1221,
        categoryIds,
        services: [
          { name: 'Женская стрижка', price: 2000, priceIsFrom: false },
          { name: 'Окрашивание', price: 4500, priceIsFrom: true },
        ],
      }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.status === 'PENDING', `статус анкеты: ${body.status}`);
    assert(body.services.length === 2, `услуг ${body.services.length}`);
    // Цена введена в рублях, храниться должна в копейках.
    assert(body.services[0].priceAmount === 200000, `цена ${body.services[0].priceAmount}, ожидалось 200000`);
    specialistId = body.id;
  });

  await check('адрес карточки сгенерирован транслитерацией', async () => {
    const { body } = await req('/me/specialist', { token: masterToken });
    assert(body.slug === 'irina-kuznetsova', `slug: ${body.slug}`);
    slug = body.slug;
  });

  await check('подача анкеты фиксирует роль специалиста', async () => {
    const auth = await login(MASTER_TG, 'Мастер');
    assert(auth.user.onboardedAs === 'SPECIALIST', `onboardedAs = ${auth.user.onboardedAs}`);
    assert(auth.user.hasSpecialistProfile === true, 'признак анкеты не выставлен');
  });

  await check('непроверенная анкета не видна в каталоге', async () => {
    const { status } = await req(`/specialists/${slug}`);
    assert(status === 404, `статус ${status}`);
    const { body: list } = await req('/specialists?q=' + encodeURIComponent('Кузнецова'));
    assert(list.total === 0, `в поиске нашлось ${list.total}`);
  });

  await check('вторую анкету завести нельзя', async () => {
    const { status, body } = await req('/me/specialist', {
      method: 'POST',
      token: masterToken,
      body: JSON.stringify({ displayName: 'Дубль', city: 'Казань', phone: '+79001112233', categoryIds, services: [] }),
    });
    assert(status === 409, `статус ${status}`);
    assert(body.code === 'PROFILE_EXISTS', `код: ${body.code}`);
  });

  console.log('\nМодерация анкеты:\n');

  await login(ADMIN_TG, 'Админ');
  sql(`UPDATE users SET role='ADMIN' WHERE \"telegramId\"=${ADMIN_TG}`);
  const adminAuth = await login(ADMIN_TG, 'Админ');
  const adminToken = adminAuth.token;

  await check('анкета видна в очереди заявок', async () => {
    const { status, body } = await req('/admin/applications', { token: adminToken });
    assert(status === 200, `статус ${status}`);
    assert(body.pending.length === 1, `в очереди ${body.pending.length}`);
    assert(body.pending[0].id === specialistId, 'в очереди не та анкета');
    assert(body.changed.length === 0, 'правок быть не должно');
  });

  await check('отклонение без причины запрещено', async () => {
    const { status } = await req(`/admin/specialists/${specialistId}/moderate`, {
      method: 'PATCH', token: adminToken, body: JSON.stringify({ action: 'reject' }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('отклонение возвращает причину владельцу', async () => {
    const { status } = await req(`/admin/specialists/${specialistId}/moderate`, {
      method: 'PATCH', token: adminToken,
      body: JSON.stringify({ action: 'reject', reason: 'Добавьте фотографию работ' }),
    });
    assert(status === 200, `статус ${status}`);

    const { body: mine } = await req('/me/specialist', { token: masterToken });
    assert(mine.status === 'HIDDEN', `статус: ${mine.status}`);
    assert(mine.rejectionReason === 'Добавьте фотографию работ', `причина: ${mine.rejectionReason}`);
  });

  await check('правка отклонённой анкеты снова отправляет её на проверку', async () => {
    const { status, body } = await req('/me/specialist', {
      method: 'PUT', token: masterToken,
      body: JSON.stringify({
        displayName: 'Ирина Кузнецова', headline: 'Парикмахер-стилист', city: 'Казань', photoUrl: 'https://example.com/photo.jpg',
        categoryIds, services: [{ name: 'Женская стрижка', price: 2000, priceIsFrom: false }],
      }),
    });
    assert(status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.status === 'PENDING', `статус: ${body.status}`);
    assert(body.rejectionReason === null, 'причина отклонения не сброшена');
  });

  await check('одобрение публикует анкету в каталоге', async () => {
    const { status } = await req(`/admin/specialists/${specialistId}/moderate`, {
      method: 'PATCH', token: adminToken, body: JSON.stringify({ action: 'approve' }),
    });
    assert(status === 200, `статус ${status}`);

    const { status: publicStatus, body } = await req(`/specialists/${slug}`);
    assert(publicStatus === 200, `в каталоге: статус ${publicStatus}`);
    assert(body.displayName === 'Ирина Кузнецова', 'имя не совпало');
  });

  console.log('\nПравка опубликованной анкеты:\n');

  await check('правка не снимает анкету с публикации', async () => {
    const { body } = await req('/me/specialist', {
      method: 'PUT', token: masterToken,
      body: JSON.stringify({
        displayName: 'Ирина Кузнецова', headline: 'Парикмахер-стилист, 10 лет опыта', city: 'Казань', categoryIds,
        services: [{ name: 'Женская стрижка', price: 2500, priceIsFrom: false }],
      }),
    });
    assert(body.status === 'ACTIVE', `статус: ${body.status}`);
    assert(body.needsReview === true, 'правка не помечена для проверки');

    const { status } = await req(`/specialists/${slug}`);
    assert(status === 200, `карточка пропала из каталога: ${status}`);
  });

  await check('правка попадает в очередь повторной проверки', async () => {
    const { body } = await req('/admin/applications', { token: adminToken });
    assert(body.changed.length === 1, `правок в очереди: ${body.changed.length}`);
    assert(body.pending.length === 0, `новых заявок: ${body.pending.length}`);
  });

  await check('подтверждение правки снимает отметку', async () => {
    await req(`/admin/specialists/${specialistId}/moderate`, {
      method: 'PATCH', token: adminToken, body: JSON.stringify({ action: 'approve' }),
    });
    const { body } = await req('/me/specialist', { token: masterToken });
    assert(body.needsReview === false, 'отметка осталась');
    assert(body.status === 'ACTIVE', `статус: ${body.status}`);
  });

  console.log('\nУправление видимостью:\n');

  await check('специалист может сам скрыть анкету', async () => {
    const { status, body } = await req('/me/specialist/hide', { method: 'POST', token: masterToken });
    assert(status === 201 || status === 200, `статус ${status}`);
    assert(body.status === 'HIDDEN', `статус: ${body.status}`);

    const { status: publicStatus } = await req(`/specialists/${slug}`);
    assert(publicStatus === 404, `скрытая анкета видна: ${publicStatus}`);
  });

  await check('ранее одобренная анкета возвращается без повторной модерации', async () => {
    const { body } = await req('/me/specialist/publish', { method: 'POST', token: masterToken });
    assert(body.status === 'ACTIVE', `статус: ${body.status}`);
    const { status } = await req(`/specialists/${slug}`);
    assert(status === 200, `в каталоге: ${status}`);
  });

  await check('чужую анкету через свой кабинет не тронуть', async () => {
    // У заказчика анкеты нет — правка должна вернуть 404, а не задеть чужую.
    const { status } = await req('/me/specialist', {
      method: 'PUT', token: clientToken,
      body: JSON.stringify({ displayName: 'Захват', city: 'Казань', phone: '+79000000000', categoryIds, services: [] }),
    });
    assert(status === 404, `статус ${status}`);
    const { body } = await req(`/specialists/${slug}`);
    assert(body.displayName === 'Ирина Кузнецова', 'чужая анкета изменилась');
  });

  await check('заблокированную анкету владелец не редактирует', async () => {
    sql(`UPDATE specialists SET status='BLOCKED' WHERE id='${specialistId}'`);
    const { status, body } = await req('/me/specialist', {
      method: 'PUT', token: masterToken,
      body: JSON.stringify({ displayName: 'Обход', city: 'Казань', phone: '+79000000000', categoryIds, services: [] }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'PROFILE_BLOCKED', `код: ${body.code}`);
  });

  await check('вчерашний заказчик подаёт анкету, не переключая роль вручную', async () => {
    const { body: cats } = await req('/categories');
    const { status, body } = await req('/me/specialist', {
      method: 'POST',
      token: switcherToken,
      body: JSON.stringify({
        displayName: 'Передумавший Заказчик',
        city: 'Тверь',
        categoryIds: [cats.find((c) => c.slug === 'repair').id],
        services: [],
      }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.status === 'PENDING', `статус анкеты: ${body.status}`);

    // Подача анкеты сама переводит роль — переключать заранее не требуется.
    const auth = await login(SWITCHER_TG, 'Передумавший');
    assert(auth.user.onboardedAs === 'SPECIALIST', `роль: ${auth.user.onboardedAs}`);
    assert(auth.user.hasSpecialistProfile === true, 'признак анкеты не выставлен');
  });

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Сценарий прерван:', error);
  process.exit(1);
});
