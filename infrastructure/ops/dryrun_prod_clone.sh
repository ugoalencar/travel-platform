#!/usr/bin/env bash
# ============================================================
# OPERATIONAL (not a migration): T0 dry run on a LOCAL PostgreSQL 17 clone
# ============================================================
# docs/release/REMOTE_MIGRATION_RUNBOOK_084_095.md, section 1 / T0.
#
# Restores a production schema-only dump (dump_prod_schema.sh) into a local
# postgres:17 container, emulates the Supabase ownership model (non-superuser
# owner with CREATEROLE/CREATEDB/BYPASSRLS + default privileges for
# anon/authenticated/service_role) and replays the production window:
#   T1 084..094 -> T2 runtime password rotation + platform role -> T3 095
#   -> T3b 096 (applied twice: idempotence) -> verify_084_095 + verify_096.
#
# LOCAL ONLY by construction: it never receives a database URL. Every
# statement runs through `docker exec` into a container whose published
# ports are bound to loopback, on a local Docker engine. DROP DATABASE /
# DROP SCHEMA can therefore never reach a remote host.
#
# Usage:
#   bash infrastructure/ops/dryrun_prod_clone.sh <schema_dump.sql> [options]
# Options:
#   --create-container  create PG17_CONTAINER (postgres:17, 127.0.0.1 only) if missing
#   --role-test         also run test_096_data_api_roles.sql (SET ROLE anon/authenticated)
#   --keep              keep the clone database afterwards (default: dropped)
# Env: PG17_CONTAINER (default tp-pg17-dryrun), PG17_PORT (default 55717),
#      CLONE_DB (default prod_clone).
# Exit 0 only when verify_084_095 = 47/47 and verify_096 = 15/15
# (and, with --role-test, 0 allowed attempts).
# ============================================================
set -euo pipefail

die() { echo "dryrun: $*" >&2; exit 1; }
step() { echo "== $*"; }

DUMP="${1:-}"
[ -n "$DUMP" ] || die "usage: dryrun_prod_clone.sh <schema_dump.sql> [--create-container] [--role-test] [--keep]"
shift
CREATE_CONTAINER=0; ROLE_TEST=0; KEEP=0
for arg in "$@"; do
  case "$arg" in
    --create-container) CREATE_CONTAINER=1 ;;
    --role-test) ROLE_TEST=1 ;;
    --keep) KEEP=1 ;;
    *) die "unknown option: $arg" ;;
  esac
done

C="${PG17_CONTAINER:-tp-pg17-dryrun}"
PORT="${PG17_PORT:-55717}"
DB="${CLONE_DB:-prod_clone}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
M="$REPO/infrastructure/migrations"
OPS="$REPO/infrastructure/ops"
EXPECT_084_095=47
EXPECT_096=15

# ---------- guards ----------
[[ "$DB" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "invalid CLONE_DB name"
case "$DB" in postgres|template0|template1) die "CLONE_DB may not be $DB" ;; esac
[ -f "$DUMP" ] || die "dump file not found"
grep -q 'PostgreSQL database dump' "$DUMP" || die "not a pg_dump plain-text file"
grep -q '^CREATE TABLE "public"."agencies"' "$DUMP" || die "dump does not look like the production public schema"

case "${DOCKER_HOST:-}" in
  ""|npipe://*|unix://*) ;;
  *) die "DOCKER_HOST points to a non-local engine; refusing" ;;
esac
ENDPOINT="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
case "$ENDPOINT" in
  npipe://*|unix://*) ;;
  *) die "current docker context is not a local engine; refusing" ;;
esac

if [ "$(docker inspect -f '{{.Name}}' "$C" 2>/dev/null || true)" = "" ]; then
  if [ "$CREATE_CONTAINER" = "1" ]; then
    SUPERUSER_PW="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")"
    POSTGRES_PASSWORD="$SUPERUSER_PW" docker run -d --name "$C" -e POSTGRES_PASSWORD \
      -p "127.0.0.1:$PORT:5432" postgres:17 >/dev/null
    unset SUPERUSER_PW
  else
    die "container $C not found (use --create-container)"
  fi
fi
BINDINGS="$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}={{.HostPort}} {{end}}{{end}}' "$C")"
for binding in $BINDINGS; do
  case "${binding%%=*}" in 127.0.0.1|::1) ;; *) die "container $C publishes port ${binding#*=} on '${binding%%=*}' (must be 127.0.0.1 or ::1)" ;; esac
done
if [ "$(docker inspect -f '{{.State.Running}}' "$C")" != "true" ]; then docker start "$C" >/dev/null; fi

for _ in $(seq 1 60); do docker exec "$C" pg_isready -U postgres -q 2>/dev/null && break; sleep 1; done
docker exec "$C" pg_isready -U postgres -q || die "PostgreSQL in $C is not ready"
VERSION_NUM="$(docker exec "$C" psql -U postgres -At -c 'show server_version_num')"
[ "$VERSION_NUM" -ge 170000 ] && [ "$VERSION_NUM" -lt 180000 ] || die "container must run PostgreSQL 17"

SU() { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }             # container superuser
AS() { docker exec -i "$C" psql -U sb_postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }     # emulated Supabase `postgres`
VARS=(-v runtime_role=travel_app_runtime -v platform_role=travel_app_platform)
ERR="$(mktemp)"
trap 'rm -f "$ERR"' EXIT

random_pw() { node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))"; }
scram() { printf '%s' "$1" | node "$OPS/scram_verifier.cjs"; }
login_as() { # role password -> current_user, over TCP with password auth (not the trusted socket)
  PGPASSWORD="$2" docker exec -e PGPASSWORD "$C" sh -c \
    "psql -h \"\$(hostname -i | cut -d' ' -f1)\" -U $1 -d $DB -At -c 'select current_user'"
}
apply() {
  local f="$1" flag="--single-transaction" mode="single-transaction"
  if grep -qiE "ADD VALUE" "$f"; then flag=""; mode="autocommit"; fi
  if AS -q $flag -f - < "$f" > /dev/null 2> "$ERR"; then
    echo "   ok $(basename "$f") [$mode]"
  else
    echo "   FALHOU $(basename "$f") [$mode]"; grep -m3 ERROR "$ERR" || true; exit 1
  fi
}
verify() { # file expected label -> prints PASS/FAIL counts, returns non-zero unless all pass
  local out pass fail
  out="$(AS -At -F'|' "${VARS[@]}" -f - < "$1" 2>&1)" || { echo "$out" | grep -m3 ERROR; return 1; }
  pass="$(printf '%s\n' "$out" | awk -F'|' '$3=="PASS"' | wc -l | tr -d ' ')"
  fail="$(printf '%s\n' "$out" | awk -F'|' '$3=="FAIL"' | wc -l | tr -d ' ')"
  echo "   $3: PASS=$pass FAIL=$fail (esperado $2/$2)"
  printf '%s\n' "$out" | awk -F'|' '$3=="FAIL" {print "      FAIL: " $2}'
  [ "$fail" = "0" ] && [ "$pass" = "$2" ]
}

# ---------- 1. roles + clone ----------
step "1. clone local ($C, PostgreSQL $VERSION_NUM) + emulação Supabase"
SU -d postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sb_postgres') THEN
    CREATE ROLE sb_postgres LOGIN NOSUPERUSER CREATEROLE CREATEDB BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN; END IF;
END $$;
SQL
SU -d postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" -c "DROP ROLE IF EXISTS travel_app_platform" \
   -c "DROP ROLE IF EXISTS travel_app_runtime"
# runtime role is created by the emulated owner, as in production (so it can rotate its password)
docker exec -i "$C" psql -U sb_postgres -d postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE ROLE travel_app_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"
SU -d postgres -c "CREATE DATABASE \"$DB\"" -c "GRANT anon, authenticated TO sb_postgres" 2>/dev/null
SU -d "$DB" -c "DROP SCHEMA public CASCADE"
SU -d "$DB" -f - < "$DUMP" > /dev/null 2> "$ERR" || { echo "   restore FALHOU"; grep -m5 ERROR "$ERR"; exit 1; }
SU -d "$DB" -c "GRANT CREATE ON DATABASE \"$DB\" TO sb_postgres"
SU -d "$DB" <<'SQL'
DO $$
DECLARE r RECORD;
BEGIN
  EXECUTE 'ALTER SCHEMA public OWNER TO sb_postgres';
  FOR r IN SELECT c.oid::regclass AS obj, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'S', 'p') LOOP
    IF r.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = r.obj::oid AND d.deptype IN ('a', 'i')) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER %s %s OWNER TO sb_postgres',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.obj);
  END LOOP;
  FOR r IN SELECT t.oid::regtype AS obj FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c')
              AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid) LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO sb_postgres', r.obj);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS obj FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO sb_postgres', r.obj);
  END LOOP;
END $$;
-- production default privileges belong to the migration role (postgres there, sb_postgres here)
ALTER DEFAULT PRIVILEGES FOR ROLE sb_postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE sb_postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE sb_postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL
echo "   tabelas restauradas: $(AS -At -c "select count(*) from pg_tables where schemaname = 'public'")"

# ---------- 2. baseline ----------
step "2. precheck (esperado f|f|f|t = 083)"
echo "   $(AS -At -c "SELECT (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'offers' AND column_name = 'featured'))::text
  || '|' || (to_regclass('public.agency_communications') IS NOT NULL)::text
  || '|' || (EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'EngagementType' AND e.enumlabel = 'OFFER_VIEWED'))::text
  || '|' || (to_regclass('public.customer_protocol_seq') IS NOT NULL)::text")"

# ---------- 3. window ----------
step "3. T1 084..094"
for f in $(ls "$M"/0*.sql | awk -F/ '{n=substr($NF,1,3)} n>="084" && n<="094"' | sort); do apply "$f"; done

step "4. T2 rotação da senha da runtime + role de plataforma (senhas efêmeras, só verificador SCRAM)"
RUNTIME_PW="$(random_pw)"
AS -q -v runtime_password_scram="$(scram "$RUNTIME_PW")" -f - < "$OPS/rotate_runtime_password.sql" > /dev/null
echo "   login runtime: $(login_as travel_app_runtime "$RUNTIME_PW")"
PLATFORM_PW="$(random_pw)"
AS -q -v platform_password_scram="$(scram "$PLATFORM_PW")" -f - < "$OPS/create_platform_role.sql" > /dev/null
echo "   login plataforma: $(login_as travel_app_platform "$PLATFORM_PW")"
unset RUNTIME_PW PLATFORM_PW

step "5. T3 095"
apply "$M/095_platform_role_separation.sql"
verify "$OPS/verify_084_095.sql" "$EXPECT_084_095" verify_084_095

step "6. T3b 096 (aplicada duas vezes: idempotência)"
apply "$M/096_supabase_data_api_hardening.sql"
apply "$M/096_supabase_data_api_hardening.sql"

step "7. verificação final"
RESULT=0
verify "$OPS/verify_084_095.sql" "$EXPECT_084_095" verify_084_095 || RESULT=1
verify "$OPS/verify_096_data_api.sql" "$EXPECT_096" verify_096 || RESULT=1

if [ "$ROLE_TEST" = "1" ]; then
  step "8. teste comportamental anon/authenticated"
  OUT="$(SU -d "$DB" -At -F'|' "${VARS[@]}" -v i_am_not_production=yes -f - < "$OPS/test_096_data_api_roles.sql" 2>&1)"
  ALLOWED="$(printf '%s\n' "$OUT" | awk -F'|' '($1=="anon"||$1=="authenticated") && NF==5 {s+=$5} END {print s+0}')"
  ATTEMPTS="$(printf '%s\n' "$OUT" | awk -F'|' '($1=="anon"||$1=="authenticated") && NF==5 {s+=$3} END {print s+0}')"
  echo "   tentativas=$ATTEMPTS permitidas=$ALLOWED (esperado 0)"
  [ "$ALLOWED" = "0" ] && [ "$ATTEMPTS" -gt 0 ] || RESULT=1
fi

if [ "$KEEP" = "0" ]; then
  SU -d postgres -c "DROP DATABASE \"$DB\" WITH (FORCE)" -c "DROP ROLE IF EXISTS travel_app_platform"
  echo "   clone removido (use --keep para inspecionar)"
fi

if [ "$RESULT" = "0" ]; then echo "DRY RUN: PASS"; else echo "DRY RUN: FAIL"; exit 1; fi
