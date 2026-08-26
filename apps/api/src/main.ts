import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { config } from './config';

/**
 * Telegram id не помещаются в Number, поэтому в БД они BigInt.
 * JSON.stringify такой тип не умеет — сериализуем в строку глобально,
 * чтобы случайно забытое поле не роняло ответ пятисоткой.
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });

  app.setGlobalPrefix('api');

  // Локальное хранилище отдаётся самим приложением. В production файлы должен
  // раздавать nginx или объектное хранилище — Node на этом только теряет время.
  if (config.storage.driver === 'local') {
    const uploadsDir = resolve(config.storage.localDir);
    mkdirSync(uploadsDir, { recursive: true });
    app.useStaticAssets(uploadsDir, {
      prefix: config.storage.localPublicPrefix,
      // Имена файлов случайны и не переиспользуются, поэтому кеш безопасен.
      maxAge: '365d',
      immutable: true,
    });
  }
  // Валидация выполняется ZodValidationPipe в каждом маршруте — схемами
  // из @app/shared. Глобальный ValidationPipe здесь не нужен: он потребовал бы
  // class-validator и второй, параллельный способ описывать те же правила.

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.get(PrismaService).enableShutdownHooks(app);
  app.enableShutdownHooks();

  await app.listen(config.API_PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API слушает http://localhost:${config.API_PORT}/api (${config.NODE_ENV})`);
}

void bootstrap();
