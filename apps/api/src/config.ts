import { z } from 'zod';
import { loadEnvFile } from './load-env';

// .env лежит в корне монорепозитория — один файл на все приложения.
loadEnvFile();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN обязателен: им проверяется подпись initData'),
  /** Адрес Mini App для кнопки под уведомлениями. Без него кнопки просто не будет. */
  MINIAPP_URL: z.string().default(''),
  API_PORT: z.coerce.number().int().default(3000),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET должен быть не короче 16 символов'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  ADMIN_DEV_TOKEN: z.string().default(''),

  // ─── Хранилище файлов ───
  /** Отправка уведомлений через бота. Отключается в тестах и при отладке. */
  NOTIFICATIONS_ENABLED: z.enum(['true', 'false']).default('true'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  /** Адрес, по которому отдаются файлы локального хранилища. */
  STORAGE_PUBLIC_URL: z.string().default('/uploads'),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_PUBLIC_URL: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
})
  // Драйвер s3 без параметров бакета молча не заработает — ловим на старте,
  // а не на первой загрузке файла пользователем.
  .refine(
    (env) =>
      env.STORAGE_DRIVER !== 's3' ||
      Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_PUBLIC_URL),
    {
      message:
        'При STORAGE_DRIVER=s3 обязательны S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY и S3_PUBLIC_URL',
      path: ['STORAGE_DRIVER'],
    },
  );

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Некорректная конфигурация окружения:\n${details}\n\nСкопируйте .env.example в .env и заполните значения.`);
}

const env = parsed.data;

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  adminTelegramIds: env.ADMIN_TELEGRAM_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s)),
  /**
   * Вход в админку в обход Telegram допустим только вне production.
   * В проде переменная игнорируется, даже если она задана.
   */
  adminDevToken: env.NODE_ENV === 'production' ? '' : env.ADMIN_DEV_TOKEN,

  notificationsEnabled: env.NOTIFICATIONS_ENABLED === 'true',

  storage: {
    driver: env.STORAGE_DRIVER,
    localDir: env.STORAGE_LOCAL_DIR,
    localPublicPrefix: env.STORAGE_PUBLIC_URL,
    s3: {
      endpoint: env.S3_ENDPOINT || undefined,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicUrl: env.S3_PUBLIC_URL,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    },
  },
} as const;

export type AppConfig = typeof config;
