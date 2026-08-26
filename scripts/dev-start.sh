#!/bin/bash
#
# Поднимает всё окружение разработки одной командой.
#
# После перезагрузки машины ни один из процессов не восстанавливается сам:
# база, API, бот, оба фронтенда и туннель запускаются заново. Держать это
# в голове не нужно — скрипт делает всё по порядку и говорит, что готово.
#
#   bash scripts/dev-start.sh
#
# Остановить всё: bash scripts/dev-stop.sh

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.logs"
PGBIN="/Applications/Postgres.app/Contents/Versions/17/bin"
PGDATA="$HOME/Library/Application Support/Postgres/var-17"

mkdir -p "$LOGS"
export PATH="$HOME/.local/node/bin:$PATH"

step() { printf '\n▸ %s\n' "$1"; }
ok() { printf '  ✓ %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1" >&2; }

# ─── 1. База данных ───

step 'PostgreSQL'
if "$PGBIN/pg_isready" -p 5432 -q 2>/dev/null; then
  ok 'уже запущен'
else
  if [ ! -d "$PGDATA" ]; then
    fail "не найден каталог данных: $PGDATA"
    exit 1
  fi
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/postgres-server.log" -o '-p 5432' -w start > /dev/null 2>&1
  if "$PGBIN/pg_isready" -p 5432 -q 2>/dev/null; then
    ok 'запущен'
  else
    fail 'не удалось запустить — смотрите ' "$PGDATA/postgres-server.log"
    exit 1
  fi
fi

# ─── 2. API ───

step 'API'
if curl -s -o /dev/null -m 2 http://localhost:3000/api/health 2>/dev/null; then
  ok 'уже отвечает'
else
  if [ ! -f "$ROOT/apps/api/dist/src/main.js" ]; then
    printf '  собираю...\n'
    npm --prefix "$ROOT" run build -w @app/api > "$LOGS/build.log" 2>&1 || {
      fail "сборка не удалась — смотрите $LOGS/build.log"
      exit 1
    }
  fi
  (cd "$ROOT/apps/api" && nohup node dist/src/main.js > "$LOGS/api.log" 2>&1 &)
  for _ in $(seq 1 30); do
    curl -s -o /dev/null -m 2 http://localhost:3000/api/health 2>/dev/null && break
    sleep 1
  done
  if curl -s -o /dev/null -m 2 http://localhost:3000/api/health 2>/dev/null; then
    ok 'запущен на порту 3000'
  else
    fail "не поднялся — смотрите $LOGS/api.log"
    exit 1
  fi
fi

# ─── 3. Фронтенды ───

start_vite() {
  local name="$1" script="$2" port="$3"
  if curl -s -o /dev/null -m 2 "http://localhost:$port/" 2>/dev/null; then
    ok "$name уже отвечает"
    return
  fi
  (cd "$ROOT" && nohup npm run "$script" > "$LOGS/$script.log" 2>&1 &)
  for _ in $(seq 1 30); do
    curl -s -o /dev/null -m 2 "http://localhost:$port/" 2>/dev/null && break
    sleep 1
  done
  curl -s -o /dev/null -m 2 "http://localhost:$port/" 2>/dev/null \
    && ok "$name на порту $port" \
    || fail "$name не поднялся — смотрите $LOGS/$script.log"
}

step 'Фронтенды'
start_vite 'Mini App' dev:miniapp 5173
start_vite 'админка' dev:admin 5174

# ─── 4. Туннель ───
# Поднимается до бота: бот читает MINIAPP_URL, который туннель обновляет.

step 'Туннель'
if pgrep -f 'dev-tunnel.sh' > /dev/null; then
  ok 'уже работает'
else
  (cd "$ROOT" && nohup bash scripts/dev-tunnel.sh > "$LOGS/tunnel.log" 2>&1 &)
  for _ in $(seq 1 40); do
    grep -q 'Адрес: https://' "$LOGS/tunnel.log" 2>/dev/null && break
    sleep 2
  done
  if grep -q 'Адрес: https://' "$LOGS/tunnel.log" 2>/dev/null; then
    ok "$(grep -o 'https://[a-z0-9.]*' "$LOGS/tunnel.log" | head -1)"
  else
    fail "адрес не получен — смотрите $LOGS/tunnel.log"
  fi
fi

# ─── 5. Бот ───

step 'Бот'
if pgrep -f 'ts-node --transpile-only src/index.ts' > /dev/null; then
  ok 'уже работает'
else
  (cd "$ROOT" && nohup npm run dev:bot > "$LOGS/bot.log" 2>&1 &)
  for _ in $(seq 1 30); do
    grep -q 'запущен' "$LOGS/bot.log" 2>/dev/null && break
    sleep 1
  done
  # Имя бота берём из строки запуска, а не первым «@» в логе:
  # там раньше встречается «@app/bot@0.1.0» из вывода npm.
  if grep -q 'Бот @' "$LOGS/bot.log" 2>/dev/null; then
    ok "$(grep -o 'Бот @[A-Za-z0-9_]*' "$LOGS/bot.log" | head -1 | cut -d' ' -f2)"
  else
    fail "не поднялся — смотрите $LOGS/bot.log"
  fi
fi

# ─── Итог ───

MINIAPP_URL=$(grep -E '^MINIAPP_URL=' "$ROOT/.env" | sed -E 's/.*"(.*)"/\1/')

printf '\n────────────────────────────────────────\n'
printf 'Всё готово.\n\n'
printf '  Mini App снаружи  %s\n' "${MINIAPP_URL:-—}"
printf '  Админка           http://localhost:5174\n'
printf '  API               http://localhost:3000/api\n'
printf '\nОткройте бота в Telegram и отправьте /start.\n'
printf 'Логи: %s\n' "$LOGS"
printf '────────────────────────────────────────\n'
