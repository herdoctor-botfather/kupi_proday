import { config } from './config';

/** Сколько ждём API: приветствие не должно застревать из-за него. */
const TIMEOUT_MS = 1500;
/** Насколько долго числа считаются свежими. */
const TTL_MS = 60_000;

export interface Counts {
  specialists: number;
  listings: number;
}

let cached: Counts | null = null;
let cachedAt = 0;

/**
 * Живые числа для приветствия: сколько мастеров в каталоге и объявлений
 * на витрине.
 *
 * «Более 100 специалистов» в неизменном тексте — обещание, которое рано или
 * поздно разойдётся с правдой. Настоящие числа говорят честно и заодно
 * показывают, что площадка живая.
 *
 * Ответ кешируется на минуту: при потоке /start незачем дёргать API на
 * каждое сообщение, а числа за минуту не устаревают. Если API недоступен,
 * возвращается null — приветствие тогда просто обходится без цифр.
 */
export async function fetchCounts(): Promise<Counts | null> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  try {
    const [specialists, listings] = await Promise.all([
      total('/api/specialists?pageSize=1'),
      total('/api/listings?pageSize=1'),
    ]);

    cached = { specialists, listings };
    cachedAt = Date.now();
    return cached;
  } catch {
    // Молча: недоступный API — не повод не поздороваться.
    return null;
  }
}

async function total(path: string): Promise<number> {
  const response = await fetch(`${config.API_PROXY_TARGET}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`API ответил ${response.status}`);

  const body = (await response.json()) as { total?: number };
  if (typeof body.total !== 'number') throw new Error('В ответе нет total');
  return body.total;
}
