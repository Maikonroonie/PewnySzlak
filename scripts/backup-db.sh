#!/usr/bin/env bash
# Kopia zapasowa bazy (zgłoszenia, bariery, dowody, sygnały, placówki, log operatora).
# Graf OSM jest odtwarzalny z importu, ale też trafia do kopii (pg_dump całej bazy, format custom, skompresowany).
# Użycie: scripts/backup-db.sh [katalog]   (domyślnie data/backups). Zachowuje 14 ostatnich kopii.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR="${1:-data/backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/pewnyszlak-$STAMP.dump"
POSTGRES_USER="${POSTGRES_USER:-pewnyszlak}"
POSTGRES_DB="${POSTGRES_DB:-pewnyszlak}"
if docker compose ps db --status running >/dev/null 2>&1 && [ -n "$(docker compose ps -q db 2>/dev/null)" ]; then
  docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$FILE"
else
  : "${DATABASE_URL:?Ustaw DATABASE_URL albo uruchom bazę przez docker compose}"
  pg_dump "$DATABASE_URL" -Fc > "$FILE"
fi
echo "Zapisano: $FILE ($(du -h "$FILE" | cut -f1))"
# rotacja
ls -1t "$OUT_DIR"/pewnyszlak-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "Przywracanie: docker compose exec -T db pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists < $FILE"
