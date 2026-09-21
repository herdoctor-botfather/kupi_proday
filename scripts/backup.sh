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

# ─── Копия за пределами сервера ───
#
# Копии, лежащие рядом с базой, не спасают от главной беды — потери
# самого сервера. Поэтому каждую ночь бот присылает их владельцу
# в личный чат Telegram: хранилище бесплатное и к серверу не привязано.
#
# В дампе личные данные и переписка пользователей, поэтому уходит он
# только зашифрованным паролем BACKUP_PASSWORD. Без пароля файл
# бесполезен; пароль хранится у владельца, отдельно от копий.
#
# Расшифровать:
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:ПАРОЛЬ -in db-….sql.gz.enc -out db-….sql.gz
if [ -n "${BACKUP_PASSWORD:-}" ] && [ -n "${ADMIN_TELEGRAM_IDS:-}" ]; then
  echo "→ Отправляю зашифрованную копию владельцу в Telegram"
  CHAT=${ADMIN_TELEGRAM_IDS%%,*}
  for FILE in "$DEST/db-$STAMP.sql.gz" "$DEST/uploads-$STAMP.tar.gz"; do
    # Бот не принимает файлы больше 50 МБ; фотографии со временем
    # перерастут этот предел, и тогда уходит только база.
    if [ "$(stat -c %s "$FILE")" -gt 45000000 ]; then
      echo "  $(basename "$FILE") больше 45 МБ — пропускаю"
      continue
    fi
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSWORD -in "$FILE" -out "$FILE.enc"
    if curl -sf -m 300 -F chat_id="$CHAT" -F disable_notification=true \
        -F caption="Резервная копия NADO $STAMP (зашифрована)" \
        -F document=@"$FILE.enc" \
        "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendDocument" > /dev/null; then
      echo "  отправлено: $(basename "$FILE").enc"
    else
      echo "  НЕ отправлено: $(basename "$FILE").enc" >&2
    fi
    rm -f "$FILE.enc"
  done
fi

echo "→ Убираю старое (храним $KEEP_DAYS дней)"
DELETED=$(find "$DEST" -name '*.gz' -mtime "+$KEEP_DAYS" -print -delete | wc -l)
echo "  удалено файлов: $DELETED"

echo
echo "Готово. Всего копий: $(find "$DEST" -name 'db-*.sql.gz' | wc -l), занято $(du -sh "$DEST" | cut -f1)"
