/**
 * Проверка критичных к безопасности мест: верификации подписи Telegram
 * и гео-расчётов.
 * Формируем подпись так же, как это делает Telegram, и проверяем,
 * что валидные данные принимаются, а любые подделки отклоняются.
 */
const { createHmac } = require('node:crypto');
const path = require('node:path');

// Тесты идут по собранному коду — сначала выполните npm run build -w @app/api
const API = path.resolve(__dirname, '../dist/src');
const { verifyInitData, InitDataError } = require(path.join(API, 'auth/telegram-init-data.js'));
const { boundingBox, haversineKm } = require(path.join(API, 'common/geo.js'));

const BOT_TOKEN = '123456:TEST-TOKEN-FOR-VERIFICATION';

function signInitData(fields, botToken = BOT_TOKEN) {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

const now = Math.floor(Date.now() / 1000);
const user = { id: 987654321, first_name: 'Денис', username: 'denis', language_code: 'ru' };

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
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

function expectReject(initData, token = BOT_TOKEN) {
  try {
    verifyInitData(initData, token);
  } catch (error) {
    assert(error instanceof InitDataError, `ожидалась InitDataError, получено ${error.constructor.name}`);
    return error.message;
  }
  throw new Error('подпись принята, хотя должна была быть отклонена');
}

console.log('Проверка подписи initData:');

check('валидная подпись принимается, данные разбираются', () => {
  const initData = signInitData({ auth_date: String(now), query_id: 'AAE', user: JSON.stringify(user) });
  const result = verifyInitData(initData, BOT_TOKEN);
  assert(result.user.id === user.id, 'id пользователя не совпал');
  assert(result.user.first_name === 'Денис', 'имя не совпало (проблема с кириллицей?)');
  assert(result.queryId === 'AAE', 'query_id потерялся');
});

check('подменённое поле user отклоняется', () => {
  const initData = signInitData({ auth_date: String(now), user: JSON.stringify(user) });
  const tampered = initData.replace('987654321', '111111111');
  expectReject(tampered);
});

check('чужой токен бота отклоняется', () => {
  const initData = signInitData({ auth_date: String(now), user: JSON.stringify(user) });
  expectReject(initData, '999999:ANOTHER-TOKEN');
});

check('отсутствие hash отклоняется', () => {
  expectReject(`auth_date=${now}&user=${encodeURIComponent(JSON.stringify(user))}`);
});

check('просроченная подпись отклоняется', () => {
  const twoDaysAgo = now - 2 * 24 * 60 * 60;
  const initData = signInitData({ auth_date: String(twoDaysAgo), user: JSON.stringify(user) });
  const message = expectReject(initData);
  assert(/истёк/i.test(message), `ожидалось сообщение о сроке действия, получено: ${message}`);
});

check('дата из будущего отклоняется', () => {
  const initData = signInitData({ auth_date: String(now + 3600), user: JSON.stringify(user) });
  expectReject(initData);
});

check('подпись без поля user отклоняется', () => {
  const initData = signInitData({ auth_date: String(now), query_id: 'AAE' });
  expectReject(initData);
});

check('поле signature участвует в подписи', () => {
  // Реальный Telegram присылает signature — подпись Ed25519 для сторонней
  // проверки. В строку проверки hash она ВХОДИТ; исключается только сам hash.
  // Прежняя версия кода её отбрасывала, и ни один вход из настоящего клиента
  // не проходил, хотя синтетические тесты были зелёными.
  const initData = signInitData({
    auth_date: String(now),
    query_id: 'AAE',
    signature: 'nnF9b0D-wyAunr8bYbczseqZ4cjs2MRw2AQaQkUo37tC1h2ScUvE9uY7Ub2FgPX_joyhnL64C2RStz40slfGCw',
    user: JSON.stringify(user),
  });
  const result = verifyInitData(initData, BOT_TOKEN);
  assert(result.user.id === user.id, 'подпись с полем signature не прошла проверку');
});

check('подменённый signature отклоняется', () => {
  const initData = signInitData({
    auth_date: String(now),
    signature: 'original-signature-value',
    user: JSON.stringify(user),
  });
  expectReject(initData.replace('original-signature-value', 'tampered-signature-value'));
});

console.log('\nПроверка гео-расчётов:');

check('расстояние Москва — Санкт-Петербург около 634 км', () => {
  const km = haversineKm(55.7558, 37.6173, 59.9311, 30.3609);
  assert(Math.abs(km - 634) < 10, `получено ${km.toFixed(1)} км`);
});

check('расстояние до самой себя равно нулю', () => {
  assert(haversineKm(55.75, 37.61, 55.75, 37.61) === 0, 'ожидался ноль');
});

check('прямоугольник накрывает точки внутри радиуса', () => {
  const lat = 55.7558;
  const lng = 37.6173;
  const box = boundingBox(lat, lng, 10);
  // Точка ровно в 10 км строго на север должна попасть в прямоугольник.
  const northPoint = lat + 10 / 111.32;
  assert(northPoint <= box.maxLat + 1e-9, 'точка на границе радиуса не попала в прямоугольник');
  assert(box.minLng < lng && box.maxLng > lng, 'границы по долготе некорректны');
});

check('вблизи полюса ширина прямоугольника остаётся конечной', () => {
  const box = boundingBox(89.9, 0, 10);
  assert(Number.isFinite(box.maxLng - box.minLng), 'получена бесконечная дельта долготы');
  assert(box.maxLng - box.minLng < 360, 'дельта долготы превысила полный круг');
});

console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
