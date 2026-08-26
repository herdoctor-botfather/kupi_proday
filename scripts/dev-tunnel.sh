#!/bin/bash
#
# Держит публичный HTTPS-туннель к локальному Mini App и переносит бота на него.
#
# Зачем: Telegram открывает Mini App только по https с внешнего домена, а
# бесплатные туннели выдают случайный адрес и время от времени рвутся. Скрипт
# переподключается сам и после каждого нового адреса переписывает MINIAPP_URL
# в .env и кнопку меню бота — иначе после обрыва пользователь видит
# «no tunnel here» и приходится всё настраивать заново руками.
#
# Использование:
#   bash scripts/dev-tunnel.sh          # порт 5173 (Mini App)
#   bash scripts/dev-tunnel.sh 5174     # другой порт, например админка
#
# Остановка — Ctrl+C. Для постоянной работы нужен свой домен,
# см. docs/deployment.md.

set -u

PORT="${1:-5173}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
LOG="$ROOT/.tunnel.log"

if [ ! -f "$ENV_FILE" ]; then
  echo "Не найден $ENV_FILE — скопируйте .env.example в .env" >&2
  exit 1
fi

BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'"' -f2)
if [ -z "$BOT_TOKEN" ]; then
  echo "В .env не заполнен TELEGRAM_BOT_TOKEN" >&2
  exit 1
fi

cleanup() {
  echo
  echo "Останавливаю туннель..."
  [ -n "${SSH_PID:-}" ] && kill "$SSH_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Переписывает MINIAPP_URL в .env и переносит кнопку меню бота на новый адрес.
apply_url() {
  local url="$1"

  # sed -i на macOS требует аргумент суффикса; пишем через временный файл,
  # чтобы скрипт одинаково работал и на macOS, и на Linux.
  local tmp
  tmp=$(mktemp)
  sed -E "s#^MINIAPP_URL=\".*\"#MINIAPP_URL=\"$url\"#" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"

  local response
  response=$(curl -s -m 20 -X POST \
    "https://api.telegram.org/bot$BOT_TOKEN/setChatMenuButton" \
    -H 'Content-Type: application/json' \
    -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Каталог\",\"web_app\":{\"url\":\"$url\"}}}")

  if echo "$response" | grep -q '"ok":true'; then
    echo "  кнопка меню бота обновлена"
  else
    echo "  не удалось обновить кнопку бота: $response" >&2
  fi
}

echo "Туннель к http://localhost:$PORT"
echo "Логи ssh: $LOG"
echo

CURRENT_URL=""

while true; do
  : > "$LOG"

  ssh -o StrictHostKeyChecking=accept-new \
      -o ServerAliveInterval=20 \
      -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=yes \
      -R "80:localhost:$PORT" nokey@localhost.run > "$LOG" 2>&1 &
  SSH_PID=$!

  # Ждём адрес не дольше минуты: если за это время его нет, соединение не удалось.
  URL=""
  for _ in $(seq 1 30); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.lhr\.life' "$LOG" | head -1)
    [ -n "$URL" ] && break
    kill -0 "$SSH_PID" 2>/dev/null || break
    sleep 2
  done

  if [ -z "$URL" ]; then
    echo "Не удалось получить адрес, повтор через 10 секунд"
    kill "$SSH_PID" 2>/dev/null
    sleep 10
    continue
  fi

  if [ "$URL" != "$CURRENT_URL" ]; then
    CURRENT_URL="$URL"
    echo "Адрес: $URL"
    apply_url "$URL"
    echo "  Mini App открывается кнопкой в боте"
    echo
  fi

  # Держим соединение и следим, что туннель действительно отвечает:
  # ssh может оставаться живым уже после того, как сервис его закрыл.
  while kill -0 "$SSH_PID" 2>/dev/null; do
    sleep 15
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$URL/" 2>/dev/null)
    if [ "$code" != "200" ]; then
      echo "Туннель перестал отвечать (код ${code:-нет ответа}), переподключаюсь"
      kill "$SSH_PID" 2>/dev/null
      break
    fi
  done

  wait "$SSH_PID" 2>/dev/null
  echo "Соединение разорвано, восстанавливаю через 5 секунд"
  sleep 5
done
