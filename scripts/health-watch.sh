#!/usr/bin/env bash
# Сторож работоспособности.
#
# Запускается по расписанию каждые пять минут. Спрашивает у приложения,
# живо ли оно, и если дважды подряд ответа нет — пробует поднять API сам
# и пишет администраторам в Telegram. Когда приложение возвращается,
# приходит второе сообщение: иначе человек, получивший тревогу ночью,
# не знает, нужно ли вставать.
#
# Честная оговорка: сторож живёт на том же сервере, что и приложение.
# Он видит упавший контейнер, зависшую базу, переполненный диск — то есть
# почти всё, что случается на деле. Но если умрёт сама машина или
# пропадёт её сеть, сообщить будет некому. От этого защищает только
# внешняя проверка со стороны.
set -Eeuo pipefail

cd /opt/tgspec
set -a
. ./.env
set +a

URL="https://${APP_DOMAIN:-localhost}/api/health"
STATE=/var/tmp/tgspec-health.state
FAILS=$(cat "$STATE" 2>/dev/null || echo 0)

# Переносы строк передаём как есть: curl кодирует их сам. Записанные
# как %0A, они кодировались бы дважды, и человек читал бы «%0A» в тексте.
notify() {
  local text="$1"
  IFS=',' read -ra IDS <<< "${ADMIN_TELEGRAM_IDS:-}"
  for id in "${IDS[@]}"; do
    [ -z "$id" ] && continue
    curl -s -m 15 -o /dev/null \
      --data-urlencode "chat_id=$id" \
      --data-urlencode "text=$text" \
      --data-urlencode "parse_mode=HTML" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" || true
  done
}

# Две попытки с паузой: короткая сетевая заминка не повод будить людей.
if curl -fs -m 20 "$URL" > /dev/null 2>&1 || (sleep 5; curl -fs -m 20 "$URL" > /dev/null 2>&1); then
  # Приложение отвечает. Если до этого была тревога — сообщаем, что всё прошло.
  if [ "$FAILS" -ge 2 ]; then
    notify "✅ <b>NADO снова работает</b>

Приложение отвечает. Было недоступно примерно $(( FAILS * 5 )) минут."
  fi
  echo 0 > "$STATE"
  exit 0
fi

FAILS=$(( FAILS + 1 ))
echo "$FAILS" > "$STATE"

# Первый неответ пропускаем молча: перезапуск после выкладки занимает
# до минуты, и сообщать о нём незачем.
[ "$FAILS" -lt 2 ] && exit 0

# Со второго раза пробуем помочь сами: чаще всего достаточно поднять API.
if [ "$FAILS" -eq 2 ]; then
  docker compose -f docker-compose.prod.yml up -d --no-deps api > /dev/null 2>&1 || true
  sleep 20
  if curl -fs -m 20 "$URL" > /dev/null 2>&1; then
    notify "⚠️ <b>NADO не отвечало</b>

Приложение было недоступно, перезапуск помог. Сейчас работает."
    echo 0 > "$STATE"
    exit 0
  fi
fi

# Не помогло — зовём человека и прикладываем то, что видно отсюда.
STATUS=$(docker compose -f docker-compose.prod.yml ps --format '{{.Service}}: {{.Status}}' 2>&1 | head -4 | tr '\n' ' ')
DISK=$(df --output=pcent / | tail -1 | tr -d ' ')

notify "🔴 <b>NADO не отвечает</b>

Уже $(( FAILS * 5 )) минут. Перезапуск не помог.

Службы: ${STATUS}
Диск занят: ${DISK}

Нужно зайти на сервер."
