/**
 * Проверка витрины объявлений: размещение, модерация, фильтры,
 * скрытие контактов и переписка с продавцом.
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

const sql = (query) => execFileSync(PSQL, [DB_URL, '-tAc', query], { encoding: 'utf8' }).trim();

/**
 * Стираем объявления тестовых аккаунтов и демо-продавца до начала прогона.
 *
 * Счётчики витрины проверяются точными числами, поэтому набор должен
 * начинать с пустой доски: демо-объявления из сида сбили бы каждое из них.
 * Свои остатки тоже чистим — набор удаляет за собой только то объявление,
 * которое довёл до конца, а прерванный прогон оставил бы недоделанное
 * висеть в очереди модерации.
 */
const reset = (telegramIds) => {
  const owners = `SELECT id FROM users WHERE "telegramId" IN (${telegramIds.join(',')})`;
  const listings = `SELECT id FROM listings WHERE "userId" IN (${owners})`;
  const conversations = `SELECT id FROM conversations WHERE "listingId" IN (${listings})`;

  sql(`DELETE FROM messages WHERE "conversationId" IN (${conversations})`);
  sql(`DELETE FROM conversations WHERE "listingId" IN (${listings})`);
  sql(`DELETE FROM listing_photos WHERE "listingId" IN (${listings})`);
  sql(`DELETE FROM listing_categories WHERE "listingId" IN (${listings})`);
  sql(`DELETE FROM listings WHERE "userId" IN (${owners})`);
};

async function main() {
  const SELLER_TG = 850000001;
  const BUYER_TG = 850000002;
  const ADMIN_TG = 850000003;
  /** Демо-продавец из сида — его объявления заполняют витрину. */
  const DEMO_SELLER_TG = 1;

  reset([SELLER_TG, BUYER_TG, ADMIN_TG, DEMO_SELLER_TG]);

  const seller = await login(SELLER_TG, 'Продавец');
  const buyer = await login(BUYER_TG, 'Покупатель');
  await login(ADMIN_TG, 'Админ');
  sql(`UPDATE users SET role='ADMIN' WHERE "telegramId"=${ADMIN_TG}`);
  const admin = await login(ADMIN_TG, 'Админ');

  console.log('Категории товаров:\n');

  let productCategories;
  await check('категории товаров отделены от категорий услуг', async () => {
    const { body: services } = await req('/categories');
    const { body: products } = await req('/categories?kind=PRODUCT');
    productCategories = products;

    assert(services.length > 0 && products.length > 0, 'один из наборов пуст');
    assert(services.every((c) => c.kind === 'SERVICE'), 'в услугах есть товарная категория');
    assert(products.every((c) => c.kind === 'PRODUCT'), 'в товарах есть категория услуг');

    const serviceSlugs = new Set(services.map((c) => c.slug));
    assert(!products.some((c) => serviceSlugs.has(c.slug)), 'наборы пересекаются');
  });

  console.log('\nРазмещение объявления:\n');

  const electronics = () => productCategories.find((c) => c.slug === 'electronics').id;

  await check('объявление в категории услуг отклоняется', async () => {
    const { body: services } = await req('/categories');
    const { status, body } = await req('/me/listings', {
      method: 'POST',
      token: seller.token,
      body: JSON.stringify({
        title: 'Велосипед горный',
        price: 15000,
        city: 'Казань',
        categoryIds: [services[0].id],
      }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'CATEGORY_NOT_FOUND', `код: ${body.code}`);
  });

  await check('объявление без категории отклоняется', async () => {
    const { status } = await req('/me/listings', {
      method: 'POST',
      token: seller.token,
      body: JSON.stringify({ title: 'Телефон', price: 1000, city: 'Казань', categoryIds: [] }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('слишком короткое название отклоняется', async () => {
    const { status } = await req('/me/listings', {
      method: 'POST',
      token: seller.token,
      body: JSON.stringify({ title: 'ТВ', price: 1000, city: 'Казань', categoryIds: [electronics()] }),
    });
    assert(status === 400, `статус ${status}`);
  });

  let listingId;
  await check('корректное объявление уходит на проверку', async () => {
    const { status, body } = await req('/me/listings', {
      method: 'POST',
      token: seller.token,
      body: JSON.stringify({
        title: 'iPhone 13 128 ГБ',
        description: 'Состояние отличное, полный комплект, чек сохранён.',
        price: 45000,
        condition: 'USED_PERFECT',
        city: 'Казань',
        categoryIds: [electronics()],
      }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.status === 'PENDING', `статус: ${body.status}`);
    // В форме рубли, в базе копейки.
    assert(body.priceAmount === 4500000, `цена ${body.priceAmount}, ожидалось 4500000`);
    listingId = body.id;
  });

  await check('адрес объявления сгенерирован транслитерацией', async () => {
    const { body } = await req(`/me/listings/${listingId}`, { token: seller.token });
    assert(body.slug === 'iphone-13-128-gb', `slug: ${body.slug}`);
  });

  await check('непроверенное объявление не видно на витрине', async () => {
    const { body } = await req('/listings');
    assert(body.total === 0, `на витрине ${body.total} объявлений`);
    const { status } = await req(`/listings/${listingId}`);
    assert(status === 404, `карточка доступна: ${status}`);
  });

  console.log('\nСкрытие контактов:\n');

  await check('телефон в названии и описании скрывается', async () => {
    const { body } = await req('/me/listings', {
      method: 'POST',
      token: seller.token,
      body: JSON.stringify({
        title: 'Диван новый 89001234567',
        description: 'Пишите в телеграм @divan_seller, отдам недорого',
        price: 8000,
        city: 'Казань',
        categoryIds: [productCategories.find((c) => c.slug === 'home').id],
      }),
    });
    assert(!body.title.includes('89001234567'), `телефон в названии: ${body.title}`);
    assert(!body.description.includes('divan_seller'), `логин в описании: ${body.description}`);
    assert(body.title.includes('[контакт скрыт]'), `нет метки: ${body.title}`);
  });

  console.log('\nМодерация:\n');

  await check('объявление видно в очереди администратора', async () => {
    const { status, body } = await req('/admin/listings/pending', { token: admin.token });
    assert(status === 200, `статус ${status}`);
    assert(body.pending.length === 2, `в очереди ${body.pending.length}`);
  });

  await check('обычный пользователь очередь не видит', async () => {
    const { status } = await req('/admin/listings/pending', { token: seller.token });
    assert(status === 403, `статус ${status}`);
  });

  await check('отклонение без причины запрещено', async () => {
    const { status } = await req(`/admin/listings/${listingId}/moderate`, {
      method: 'PATCH',
      token: admin.token,
      body: JSON.stringify({ action: 'reject' }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('одобрение публикует объявление на витрине', async () => {
    const { status } = await req(`/admin/listings/${listingId}/moderate`, {
      method: 'PATCH',
      token: admin.token,
      body: JSON.stringify({ action: 'approve' }),
    });
    assert(status === 200, `статус ${status}`);

    const { body } = await req('/listings');
    assert(body.total === 1, `на витрине ${body.total}`);
    assert(body.items[0].title === 'iPhone 13 128 ГБ', `название: ${body.items[0].title}`);
  });

  console.log('\nВитрина и фильтры:\n');

  await check('поиск по названию работает', async () => {
    const { body } = await req('/listings?q=' + encodeURIComponent('iphone'));
    assert(body.total === 1, `найдено ${body.total}`);
  });

  await check('фильтр по цене работает', async () => {
    const { body: cheap } = await req('/listings?maxPrice=10000');
    assert(cheap.total === 0, `дешевле 10000 нашлось ${cheap.total}`);
    const { body: any } = await req('/listings?minPrice=40000&maxPrice=50000');
    assert(any.total === 1, `в диапазоне ${any.total}`);
  });

  await check('перевёрнутый диапазон цен отклоняется', async () => {
    const { status } = await req('/listings?minPrice=50000&maxPrice=1000');
    assert(status === 400, `статус ${status}`);
  });

  await check('фильтр по состоянию работает', async () => {
    const { body: perfect } = await req('/listings?condition=USED_PERFECT');
    assert(perfect.total === 1, `как новых ${perfect.total}`);
    const { body: brandNew } = await req('/listings?condition=NEW');
    assert(brandNew.total === 0, `новых ${brandNew.total}`);
  });

  await check('фильтр по категории работает', async () => {
    const { body } = await req('/listings?categorySlug=electronics');
    assert(body.total === 1, `в электронике ${body.total}`);
    const { body: home } = await req('/listings?categorySlug=home');
    assert(home.total === 0, `в доме ${home.total}, второе объявление ещё не одобрено`);
  });

  await check('города витрины отдаются отдельно от городов услуг', async () => {
    const { body } = await req('/listings/cities');
    assert(body.some((c) => c.name === 'Казань'), `города: ${JSON.stringify(body)}`);
  });

  console.log('\nПереписка о товаре:\n');

  let conversationId;
  await check('покупатель открывает диалог по объявлению', async () => {
    const { status, body } = await req('/chat/conversations', {
      method: 'POST',
      token: buyer.token,
      body: JSON.stringify({ listingId }),
    });
    assert(status === 201 || status === 200, `статус ${status}: ${JSON.stringify(body)}`);
    assert(body.listing?.title === 'iPhone 13 128 ГБ', `предмет: ${JSON.stringify(body.listing)}`);
    assert(body.specialist === null, 'диалог помечен как разговор о специалисте');
    conversationId = body.id;
  });

  await check('продавец не может написать по своему объявлению', async () => {
    const { status, body } = await req('/chat/conversations', {
      method: 'POST',
      token: seller.token,
      body: JSON.stringify({ listingId }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'SELF_CHAT', `код: ${body.code}`);
  });

  await check('нельзя указать и специалиста, и объявление сразу', async () => {
    const { status } = await req('/chat/conversations', {
      method: 'POST',
      token: buyer.token,
      body: JSON.stringify({ listingId, specialistId: 'whatever' }),
    });
    assert(status === 400, `статус ${status}`);
  });

  await check('сообщение доходит, контакты скрываются', async () => {
    const { body } = await req(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: buyer.token,
      body: JSON.stringify({ text: 'Ещё продаёте? Мой номер +7 900 111-22-33' }),
    });
    assert(!body.text.includes('111-22-33'), `телефон просочился: ${body.text}`);
    assert(body.hasMaskedContacts === true, 'признак не выставлен');
  });

  await check('продавец видит диалог со своей стороны', async () => {
    const { body } = await req('/chat/conversations', { token: seller.token });
    assert(body.length === 1, `диалогов ${body.length}`);
    assert(body[0].role === 'SPECIALIST', `роль: ${body[0].role}`);
    assert(body[0].listing?.title === 'iPhone 13 128 ГБ', 'предмет не подтянулся');
    assert(body[0].peer.name === 'Покупатель', `собеседник: ${body[0].peer.name}`);
  });

  console.log('\nЖизненный цикл объявления:\n');

  await check('правка не снимает объявление с витрины', async () => {
    const { body } = await req(`/me/listings/${listingId}`, {
      method: 'PUT',
      token: seller.token,
      body: JSON.stringify({
        title: 'iPhone 13 128 ГБ',
        description: 'Уточнил: комплект полный, коробка есть.',
        price: 43000,
        condition: 'USED_PERFECT',
        city: 'Казань',
        categoryIds: [electronics()],
      }),
    });
    assert(body.status === 'ACTIVE', `статус: ${body.status}`);
    assert(body.needsReview === true, 'правка не помечена для проверки');

    const { status } = await req(`/listings/${listingId}`);
    assert(status === 200, `объявление пропало: ${status}`);
  });

  await check('пометка «продано» убирает с витрины, но не из истории', async () => {
    const { body } = await req(`/me/listings/${listingId}/sold`, { method: 'POST', token: seller.token });
    assert(body.status === 'SOLD', `статус: ${body.status}`);
    assert(body.soldAt, 'дата продажи не проставлена');

    const { body: shelf } = await req('/listings');
    assert(shelf.total === 0, `на витрине осталось ${shelf.total}`);

    // По прямой ссылке проданное открывается: покупатель может вернуться
    // к переписке, а история продавца не должна обрываться.
    const { status } = await req(`/listings/${listingId}`);
    assert(status === 200, `по ссылке недоступно: ${status}`);
  });

  await check('проданное объявление изменить нельзя', async () => {
    const { status, body } = await req(`/me/listings/${listingId}`, {
      method: 'PUT',
      token: seller.token,
      body: JSON.stringify({
        title: 'iPhone 13 снова в продаже',
        price: 50000,
        city: 'Казань',
        categoryIds: [electronics()],
      }),
    });
    assert(status === 400, `статус ${status}`);
    assert(body.code === 'LISTING_SOLD', `код: ${body.code}`);
  });

  await check('чужое объявление не тронуть', async () => {
    const { status } = await req(`/me/listings/${listingId}/hide`, { method: 'POST', token: buyer.token });
    assert(status === 404, `статус ${status}`);
  });

  await check('возврат в продажу возвращает на витрину', async () => {
    const { body } = await req(`/me/listings/${listingId}/publish`, { method: 'POST', token: seller.token });
    assert(body.status === 'ACTIVE', `статус: ${body.status}`);
    assert(body.soldAt === null, 'дата продажи не сброшена');

    const { body: shelf } = await req('/listings');
    assert(shelf.total === 1, `на витрине ${shelf.total}`);
  });

  await check('удаление убирает объявление и связи', async () => {
    const { status } = await req(`/me/listings/${listingId}`, { method: 'DELETE', token: seller.token });
    assert(status === 204, `статус ${status}`);
    const left = sql(`SELECT count(*) FROM listing_categories WHERE "listingId" = '${listingId}'`);
    assert(left === '0', `осталось ${left} связей`);
  });

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Сценарий прерван:', error);
  process.exit(1);
});
