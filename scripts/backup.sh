#!/usr/bin/env bash
#
# Резервная копия базы и загруженных файлов.
#
#   /opt/tgspec/scripts/backup.sh
#
# Кладёт в /opt/tgspec-backups два файла с отметкой времени: дамп базы
# и архив фотографий. Старые копии удаляет, оставляя за последние
# KEEP_DAYS дней.
#
# Почему обе части вместе: без фотографий восстановленная база покажет
# карточки с битыми картинками, а без базы фотографии — просто папка
# с файлами, о которых ничего не известно.

set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"
DEST=${BACKUP_DIR:-/opt/tgspec-backups}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d_%H-%M)

# shellcheck disable=SC1091
set -a; . ./.env; set +a

mkdir -p "$DEST"

echo "→ База"
$COMPOSE exec -T db pg_dump \
  -U "${POSTGRES_USER:-app}" \
  -d "${POSTGRES_DB:-tgspec}" \
  --no-owner --clean --if-exists \
  | gzip > "$DEST/db-$STAMP.sql.gz"
echo "  $(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1)  db-$STAMP.sql.gz"

echo "→ Файлы"
# Читаем том через временный контейнер: снаружи путь к нему зависит
# от версии Docker, а изнутри он всегда один и тот же.
docker run --rm \
  -v tgspec_uploads:/data:ro \
  -v "$DEST":/backup \
  alpine tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .
echo "  $(du -h "$DEST/uploads-$STAMP.tar.gz" | cut -f1)  uploads-$STAMP.tar.gz"

echo "→ Убираю старое (храним $KEEP_DAYS дней)"
DELETED=$(find "$DEST" -name '*.gz' -mtime "+$KEEP_DAYS" -print -delete | wc -l)
echo "  удалено файлов: $DELETED"

echo
echo "Готово. Всего копий: $(find "$DEST" -name 'db-*.sql.gz' | wc -l), занято $(du -sh "$DEST" | cut -f1)"
