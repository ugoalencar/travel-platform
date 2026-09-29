#!/usr/bin/env bash
# ============================================================
# OPERATIONAL (not a migration): schema-only dump of production `public`
# ============================================================
# Step T0 (dry run) of docs/release/REMOTE_MIGRATION_RUNBOOK_084_095.md.
# READ-ONLY against production: pg_dump --schema-only (no row data), over
# TLS, using pg_dump 17 from the local postgres:17 container.
#
# Required env (never hardcode, never commit):
#   DATABASE_ADMIN_URL  production owner connection (session mode, port 5432)
# Optional:
#   PG17_CONTAINER      local postgres:17 container (default tp-pg17-dryrun)
#
# Usage:
#   bash infrastructure/ops/dump_prod_schema.sh /path/outside/repo/prod_schema.sql
#
# The URL reaches pg_dump only through the environment (never argv, never
# printed). Output: the dump file plus size, SHA-256 and table count.
# ============================================================
set -euo pipefail

: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is required}"
OUT="${1:?usage: dump_prod_schema.sh <output.sql outside the repository>}"
C="${PG17_CONTAINER:-tp-pg17-dryrun}"

OUT_DIR="$(cd "$(dirname "$OUT")" && pwd)"
case "$OUT_DIR" in
  */travel-platform|*/travel-platform/*) echo "Refusing: output must be outside the repository." >&2; exit 1 ;;
esac

if [ "$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)" != "true" ]; then
  echo "Refusing: container $C is not running (start it or run dryrun_prod_clone.sh --create-container)." >&2
  exit 1
fi

TMP="$OUT.partial"
PGURL="$DATABASE_ADMIN_URL" docker exec -e PGURL -e PGSSLMODE=require "$C" sh -c \
  'pg_dump "$PGURL" --schema-only --schema=public --no-owner --quote-all-identifiers' > "$TMP"
mv "$TMP" "$OUT"

echo "dump:   $(basename "$OUT")"
echo "bytes:  $(wc -c < "$OUT" | tr -d ' ')"
echo "sha256: $(sha256sum "$OUT" | cut -d' ' -f1)"
echo "tables: $(grep -c '^CREATE TABLE "public"\.' "$OUT")"
