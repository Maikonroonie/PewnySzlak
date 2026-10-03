#!/usr/bin/env bash
# Przywrócenie bazy z kopii: scripts/restore-db.sh data/backups/pewnyszlak-YYYYMMDDTHHMMSSZ.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Podaj plik kopii (.dump)}"
POSTGRES_USER="${POSTGRES_USER:-pewnyszlak}"
POSTGRES_DB="${POSTGRES_DB:-pewnyszlak}"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$FILE"
echo "Przywrócono z $FILE. Zrestartuj API (docker compose restart api), aby wczytać graf."
