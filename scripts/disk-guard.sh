#!/usr/bin/env bash
# Сторож свободного места.
#
# Однажды диск закончился, и первым лёг Postgres: он не смог записать
# контрольную точку и ушёл в аварийное восстановление, а приложение
# начало отвечать «Internal server error» на каждый запрос. Потерять
# базу из-за мусора сборки — слишком дорогая случайность, поэтому
# место теперь стережётся само.
#
# Запускается по расписанию. Сначала убирает то, что можно убрать без
# последствий: кэш сборки Docker и образы, на которые никто не ссылается.
# Если и после уборки места мало — пишет администраторам в Telegram,
# потому что дальше нужен человек.
set -Eeuo pipefail

cd /opt/tgspec
set -a
. ./.env
set +a

used() { df --output=pcent / | tail -1 | tr -dc '0-9'; }

BEFORE=$(used)

# Уборка при заполнении выше двух третей: ждать «красной зоны» нельзя —
# сборка следующего образа сама по себе занимает несколько гигабайт.
if [ "$BEFORE" -ge 65 ]; then
  docker builder prune -af --filter 'until=24h' >/dev/null 2>&1 || true
  docker image prune -af --filter 'until=24h' >/dev/null 2>&1 || true
fi

AFTER=$(used)
echo "$(date '+%F %T') занято: было ${BEFORE}%, стало ${AFTER}%"

[ "$AFTER" -lt 85 ] && exit 0

# Место кончается всерьёз — зовём людей.
TEXT="⚠️ <b>Мало места на сервере</b>%0A%0AЗанято ${AFTER}% диска. Уборка кэша уже сделана, нужно посмотреть вручную: docker system df, du -sh /var/log /var/lib/docker."
IFS=',' read -ra IDS <<< "${ADMIN_TELEGRAM_IDS:-}"
for id in "${IDS[@]}"; do
  [ -z "$id" ] && continue
  curl -s -o /dev/null --max-time 10 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${id}&parse_mode=HTML&text=${TEXT}" || true
done
