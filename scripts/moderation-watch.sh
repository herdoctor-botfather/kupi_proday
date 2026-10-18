#!/usr/bin/env bash
# Напоминание о непросмотренной очереди.
#
# Объявления, анкеты и отзывы ждут решения администратора, но узнать
# о них можно было, только зайдя в админку по своей воле. На деле это
# значит, что человек, разместивший объявление вечером, видит его
# на витрине через день — и уходит.
#
# Скрипт раз в полчаса смотрит, есть ли что-то в очереди, и пишет
# администраторам в Telegram. Повторяет не чаще раза в три часа, пока
# состав очереди не изменился: напоминание, которое приходит каждые
# полчаса, перестают читать.
set -Eeuo pipefail

cd /opt/tgspec
set -a
. ./.env
set +a

STATE=/var/tmp/tgspec-moderation.state
COOLDOWN=$(( 3 * 60 * 60 ))

sql() {
  docker compose -f docker-compose.prod.yml exec -T db \
    psql -At -U "${POSTGRES_USER:-app}" -d "${POSTGRES_DB:-tgspec}" -c "$1" 2>/dev/null | tr -d '[:space:]'
}

LISTINGS=$(sql "select count(*) from listings where status='PENDING';")
SPECIALISTS=$(sql "select count(*) from specialists where status='PENDING';")
REVIEWS=$(sql "select count(*) from reviews where status='PENDING';")

# База не ответила — молчим: о недоступности сообщает другой сторож.
[ -z "$LISTINGS" ] && exit 0

TOTAL=$(( LISTINGS + SPECIALISTS + REVIEWS ))
if [ "$TOTAL" -eq 0 ]; then
  rm -f "$STATE"
  exit 0
fi

# Повторяем, только если очередь изменилась или прошло три часа.
SIGNATURE="${LISTINGS}-${SPECIALISTS}-${REVIEWS}"
if [ -f "$STATE" ]; then
  PREV=$(cut -d' ' -f1 "$STATE")
  WHEN=$(cut -d' ' -f2 "$STATE")
  if [ "$PREV" = "$SIGNATURE" ] && [ $(( $(date +%s) - WHEN )) -lt "$COOLDOWN" ]; then
    exit 0
  fi
fi
echo "$SIGNATURE $(date +%s)" > "$STATE"

LINES=""
[ "$LISTINGS" -gt 0 ] && LINES="${LINES}📦 Объявлений: ${LISTINGS}%0A"
[ "$SPECIALISTS" -gt 0 ] && LINES="${LINES}🔧 Анкет мастеров: ${SPECIALISTS}%0A"
[ "$REVIEWS" -gt 0 ] && LINES="${LINES}⭐️ Отзывов: ${REVIEWS}%0A"

TEXT="🗂 <b>Ждут проверки</b>%0A%0A${LINES}%0AОткройте админку: https://${ADMIN_DOMAIN}"

IFS=',' read -ra IDS <<< "${ADMIN_TELEGRAM_IDS:-}"
for id in "${IDS[@]}"; do
  [ -z "$id" ] && continue
  curl -s -m 15 -o /dev/null \
    --data-urlencode "chat_id=$id" \
    --data-urlencode "text=$TEXT" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_web_page_preview=true" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" || true
done
