import { z } from 'zod';
import { loadEnvFile } from './load-env';

loadEnvFile();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN обязателен'),
  MINIAPP_URL: z
    .string()
    .url('MINIAPP_URL должен быть полным адресом')
    // Telegram открывает Mini App только по HTTPS — http-адрес не заработает
    // даже локально, поэтому проверяем схему сразу, а не при первом запуске.
    .refine((url) => url.startsWith('https://'), 'MINIAPP_URL должен начинаться с https://'),
  /**
   * Адрес API — бот подтягивает оттуда живые числа для приветствия.
   * Не обязателен: без него сообщение просто обходится без цифр.
   */
  API_PROXY_TARGET: z.string().url().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Некорректная конфигурация бота:\n${details}`);
}

export const config = parsed.data;
