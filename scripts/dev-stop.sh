#!/bin/bash
#
# Останавливает всё, что поднял dev-start.sh.
#
# PostgreSQL по умолчанию остаётся работать: он ничего не потребляет в простое,
# а его повторный запуск — самая долгая часть. Чтобы остановить и его:
#   bash scripts/dev-stop.sh --all

set -u

PGBIN="/Applications/Postgres.app/Contents/Versions/17/bin"
PGDATA="$HOME/Library/Application Support/Postgres/var-17"

# Проверяем, что процесс действительно завершился, а не просто получил сигнал.
# Скрипт туннеля спит в цикле по 15 секунд, а bash откладывает обработку
# сигнала до конца текущей команды — сразу после pkill он ещё жив.
stop() {
  local pattern="$1" name="$2"

  if ! pgrep -f "$pattern" > /dev/null; then
    echo "  · $name не запущен"
    return
  fi

  pkill -f "$pattern" 2>/dev/null

  for _ in $(seq 1 20); do
    pgrep -f "$pattern" > /dev/null || { echo "  ✓ $name остановлен"; return; }
    sleep 1
  done

  # Не отреагировал на мягкую остановку — снимаем принудительно.
  pkill -9 -f "$pattern" 2>/dev/null
  sleep 1
  if pgrep -f "$pattern" > /dev/null; then
    echo "  ✗ $name не удалось остановить" >&2
  else
    echo "  ✓ $name остановлен принудительно"
  fi
}

echo 'Останавливаю:'
# Туннель — первым: иначе супервизор поднимет ssh заново.
stop 'dev-tunnel.sh' 'туннель'
stop 'nokey@localhost.run' 'ssh-соединение'
stop 'ts-node --transpile-only src/index.ts' 'бот'
stop 'node dist/src/main.js' 'API'
stop 'node_modules/.bin/vite' 'фронтенды'

if [ "${1:-}" = '--all' ]; then
  if "$PGBIN/pg_isready" -p 5432 -q 2>/dev/null; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop > /dev/null 2>&1 && echo '  ✓ PostgreSQL остановлен'
  else
    echo '  · PostgreSQL не запущен'
  fi
else
  echo '  · PostgreSQL оставлен работать (--all чтобы остановить)'
fi

echo
echo 'Данные на диске не затронуты.'
