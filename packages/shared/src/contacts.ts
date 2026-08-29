/**
 * Скрытие контактов в пользовательских текстах.
 *
 * Площадка удерживает общение внутри приложения, но простого удаления полей
 * с телефоном недостаточно: специалист напишет номер в описании услуг или
 * в первом же сообщении. Без вычистки контроль превращается в декорацию.
 *
 * Правило одно и то же на сервере и на клиенте: клиент предупреждает
 * заранее, что контакты будут скрыты, сервер применяет вычистку по факту.
 * Доверять клиентской проверке нельзя — она нужна только для подсказки.
 */

export const CONTACT_PLACEHOLDER = '[контакт скрыт]';

/**
 * Телефон в любом виде: +7 900 123-45-67, 8(900)1234567, 89001234567,
 * а также городской из семи цифр — 123-45-67.
 *
 * Порог именно семь цифр. Шесть и меньше — это цены, годы и артикулы,
 * их трогать нельзя. Семизначные номера заказов иногда попадут под правило,
 * но пропустить телефон хуже, чем скрыть лишний артикул.
 */
const PHONE = /(?:\+?\d[\s\-()]*){6,}\d/g;

/** @username в Telegram и Instagram. Три символа — минимум по правилам Telegram. */
const USERNAME = /(?<![\w/])@[A-Za-z][A-Za-z0-9_]{2,}/g;

/** Ссылки: и с протоколом, и «голые» вроде t.me/name или wa.me/79001234567. */
const URL = /\b(?:https?:\/\/|www\.)\S+|\b(?:t\.me|telegram\.me|wa\.me|vk\.com|instagram\.com|api\.whatsapp\.com)\/\S*/gi;

const EMAIL = /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Числительные прописью и сколько цифр каждое даёт.
 *
 * Простое правило для цифр обходится диктовкой словами: «девять ноль ноль,
 * сто двадцать три». Считаем не слова, а цифры за ними — «сто» это три
 * знака, а «сорок» два, иначе короткая фраза выглядела бы как номер.
 *
 * Включены основные падежные формы, которые встречаются при диктовке.
 * Полной морфологии здесь не нужно: люди диктуют номер именительным падежом.
 */
const NUMBER_WORDS: Record<string, number> = {
  ноль: 1, нуля: 1, нулю: 1, нуль: 1,
  один: 1, одна: 1, одного: 1, одну: 1,
  два: 1, две: 1, двух: 1,
  три: 1, трех: 1, трёх: 1,
  четыре: 1, четырех: 1, четырёх: 1,
  пять: 1, пяти: 1,
  шесть: 1, шести: 1,
  семь: 1, семи: 1,
  восемь: 1, восьми: 1,
  девять: 1, девяти: 1,
  десять: 2, десяти: 2,
  одиннадцать: 2, двенадцать: 2, тринадцать: 2, четырнадцать: 2,
  пятнадцать: 2, шестнадцать: 2, семнадцать: 2, восемнадцать: 2, девятнадцать: 2,
  двадцать: 2, тридцать: 2, сорок: 2, пятьдесят: 2, шестьдесят: 2,
  семьдесят: 2, восемьдесят: 2, девяносто: 2,
  сто: 3, двести: 3, триста: 3, четыреста: 3,
  пятьсот: 3, шестьсот: 3, семьсот: 3, восемьсот: 3, девятьсот: 3,
};

/** Слова, которые не прерывают диктовку номера. */
const FILLER_WORDS = new Set(['и', 'плюс', 'через', 'а', 'потом']);

/**
 * Сколько числовых слов должно идти подряд, чтобы это считалось диктовкой.
 * Без этого порога правило срабатывало бы на «два кота и три собаки»,
 * где цифр мало, но и на чистых цифрах — а ими занимается правило PHONE.
 */
const MIN_SPELLED_TOKENS = 3;

export interface MaskResult {
  /** Текст с заменёнными контактами. */
  text: string;
  /** В исходнике были контакты. */
  hasContacts: boolean;
}

export function maskContacts(input: string): MaskResult {
  let text = input;

  // Порядок важен: почта и ссылки содержат «@» и цифры, поэтому должны
  // сработать раньше правил для username и телефона, иначе те разорвут их
  // на части и оставят обрывки вроде «example.» в тексте.
  for (const pattern of [EMAIL, URL, USERNAME]) {
    text = text.replace(pattern, CONTACT_PLACEHOLDER);
  }

  // Диктовка словами идёт до правила для цифр: она умеет смешанные
  // последовательности вроде «9 ноль ноль 123 45 67», где ни одна часть
  // по отдельности на номер не тянет.
  text = maskSpelledNumbers(text);
  text = text.replace(PHONE, CONTACT_PLACEHOLDER);

  // Несколько подряд идущих замен схлопываем в одну: «[контакт скрыт]
  // [контакт скрыт]» выглядит как ошибка, а не как правило площадки.
  text = text.replace(
    new RegExp(`(?:${escapeRegExp(CONTACT_PLACEHOLDER)}[\\s,;·—-]*){2,}`, 'g'),
    `${CONTACT_PLACEHOLDER} `,
  );

  return { text: text.trim(), hasContacts: text !== input };
}

/**
 * Осталось ли в тексте что-то, кроме скрытых контактов.
 *
 * После вычистки сообщение «+79001234567» превращается в «[контакт скрыт]» —
 * строка непустая, но смысла в ней нет. Такие сообщения принимать нельзя:
 * иначе обмен контактами просто превращается в обмен метками.
 */
export function hasMeaningfulText(maskedText: string): boolean {
  const withoutPlaceholders = maskedText.split(CONTACT_PLACEHOLDER).join('');
  // Убираем пробелы и знаки препинания: «[контакт скрыт] — [контакт скрыт]»
  // тоже пустое сообщение, хотя формально символы в нём есть.
  return withoutPlaceholders.replace(/[\s\p{P}\p{S}]+/gu, '').length > 0;
}

/**
 * Скрывает номер, продиктованный словами: «девять ноль ноль сто двадцать три».
 *
 * Идём по цепочкам из числительных, цифр и связок, считая суммарное
 * количество цифр. Цепочка становится контактом, когда в ней и слов
 * достаточно, и цифр набирается на номер.
 */
function maskSpelledNumbers(input: string): string {
  // Разбиваем на слова и разделители, сохраняя исходные позиции:
  // заменять нужно ровно найденный отрезок, не трогая остальной текст.
  const tokens = [...input.matchAll(/[\p{L}\d]+|[^\p{L}\d]+/gu)];

  let result = '';
  let runStart: number | null = null;
  let runDigits = 0;
  let runWords = 0;
  let index = 0;

  const flush = (endIndex: number) => {
    if (runStart === null) return;
    const isContact = runDigits >= 7 && runWords >= MIN_SPELLED_TOKENS;
    result += isContact ? CONTACT_PLACEHOLDER : input.slice(runStart, endIndex);
    runStart = null;
    runDigits = 0;
    runWords = 0;
  };

  for (const token of tokens) {
    const value = token[0];
    const start = token.index ?? 0;

    // Разделители внутри цепочки её не прерывают, но перенос строки —
    // прерывает: номер не диктуют через абзац.
    if (!/[\p{L}\d]/u.test(value)) {
      if (runStart === null || /\n/.test(value) || value.length > 3) {
        flush(start);
        result += value;
      }
      index = start + value.length;
      continue;
    }

    const lower = value.toLowerCase();
    const wordDigits = NUMBER_WORDS[lower];
    const isDigits = /^\d+$/.test(value);
    const isFiller = FILLER_WORDS.has(lower);

    if (wordDigits !== undefined || isDigits) {
      if (runStart === null) runStart = start;
      runDigits += wordDigits ?? value.length;
      if (wordDigits !== undefined) runWords += 1;
    } else if (!isFiller || runStart === null) {
      flush(start);
      result += value;
    }

    index = start + value.length;
  }

  flush(index);
  return result;
}

/** Быстрая проверка без замены — для подсказки в интерфейсе. */
export function containsContacts(input: string): boolean {
  const byPattern = [EMAIL, URL, USERNAME, PHONE].some((pattern) => {
    // Регулярные выражения с флагом g хранят позицию между вызовами,
    // поэтому её нужно сбрасывать, иначе вторая проверка того же текста
    // даст другой результат.
    pattern.lastIndex = 0;
    return pattern.test(input);
  });

  return byPattern || maskSpelledNumbers(input) !== input;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
