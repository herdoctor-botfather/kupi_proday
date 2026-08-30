# syntax=docker/dockerfile:1
#
# Один файл собирает всё: серверные процессы и статику.
#
# Образ на Debian, а не на Alpine: Prisma тянет заранее собранные движки
# под конкретную libc, и на Alpine это регулярно упирается в отсутствующий
# openssl. Экономия в двадцать мегабайт того не стоит.

FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ─── Зависимости ───
# Ставятся до копирования исходников: пока не менялись package.json,
# Docker берёт этот слой из кеша и не выкачивает npm заново.
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/miniapp/package.json apps/miniapp/
COPY apps/admin/package.json apps/admin/
RUN npm ci

# ─── Сборка ───
FROM deps AS build
COPY . .

# Переменные с префиксом VITE_ попадают внутрь клиентского кода и должны
# быть известны на этапе сборки — подставить их потом уже нельзя.
ARG VITE_TELEGRAM_BOT_USERNAME=""
ARG VITE_YANDEX_MAPS_API_KEY=""
# Пустой адрес означает «тот же домен»: статику и API отдаёт один сервер.
ENV VITE_API_URL=""
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
ENV VITE_YANDEX_MAPS_API_KEY=$VITE_YANDEX_MAPS_API_KEY

RUN npm run build:shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @app/api \
 && npm run build -w @app/bot \
 && npm run build -w @app/miniapp \
 && npm run build -w @app/admin

# ─── Серверные процессы ───
# Один образ на API и бота: код общий, различается только команда запуска.
FROM base AS app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/bot ./apps/bot
# Файлы, загруженные пользователями, живут на подключённом томе.
# Права выставляем до смены пользователя: том при первом подключении
# наследует владельца каталога из образа, иначе процесс не сможет писать.
RUN mkdir -p /app/apps/api/uploads && chown -R node:node /app/apps/api/uploads
USER node
CMD ["node", "apps/api/dist/src/main.js"]

# ─── Веб-сервер со статикой ───
FROM caddy:2-alpine AS web
COPY --from=build /app/apps/miniapp/dist /srv/miniapp
COPY --from=build /app/apps/admin/dist /srv/admin
COPY Caddyfile /etc/caddy/Caddyfile
