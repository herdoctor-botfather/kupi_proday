#!/usr/bin/env bash
#
# Восстановление из резервной копии.
#
#   /opt/tgspec/scripts/restore.sh 2026-08-31_03-15
#
# Принимает отметку времени копии. Заменяет содержимое базы и файлов
# на сохранённое — то, что накопилось после копии, будет потеряно,
# поэтому требует подтверждения.

set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"
DEST=${BACKUP_DIR:-/opt/tgspec-backups}
STAMP=${1:-}

if [ -z "$STAMP" ]; then
  echo "Укажите отметку времени копии. Доступные:"
  find "$DEST" -name 'db-*.sql.gz' -exec basename {} \; | sed 's/^db-//; s/\.sql\.gz$//' | sort | sed 's/^/  /'
  exit 1
fi

DB_FILE="$DEST/db-$STAMP.sql.gz"
UP_FILE="$DEST/uploads-$STAMP.tar.gz"
[ -f "$DB_FILE" ] || { echo "Нет файла $DB_FILE" >&2; exit 1; }

# shellcheck disable=SC1091
set -a; . ./.env; set +a

echo "Будет восстановлено состояние на $STAMP."
echo "Всё, что появилось позже, пропадёт безвозвратно."
printf 'Введите ВОССТАНОВИТЬ для подтверждения: '
read -r answer
[ "$answer" = "ВОССТАНОВИТЬ" ] || { echo "Отменено"; exit 1; }

echo "→ Останавливаю приложение, чтобы никто не писал в базу"
$COMPOSE stop api bot

echo "→ База"
gunzip -c "$DB_FILE" | $COMPOSE exec -T db psql -U "${POSTGRES_USER:-app}" -d "${POSTGRES_DB:-tgspec}" > /dev/null
echo "  восстановлена"

if [ -f "$UP_FILE" ]; then
  echo "→ Файлы"
  docker run --rm -v tgspec_uploads:/data -v "$DEST":/backup alpine \
    sh -c 'rm -rf /data/* && tar xzf "/backup/'"uploads-$STAMP.tar.gz"'" -C /data'
  echo "  восстановлены"
fi

echo "→ Поднимаю приложение"
$COMPOSE start api bot
echo
echo "Готово."
