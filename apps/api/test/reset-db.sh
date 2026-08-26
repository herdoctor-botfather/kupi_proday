#!/bin/bash
# Возвращает базу в состояние после сида: удаляет пользователей, отзывы и
# активность, оставляя каталог. DELETE, а не TRUNCATE CASCADE — последний
# каскадом снесёт и специалистов, у которых есть внешний ключ на пользователя.
set -e
PSQL="${PSQL_BIN:-psql}"
DB="${DATABASE_URL:-postgresql://app:app@localhost:5432/tgspec}"

# Анкеты, поданные через приложение, — тоже результат прогона: без их
# удаления адреса карточек остаются занятыми и slug следующей анкеты
# получает суффикс, ломая повторяемость тестов.
"$PSQL" "$DB" -q -c "DELETE FROM specialists WHERE \"isSelfRegistered\" = true;" \
                 -c "DELETE FROM reviews;" \
                 -c "DELETE FROM profile_views;" \
                 -c "DELETE FROM favorites;" \
                 -c "DELETE FROM audit_logs;" \
                 -c "DELETE FROM users;" \
                 -c "UPDATE specialists SET \"ratingAvg\"=0, \"ratingCount\"=0, \"viewCount\"=0;"
echo "База возвращена в состояние после сида."
