#!/usr/bin/env bash
#
# Прогон всех наборов подряд.
#
# Наборы рассчитаны на чистую базу и на то, что API знает их тестовый токен,
# поэтому рабочий экземпляр для проверки не годится: у него настоящий токен,
# а в базе живые пользователи и привязки анкет, которые прогон затёр бы.
# Скрипт поднимает отдельный API на своей базе, гоняет наборы и убирает за собой.
set -eu
cd "$(dirname "$0")/.."

TEST_PORT="${TEST_API_PORT:-3100}"
TEST_DB="${TEST_DB_NAME:-tgspec_test}"
TEST_TOKEN='123456:TEST-TOKEN-FOR-VERIFICATION'

# psql лежит внутри Postgres.app и в PATH обычно не попадает —
# ищем его сам, чтобы наборы запускались без ручной подготовки.
if [ -z "${PSQL_BIN:-}" ]; then
  if command -v psql > /dev/null 2>&1; then
    PSQL_BIN="$(command -v psql)"
  else
    PSQL_BIN="$(ls -d /Applications/Postgres.app/Contents/Versions/*/bin/psql 2> /dev/null | tail -1)"
  fi
fi

if [ -z "$PSQL_BIN" ]; then
  echo "psql не найден: укажите путь через PSQL_BIN" >&2
  exit 1
fi
export PSQL_BIN

# Настройки берём из общего .env, но базу и токен подменяем на тестовые.
set -a
# shellcheck disable=SC1091
. ../../.env
set +a

ADMIN_URL="$(printf '%s' "$DATABASE_URL" | sed 's#/[^/]*$#/postgres#')"
export DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed "s#/[^/]*\$#/$TEST_DB#")"
export TELEGRAM_BOT_TOKEN="$TEST_TOKEN"
export NOTIFICATIONS_ENABLED=false
export API_PORT="$TEST_PORT"
export API_URL="http://localhost:$TEST_PORT/api"

# Базу пересоздаём целиком: так прогон не зависит от того, чем закончился
# предыдущий, и ни один набор не видит чужих остатков.
echo "Готовим базу $TEST_DB..."
"$PSQL_BIN" "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $TEST_DB;" -c "CREATE DATABASE $TEST_DB;"
npx prisma db push --skip-generate > /dev/null
npx ts-node --transpile-only prisma/seed.ts > /dev/null

if [ ! -f dist/src/main.js ]; then
  echo "Нет сборки: сначала npm run build -w @app/api" >&2
  exit 1
fi

API_PID=''
LOG="$(mktemp -t tgspec-test-api)"
cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2> /dev/null
  rm -f "$LOG"
  return 0
}
trap cleanup EXIT

echo "Поднимаем тестовый API на порту $TEST_PORT..."
node dist/src/main.js > "$LOG" 2>&1 &
API_PID=$!

for _ in $(seq 1 40); do
  curl -sf "$API_URL/health" > /dev/null 2>&1 && break
  sleep 0.5
done

if ! curl -sf "$API_URL/health" > /dev/null 2>&1; then
  echo "Тестовый API не поднялся:" >&2
  tail -20 "$LOG" >&2
  exit 1
fi

SUITES=(security e2e admin onboarding uploads reports chat contacts listings)
failed=()

set +e
for suite in "${SUITES[@]}"; do
  printf '\n\033[1m── %s ──\033[0m\n' "$suite"
  node "test/$suite.test.js" || failed+=("$suite")
done
set -e

printf '\n'
if [ ${#failed[@]} -eq 0 ]; then
  printf '\033[32mВсе наборы прошли\033[0m\n'
else
  printf '\033[31mУпали: %s\033[0m\n' "${failed[*]}"
  exit 1
fi
