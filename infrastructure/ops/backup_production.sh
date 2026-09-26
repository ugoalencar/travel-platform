#!/usr/bin/env bash
# ============================================================
# OPERATIONAL (not a migration): production backup + restore validation
# ============================================================
# Step T0 of docs/release/REMOTE_MIGRATION_RUNBOOK_084_095.md.
# Uses pg_dump/pg_restore 17 from a local postgres:17 container, so no
# client install is needed. Nothing is written to production.
#
# Required env (never hardcode, never commit):
#   DATABASE_ADMIN_URL  production owner connection (session mode, port 5432)
#   BACKUP_DIR          directory OUTSIDE the repo (dumps contain personal data)
# Optional:
#   PG17_CONTAINER      local postgres:17 container (default tp-pg17-dryrun)
#   SCHEMA_ONLY=1       validate the procedure without copying any row data
#
# Output: dump file, <dump>.sha256, manifest.txt with sizes, table count and
# per-table row counts (production vs restored copy).
# ============================================================
set -euo pipefail

: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required (outside the repository)}"
C="${PG17_CONTAINER:-tp-pg17-dryrun}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MODE="full"; DUMP_FLAGS=""
if [ "${SCHEMA_ONLY:-0}" = "1" ]; then MODE="schema-only"; DUMP_FLAGS="--schema-only"; fi
DUMP="$BACKUP_DIR/prod_${MODE}_${STAMP}.dump"
RESTORE_DB="restore_check_${STAMP,,}"
MANIFEST="$BACKUP_DIR/manifest_${MODE}_${STAMP}.txt"
COUNT_TABLES="agencies users customers offers proposals sales receivables payments"

case "$(cd "$BACKUP_DIR" && pwd)" in
  */travel-platform|*/travel-platform/*) echo "BACKUP_DIR must be outside the repository" >&2; exit 1 ;;
esac

log() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$MANIFEST"; }
local_psql() { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

log "mode=$MODE container=$C"
docker exec "$C" pg_dump --version | tee -a "$MANIFEST"

# 1. Dump (custom format). The URL travels only through the child env.
docker exec -e PGURL="$DATABASE_ADMIN_URL" "$C" sh -c \
  "pg_dump \"\$PGURL\" -Fc --schema=public --no-owner $DUMP_FLAGS" > "$DUMP"
log "dump=$(basename "$DUMP") bytes=$(wc -c < "$DUMP")"

# 2. Checksum + archive readability
( cd "$BACKUP_DIR" && sha256sum "$(basename "$DUMP")" > "$(basename "$DUMP").sha256" )
log "sha256=$(cut -d' ' -f1 "$DUMP.sha256")"
docker exec -i "$C" pg_restore --list < "$DUMP" > /dev/null
log "pg_restore --list: OK ($(docker exec -i "$C" pg_restore --list < "$DUMP" | grep -c ' TABLE public ') tables)"

# 3. Restore test into a throwaway database (Supabase default roles first)
for r in anon authenticated service_role supabase_admin travel_app_runtime travel_app_platform; do
  local_psql -d postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$r') THEN EXECUTE 'CREATE ROLE $r NOLOGIN'; END IF; END \$\$;"
done
local_psql -d postgres -c "CREATE DATABASE $RESTORE_DB"
local_psql -d "$RESTORE_DB" -c "DROP SCHEMA public CASCADE"
docker exec -i "$C" pg_restore -U postgres -d "$RESTORE_DB" --exit-on-error < "$DUMP"
log "restore: OK ($(local_psql -d "$RESTORE_DB" -At -c "select count(*) from pg_tables where schemaname='public'") tables restored)"

# 4. Row-count comparison (full mode only)
if [ "$MODE" = "full" ]; then
  for t in $COUNT_TABLES; do
    prod=$(docker exec -e PGURL="$DATABASE_ADMIN_URL" "$C" sh -c "psql \"\$PGURL\" -At -c 'SELECT count(*) FROM public.$t'")
    rest=$(local_psql -d "$RESTORE_DB" -At -c "SELECT count(*) FROM public.$t")
    status=$([ "$prod" = "$rest" ] && echo OK || echo DIVERGENTE)
    log "rows $t prod=$prod restored=$rest $status"
  done
fi

# 5. Drop the restored copy (the dump file itself stays in BACKUP_DIR)
local_psql -d postgres -c "DROP DATABASE $RESTORE_DB WITH (FORCE)"
log "restore copy dropped; backup kept at $DUMP"
