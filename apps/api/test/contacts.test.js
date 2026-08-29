/**
 * Проверка вычистки контактов из пользовательских текстов.
 *
 * От этой функции зависит весь замысел: если она пропускает телефоны,
 * общение уходит из приложения в первом же сообщении. Если, наоборот,
 * вычищает лишнее — портит нормальные тексты про цены и сроки.
 *
 * Запуск: node test/contacts.test.js (сборки и базы не требует)
 */
const path = require('node:path');
const { maskContacts, containsContacts, CONTACT_PLACEHOLDER } = require(
  path.resolve(__dirname, '../../../packages/shared/dist/cjs/index.js'),
);

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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** Контакт должен быть скрыт и не должен просочиться в результат. */
function expectMasked(input, leak) {
  const { text, hasContacts } = maskContacts(input);
  assert(hasContacts, `контакт не распознан: «${input}»`);
  assert(text.includes(CONTACT_PLACEHOLDER), `нет метки скрытия: «${text}»`);
  if (leak) {
    assert(!text.includes(leak), `контакт просочился: «${text}»`);
  }
  assert(containsContacts(input), `containsContacts не распознал: «${input}»`);
}

/** Обычный текст трогать нельзя. */
function expectUntouched(input) {
  const { text, hasContacts } = maskContacts(input);
  assert(!hasContacts, `ложное срабатывание на «${input}» → «${text}»`);
  assert(text === input.trim(), `текст изменён: «${input}» → «${text}»`);
  assert(!containsContacts(input), `containsContacts ложно сработал на «${input}»`);
}

console.log('Телефоны:\n');

check('международный формат с пробелами', () => expectMasked('Звоните +7 900 123-45-67', '900'));
check('в скобках без пробелов', () => expectMasked('8(900)1234567 в любое время', '1234567'));
check('слитно одиннадцать цифр', () => expectMasked('мой номер 89001234567', '89001234567'));
check('через дефисы', () => expectMasked('тел. 8-900-123-45-67', '123'));
check('внутри длинного текста', () =>
  expectMasked('Работаю по будням, телефон +79001234567, пишите заранее', '79001234567'));

console.log('\nСсылки и логины:\n');

check('@username', () => expectMasked('пишите мне @master_ivan', 'master_ivan'));
check('ссылка t.me', () => expectMasked('вот мой телеграм t.me/master_ivan', 'master_ivan'));
check('ссылка wa.me с номером', () => expectMasked('https://wa.me/79001234567', '79001234567'));
check('обычная ссылка', () => expectMasked('подробности на https://example.com/prices', 'example.com'));
check('ссылка без протокола', () => expectMasked('смотрите www.example.com', 'example.com'));
check('электронная почта', () => expectMasked('пишите на master@example.com', 'master@example.com'));
check('instagram', () => expectMasked('мой инстаграм instagram.com/master', 'instagram.com/master'));

console.log('\nОбычный текст не портится:\n');

check('цены не считаются телефоном', () => expectUntouched('Стрижка 2000 рублей, окрашивание от 4500'));
check('годы и даты', () => expectUntouched('Работаю с 2015 года, опыт 8 лет'));
check('короткие числа', () => expectUntouched('Приеду через 30 минут, работаю до 21:00'));
check('текст без контактов', () =>
  expectUntouched('Делаю маникюр, педикюр и наращивание. Материалы премиум-класса.'));
check('почта как слово', () => expectUntouched('Работаю рядом с почтой на Ленина'));
check('адрес с домом', () => expectUntouched('Улица Мясницкая, дом 24, второй этаж'));

console.log('\nЦифры прописью:\n');

check('номер, продиктованный словами', () =>
  expectMasked('девять ноль ноль сто двадцать три сорок пять шестьдесят семь'));
check('диктовка по одной цифре', () =>
  expectMasked('звоните девять ноль ноль один два три четыре пять шесть семь'));
check('смесь цифр и слов', () => expectMasked('9 ноль ноль 123 45 67', '123'));
check('«плюс семь» в начале', () =>
  expectMasked('плюс семь девять ноль ноль сто двадцать три сорок пять'));

check('обычные числительные не трогаются', () => expectUntouched('у меня два кота и три собаки'));
check('время работы не номер', () => expectUntouched('работаю с восьми до девяти вечера'));
check('цена словами не номер', () => expectUntouched('стрижка две тысячи рублей'));
check('срок в словах не номер', () => expectUntouched('приеду через сорок минут'));
check('опыт и количество клиентов', () =>
  expectUntouched('опыт восемь лет, сто довольных клиентов'));

check('перенос строки прерывает диктовку', () => {
  // Номер не диктуют через абзац: две строки по несколько числительных
  // не должны склеиваться в один «номер».
  expectUntouched('Стрижка две тысячи\nОкрашивание четыре тысячи');
});

console.log('\nПограничные случаи:\n');

check('шесть цифр подряд не номер', () => expectUntouched('Артикул 123456 в каталоге'));
check('семь цифр уже подозрительны', () => {
  const { hasContacts } = maskContacts('код 1234567');
  assert(hasContacts, 'семизначная последовательность пропущена');
});

check('несколько контактов схлопываются в одну метку', () => {
  const { text } = maskContacts('+79001234567 @ivan t.me/ivan');
  const count = text.split(CONTACT_PLACEHOLDER).length - 1;
  assert(count === 1, `меток ${count}, ожидалась одна: «${text}»`);
});

check('почта не разрывается правилом для username', () => {
  const { text } = maskContacts('master@example.com');
  // Если бы сначала сработало правило @username, остался бы обрывок «master».
  assert(!text.includes('example'), `остался обрывок: «${text}»`);
  assert(!text.includes('master'), `остался обрывок: «${text}»`);
});

check('повторный вызов containsContacts даёт тот же ответ', () => {
  // Регулярные выражения с флагом g хранят позицию между вызовами —
  // без сброса второй вызов на том же тексте вернул бы false.
  const input = 'телефон +79001234567';
  assert(containsContacts(input) === true, 'первый вызов');
  assert(containsContacts(input) === true, 'второй вызов дал другой результат');
});

check('пустая строка не ломает функцию', () => {
  const { text, hasContacts } = maskContacts('');
  assert(text === '' && !hasContacts, 'пустая строка обработана неверно');
});

console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
