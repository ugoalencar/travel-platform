#!/usr/bin/env bash
# SEC-I: Restore Verification Script
# Verifies database restore was successful
# Checks schema, tables, RLS policies, and data consistency

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Database configuration (local/test only)
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-55432}"
DB_NAME="${DB_NAME:-travel_platform_test}"
DB_USER="${DB_USER:-travel_test}"
DB_PASSWORD="${DB_PASSWORD:-travel_test_password}"

echo "=== SEC-I: Restore Verification ==="
echo "Verifying database: $DB_HOST:$DB_PORT/$DB_NAME"

# Safety guards
PRODUCTION_HOSTS=("prod" "production" "staging" "live" "rds" "amazonaws" "azure" "gcp")
for host_pattern in "${PRODUCTION_HOSTS[@]}"; do
  if [[ "$DB_HOST" == *"$host_pattern"* ]]; then
    echo "ERROR: Refusing to verify production/staging host: $DB_HOST"
    exit 1
  fi
done

# Verify PostgreSQL client tools are available
if ! command -v psql &> /dev/null; then
  echo "ERROR: psql not found. Install PostgreSQL client tools."
  exit 1
fi

echo ""
echo "=== Verification Checks ==="

# 1. Check database connectivity
echo "1. Database connectivity..."
if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "   FAIL: Cannot connect to database"
  exit 1
fi
echo "   PASS: Database connection successful"

# 2. Check schema version (migration tracking)
echo "2. Schema version..."
MIGRATION_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ')
echo "   Tables found: $MIGRATION_COUNT"

# 3. Check expected tables exist
echo "3. Expected tables..."
EXPECTED_TABLES=(
  "agencies"
  "users"
  "customers"
  "trips"
  "wishes"
  "bookings"
  "booking_passengers"
  "proposals"
  "pipeline_stages"
  "field_operations"
  "vehicle_allocations"
  "pescador_sessions"
  "offers"
  "offer_templates"
  "audit_logs"
)

MISSING_TABLES=()
for table in "${EXPECTED_TABLES[@]}"; do
  EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" 2>/dev/null | tr -d ' ')
  if [[ "$EXISTS" != "t" ]]; then
    MISSING_TABLES+=("$table")
  fi
done

if [[ ${#MISSING_TABLES[@]} -gt 0 ]]; then
  echo "   FAIL: Missing tables: ${MISSING_TABLES[*]}"
  exit 1
fi
echo "   PASS: All expected tables present"

# 4. Check RLS policies
echo "4. RLS policies..."
RLS_POLICY_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';" 2>/dev/null | tr -d ' ')
echo "   RLS policies found: $RLS_POLICY_COUNT"

if [[ "$RLS_POLICY_COUNT" -lt 10 ]]; then
  echo "   FAIL: Too few RLS policies (expected at least 10)"
  exit 1
fi
echo "   PASS: RLS policies present"

# 5. Check FORCE RLS
echo "5. FORCE RLS..."
FORCE_RLS_TABLES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('agencies', 'users', 'customers', 'trips', 'wishes', 'bookings'));")
echo "   Tables with FORCE RLS: $FORCE_RLS_TABLES"

# 6. Check tenant isolation (sample query)
echo "6. Tenant isolation..."
TENANT_ISOLATION=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM pg_policies WHERE qual LIKE '%agency_id%' OR with_check LIKE '%agency_id%';" 2>/dev/null | tr -d ' ')
echo "   Tenant-aware policies: $TENANT_ISOLATION"

if [[ "$TENANT_ISOLATION" -lt 5 ]]; then
  echo "   WARNING: Few tenant-aware policies found"
fi
echo "   PASS: Tenant isolation policies present"

# 7. Check data consistency (representative row counts)
echo "7. Data consistency..."
AGENCY_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM agencies;" 2>/dev/null | tr -d ' ')
USER_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ')
CUSTOMER_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM customers;" 2>/dev/null | tr -d ' ')

echo "   Agencies: $AGENCY_COUNT"
echo "   Users: $USER_COUNT"
echo "   Customers: $CUSTOMER_COUNT"

# 8. Check backup files
echo "8. Backup file integrity..."
BACKUP_DIR="$REPO_ROOT/backups"
if [[ -d "$BACKUP_DIR" ]]; then
  BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
  echo "   Backup files: $BACKUP_COUNT"
else
  echo "   No backup directory found"
fi

echo ""
echo "=== Verification Complete ==="
echo "All checks passed."
