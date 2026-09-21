import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';

/*
 * Сначала IPv4.
 *
 * У контейнера нет IPv6, а api.telegram.org отдаёт оба адреса. Node
 * пробовал сперва IPv6, ждал отказа и только потом шёл по IPv4: запрос,
 * который с самого сервера занимает 0,15 секунды, из контейнера тянулся
 * до трёх, а при просадке сети не укладывался в предел — и счёт на
 * оплату не выставлялся.
 */
setDefaultResultOrder('ipv4first');
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

  // Express по умолчанию принимает тело до 100 КБ. Объявление по фотографии
  // присылает снимок строкой data:image — даже сжатый он весит 150–400 КБ,
  // и запрос отбрасывался на входе с 413, не доходя ни до кода, ни до логов.
  // Потолок самого снимка (6 МБ) проверяет схема маршрута.
  app.useBodyParser('json', { limit: '8mb' });

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
