/**
 * Проверка внутреннего чата: доступ участников, скрытие контактов
 * в сообщениях, счётчики непрочитанного и отсутствие контактов в анкете.
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
  const MASTER_TG = 840000001;
  const CLIENT_TG = 840000002;
  const STRANGER_TG = 840000003;
  const ADMIN_TG = 840000004;

  const master = await login(MASTER_TG, 'Мастер');
  const client = await login(CLIENT_TG, 'Клиент');
  const stranger = await login(STRANGER_TG, 'Посторонний');
  await login(ADMIN_TG, 'Админ');
  sql(`UPDATE users SET role='ADMIN' WHERE \"telegramId\"=${ADMIN_TG}`);
  const admin = await login(ADMIN_TG, 'Админ');

  const { body: cats } = await req('/categories');
  const { body: profile } = await req('/me/specialist', {
    method: 'POST',
    token: master.token,
    body: JSON.stringify({
      displayName: 'Пётр Чатов',
      city: 'Сочи',
      categoryIds: [cats.find((c) => c.slug === 'repair').id],
      services: [],
    }),
  });

  console.log('Анкета без контактов:\n');

  await check('анкета принимается без единого контакта', async () => {
    // Раньше схема требовала хотя бы один способ связи. Теперь связь —
    // это чат, и контакты в анкете не собираются вовсе.
    assert(profile?.id, `анкета не создалась: ${JSON.stringify(profile)}`);
    assert(profile.status === 'PENDING', `статус: ${profile.status}`);
  });

  await req(`/admin/specialists/${profile.id}/moderate`, {
    method: 'PATCH',
    token: admin.token,
    body: JSON.stringify({ action: 'approve' }),
  });

  await check('в публичной карточке нет поля контактов', async () => {
    const { body } = await req(`/specialists/${profile.id}`);
    assert(body.contacts === undefined, `контакты отдаются наружу: ${JSON.stringify(body.contacts)}`);
  });

  console.log('\nДоступ к переписке:\n');

  let conversationId;
  await check('заказчик открывает диалог', async () => {
    const { status, body } = await req('/chat/conversations', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ specialistId: profile.id }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.role === 'CLIENT', `роль: ${body.role}`);
    assert(body.peer.name === 'Пётр Чатов', `собеседник: ${body.peer.name}`);
    conversationId = body.id;
  });

  await check('повторное открытие возвращает тот же диалог', async () => {
    const { body } = await req('/chat/conversations', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ specialistId: profile.id }),
    });
    assert(body.id === conversationId, 'создан второй диалог вместо существующего');
  });

  await check('специалист не может написать сам себе', async () => {
    const { status, body } = await req('/chat/conversations', {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({ specialistId: profile.id }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'SELF_CHAT', `код: ${body.code}`);
  });

  await check('посторонний не видит чужую переписку', async () => {
    const { status, body } = await req(`/chat/conversations/${conversationId}`, { token: stranger.token });
    // Отвечаем «не найдено», а не «нет доступа»: иначе перебором можно
    // выяснить, какие диалоги существуют.
    assert(status === 404, `статус ${status}`);
    assert(body.code === 'CONVERSATION_NOT_FOUND', `код: ${body.code}`);
  });

  await check('посторонний не может писать в чужой диалог', async () => {
    const { status } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: stranger.token,
      body: JSON.stringify({ text: 'Влезаю в разговор' }),
    });
    assert(status === 404, `статус ${status}`);
  });

  await check('без авторизации чат недоступен', async () => {
    const { status } = await req('/chat/conversations');
    assert(status === 401, `статус ${status}`);
  });

  console.log('\nСообщения и скрытие контактов:\n');

  await check('обычное сообщение доходит без изменений', async () => {
    const { status, body } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ text: 'Здравствуйте! Сколько стоит замена смесителя?' }),
    });
    assert(status === 201 || status === 200, `статус ${status}`);
    assert(body.text === 'Здравствуйте! Сколько стоит замена смесителя?', `текст изменён: ${body.text}`);
    assert(body.hasMaskedContacts === false, 'ложное срабатывание фильтра');
    assert(body.isMine === true, 'сообщение не помечено своим');
  });

  await check('телефон в сообщении скрывается', async () => {
    const { body } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({ text: 'Позвоните мне на +7 900 123-45-67, так быстрее' }),
    });
    assert(!body.text.includes('123-45-67'), `телефон просочился: ${body.text}`);
    assert(body.text.includes('[контакт скрыт]'), `нет метки: ${body.text}`);
    assert(body.hasMaskedContacts === true, 'признак скрытия не выставлен');
  });

  await check('исходник сохраняется для разбора жалоб', async () => {
    const original = sql(
      `SELECT \"originalText\" FROM messages WHERE \"hasMaskedContacts\" = true ORDER BY \"createdAt\" DESC LIMIT 1`,
    );
    assert(original.includes('123-45-67'), `исходник не сохранён: ${original}`);
  });

  await check('исходник не хранится, когда скрывать нечего', async () => {
    const empty = sql(
      `SELECT count(*) FROM messages WHERE \"hasMaskedContacts\" = false AND \"originalText\" IS NOT NULL`,
    );
    assert(empty === '0', `лишних копий: ${empty}`);
  });

  await check('сообщение из одних контактов отклоняется', async () => {
    const { status, body } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({ text: '+79001234567' }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'EMPTY_MESSAGE', `код: ${body.code}`);
  });

  await check('пустое сообщение отклоняется', async () => {
    const { status } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ text: '   ' }),
    });
    assert(status === 400, `статус ${status}`);
  });

  console.log('\nНепрочитанное:\n');

  await check('получатель видит непрочитанное, отправитель — нет', async () => {
    const { body: forClient } = await req('/chat/unread', { token: client.token });
    const { body: forMaster } = await req('/chat/unread', { token: master.token });
    // Клиент отправил одно, мастер ответил одним: у клиента одно непрочитанное.
    assert(forClient.count === 1, `у заказчика ${forClient.count}, ожидалось 1`);
    assert(forMaster.count === 1, `у специалиста ${forMaster.count}, ожидалось 1`);
  });

  await check('открытие переписки обнуляет счётчик', async () => {
    await req(`/chat/conversations/${conversationId}`, { token: client.token });
    const { body } = await req('/chat/unread', { token: client.token });
    assert(body.count === 0, `осталось ${body.count}`);
  });

  await check('в списке диалогов виден последний текст', async () => {
    const { body } = await req('/chat/conversations', { token: client.token });
    assert(body.length === 1, `диалогов ${body.length}`);
    assert(body[0].lastMessageText?.includes('[контакт скрыт]'), `превью: ${body[0].lastMessageText}`);
  });

  await check('специалист видит тот же диалог со своей стороны', async () => {
    const { body } = await req('/chat/conversations', { token: master.token });
    assert(body.length === 1, `диалогов ${body.length}`);
    assert(body[0].role === 'SPECIALIST', `роль: ${body[0].role}`);
    assert(body[0].peer.name === 'Клиент', `собеседник: ${body[0].peer.name}`);
  });

  await check('порядок сообщений — от старых к новым', async () => {
    const { body } = await req(`/chat/conversations/${conversationId}`, { token: client.token });
    assert(body.messages.length === 2, `сообщений ${body.messages.length}`);
    assert(/смесител/i.test(body.messages[0].text), `первым идёт: ${body.messages[0].text}`);
    const times = body.messages.map((m) => new Date(m.createdAt).getTime());
    assert(times[0] <= times[1], 'порядок нарушен');
  });

  await check('пустой диалог не засоряет список', async () => {
    // Открытие экрана создаёт диалог; в списке он появляться не должен,
    // пока в нём нет ни одного сообщения.
    const { body: other } = await req('/chat/conversations', {
      method: 'POST',
      token: stranger.token,
      body: JSON.stringify({ specialistId: profile.id }),
    });
    assert(other.id, 'диалог не создан');
    const { body: list } = await req('/chat/conversations', { token: stranger.token });
    assert(list.length === 0, `в списке ${list.length}, ожидалось 0`);
  });

  await check('закрытая администрацией переписка не принимает сообщения', async () => {
    sql(`UPDATE conversations SET \"isBlocked\" = true WHERE id = '${conversationId}'`);
    const { status, body } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ text: 'Ещё вопрос' }),
    });
    assert(status === 403, `статус ${status}`);
    assert(body.code === 'CONVERSATION_BLOCKED', `код: ${body.code}`);

    // История при этом остаётся доступной обеим сторонам.
    const { status: readStatus } = await req(`/chat/conversations/${conversationId}`, { token: client.token });
    assert(readStatus === 200, `история недоступна: ${readStatus}`);
  });

  console.log('\nВычистка контактов в анкете:\n');

  const SNEAKY_TG = 840000005;
  const sneaky = await login(SNEAKY_TG, 'Хитрый');

  await check('телефон в описании анкеты скрывается', async () => {
    const { status, body } = await req('/me/specialist', {
      method: 'POST',
      token: sneaky.token,
      body: JSON.stringify({
        displayName: 'Сергей Обходов',
        headline: 'Сантехник, звоните +7 900 111-22-33',
        about: 'Работаю быстро. Мой телеграм @sergey_master, пишите напрямую.',
        city: 'Тула',
        categoryIds: [cats.find((c) => c.slug === 'repair').id],
        services: [],
      }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(!body.headline.includes('111-22-33'), `телефон в заголовке: ${body.headline}`);
    assert(!body.about.includes('sergey_master'), `логин в описании: ${body.about}`);
    assert(body.headline.includes('[контакт скрыт]'), `нет метки: ${body.headline}`);
  });

  await check('имя тоже чистится', async () => {
    // «Иван +79001234567» в поле имени — рабочий способ обойти правило,
    // потому что имя видно в списке ещё до открытия карточки.
    const { body } = await req('/me/specialist', {
      method: 'PUT',
      token: sneaky.token,
      body: JSON.stringify({
        displayName: 'Сергей 89001112233',
        city: 'Тула',
        categoryIds: [cats.find((c) => c.slug === 'repair').id],
        services: [],
      }),
    });
    assert(!body.displayName.includes('89001112233'), `телефон в имени: ${body.displayName}`);
  });

  await check('попытки обхода считаются', async () => {
    const attempts = sql(`SELECT "contactAttempts" FROM users WHERE "telegramId"=${SNEAKY_TG}`);
    // Две попытки: описание при создании и имя при правке.
    assert(Number(attempts) === 2, `засчитано ${attempts}, ожидалось 2`);
  });

  await check('чистый текст попытку не засчитывает', async () => {
    const before = sql(`SELECT "contactAttempts" FROM users WHERE "telegramId"=${SNEAKY_TG}`);
    await req('/me/specialist', {
      method: 'PUT',
      token: sneaky.token,
      body: JSON.stringify({
        displayName: 'Сергей Обходов',
        about: 'Работаю аккуратно, выезжаю в день обращения.',
        city: 'Тула',
        categoryIds: [cats.find((c) => c.slug === 'repair').id],
        services: [],
      }),
    });
    const after = sql(`SELECT "contactAttempts" FROM users WHERE "telegramId"=${SNEAKY_TG}`);
    assert(before === after, `счётчик вырос без причины: ${before} → ${after}`);
  });

  await check('диктовка номера словами в чате скрывается', async () => {
    // Предыдущая проверка закрыла переписку — возвращаем её, иначе
    // отправка упрётся в блокировку, а не в фильтр контактов.
    sql(`UPDATE conversations SET "isBlocked" = false WHERE id = '${conversationId}'`);
    const { body } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: master.token,
      body: JSON.stringify({
        text: 'Наберите девять ноль ноль сто двадцать три сорок пять шестьдесят семь',
      }),
    });
    assert(body.hasMaskedContacts === true, `не распознано: ${body.text}`);
    assert(!body.text.includes('двадцать'), `диктовка просочилась: ${body.text}`);
  });

  console.log('\nПривязка карточки к аккаунту:\n');

  let orphanId;
  await check('в карточку без владельца писать нельзя', async () => {
    // Карточку завёл администратор, аккаунта у неё нет — писать некому.
    const { body: cats2 } = await req('/admin/categories', { token: admin.token });
    const { body: orphan } = await req('/admin/specialists', {
      method: 'POST',
      token: admin.token,
      body: JSON.stringify({
        displayName: 'Карточка Без Хозяина',
        slug: 'orphan-card',
        city: 'Омск',
        status: 'ACTIVE',
        isPromoted: false,
        categoryIds: [cats2.find((c) => c.slug === 'auto').id],
      }),
    });
    orphanId = orphan.id;

    const { status, body } = await req('/chat/conversations', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ specialistId: orphanId }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'SPECIALIST_UNREACHABLE', `код: ${body.code}`);
  });

  await check('администратор привязывает карточку к аккаунту', async () => {
    const { body: cats2 } = await req('/admin/categories', { token: admin.token });
    const { status, body } = await req(`/admin/specialists/${orphanId}`, {
      method: 'PUT',
      token: admin.token,
      body: JSON.stringify({
        displayName: 'Карточка Без Хозяина',
        slug: 'orphan-card',
        city: 'Омск',
        status: 'ACTIVE',
        isPromoted: false,
        categoryIds: [cats2.find((c) => c.slug === 'auto').id],
        ownerTelegramId: String(STRANGER_TG),
      }),
    });
    assert(status === 200, `статус ${status}: ${JSON.stringify(body)}`);
  });

  await check('после привязки чат открывается', async () => {
    const { status, body } = await req('/chat/conversations', {
      method: 'POST',
      token: client.token,
      body: JSON.stringify({ specialistId: orphanId }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.peer.name === 'Карточка Без Хозяина', `собеседник: ${body.peer.name}`);
  });

  await check('нельзя привязать к тому, кто не открывал приложение', async () => {
    const { body: cats2 } = await req('/admin/categories', { token: admin.token });
    const { status, body } = await req(`/admin/specialists/${orphanId}`, {
      method: 'PUT',
      token: admin.token,
      body: JSON.stringify({
        displayName: 'Карточка Без Хозяина',
        slug: 'orphan-card',
        city: 'Омск',
        status: 'ACTIVE',
        isPromoted: false,
        categoryIds: [cats2.find((c) => c.slug === 'auto').id],
        ownerTelegramId: '999888777',
      }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'OWNER_NOT_FOUND', `код: ${body.code}`);
  });

  await check('нельзя привязать к тому, у кого уже есть анкета', async () => {
    const { body: cats2 } = await req('/admin/categories', { token: admin.token });
    const { status, body } = await req(`/admin/specialists/${orphanId}`, {
      method: 'PUT',
      token: admin.token,
      body: JSON.stringify({
        displayName: 'Карточка Без Хозяина',
        slug: 'orphan-card',
        city: 'Омск',
        status: 'ACTIVE',
        isPromoted: false,
        categoryIds: [cats2.find((c) => c.slug === 'auto').id],
        // У этого пользователя своя анкета «Пётр Чатов».
        ownerTelegramId: String(MASTER_TG),
      }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'OWNER_HAS_PROFILE', `код: ${body.code}`);
  });

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Сценарий прерван:', error);
  process.exit(1);
});
