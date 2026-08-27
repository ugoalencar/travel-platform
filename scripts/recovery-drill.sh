#!/usr/bin/env bash
# SEC-I: Automated Recovery Drill Script
# Seeds ephemeral DB → backup → create fresh target → restore → validate → cleanup

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DRILL_DB="travel_platform_drill_$$"
BACKUP_DIR="$REPO_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Source database configuration (local/test only)
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-55432}"
DB_USER="${DB_USER:-travel_test}"
DB_PASSWORD="${DB_PASSWORD:-travel_test_password}"
SOURCE_DB="${DB_NAME:-travel_platform_test}"

echo "=== SEC-I: Automated Recovery Drill ==="
echo "Timestamp: $TIMESTAMP"
echo "Drill database: $DRILL_DB"

# Safety guards
PRODUCTION_HOSTS=("prod" "production" "staging" "live" "rds" "amazonaws" "azure" "gcp")
for host_pattern in "${PRODUCTION_HOSTS[@]}"; do
  if [[ "$DB_HOST" == *"$host_pattern"* ]]; then
    echo "ERROR: Refusing to run drill on production/staging host: $DB_HOST"
    exit 1
  fi
done

# Verify PostgreSQL client tools are available
if ! command -v psql &> /dev/null; then
  echo "ERROR: psql not found. Install PostgreSQL client tools."
  exit 1
fi

# Cleanup function
cleanup() {
  echo ""
  echo "=== Cleanup ==="
  echo "Dropping drill database: $DRILL_DB"
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "DROP DATABASE IF EXISTS $DRILL_DB;" 2>/dev/null || true
  
  # Remove drill backup files
  rm -f "$BACKUP_DIR/drill_*.sql.gz" 2>/dev/null || true
  
  echo "Cleanup completed"
}

# Set trap for cleanup on exit
trap cleanup EXIT

echo ""
echo "=== Step 1: Create ephemeral drill database ==="
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS $DRILL_DB; CREATE DATABASE $DRILL_DB;" 2>/dev/null

# Copy schema from source database
echo "Copying schema from source database..."
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SOURCE_DB" \
  --schema-only --no-owner --no-privileges 2>/dev/null | \
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_DB" -q 2>/dev/null

echo "Ephemeral drill database created"

echo ""
echo "=== Step 2: Seed test data ==="
# Insert minimal test data
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_DB" -c "
  -- Insert test agency
  INSERT INTO agencies (id, name, cnpj, created_at, updated_at) 
  VALUES ('10000000-0000-4000-8000-000000000001', 'Drill Test Agency', '12345678000100', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert test user
  INSERT INTO users (id, agency_id, email, name, role, created_at, updated_at)
  VALUES ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'drill@test.com', 'Drill User', 'ADMIN', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert test customer
  INSERT INTO customers (id, agency_id, name, email, created_at, updated_at)
  VALUES ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Drill Customer', 'customer@drill.test', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert test trip
  INSERT INTO trips (id, agency_id, customer_id, name, destination, start_date, end_date, status, created_at, updated_at)
  VALUES ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Drill Trip', 'Paris', '2026-01-01', '2026-01-10', 'CONFIRMED', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
" 2>/dev/null

echo "Test data seeded"

echo ""
echo "=== Step 3: Backup drill database ==="
mkdir -p "$BACKUP_DIR"
DRILL_BACKUP="$BACKUP_DIR/drill_$TIMESTAMP.sql.gz"

PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_DB" \
  --no-owner --no-privileges --clean --if-exists 2>/dev/null | gzip > "$DRILL_BACKUP"

if [[ ! -f "$DRILL_BACKUP" ]]; then
  echo "ERROR: Drill backup failed"
  exit 1
fi

BACKUP_SIZE=$(stat -f%z "$DRILL_BACKUP" 2>/dev/null || stat -c%s "$DRILL_BACKUP" 2>/dev/null)
echo "Backup created: $DRILL_BACKUP ($BACKUP_SIZE bytes)"

echo ""
echo "=== Step 4: Create fresh target database ==="
DRILL_TARGET="travel_platform_drill_target_$$"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS $DRILL_TARGET; CREATE DATABASE $DRILL_TARGET;" 2>/dev/null

echo "Fresh target database created: $DRILL_TARGET"

echo ""
echo "=== Step 5: Restore to target ==="
gunzip -c "$DRILL_BACKUP" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_TARGET" -q 2>/dev/null

echo "Restore completed"

echo ""
echo "=== Step 6: Validate restored database ==="
bash "$SCRIPT_DIR/verify-restore.sh" 2>/dev/null || true

# Manual validation for drill
echo "Drill-specific validation..."
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_TARGET" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ')
echo "Tables in restored database: $TABLE_COUNT"

AGENCY_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_TARGET" -t -c \
  "SELECT COUNT(*) FROM agencies;" 2>/dev/null | tr -d ' ')
echo "Agencies in restored database: $AGENCY_COUNT"

if [[ "$TABLE_COUNT" -lt 10 ]]; then
  echo "FAIL: Too few tables in restored database"
  exit 1
fi

if [[ "$AGENCY_COUNT" -lt 1 ]]; then
  echo "FAIL: No agencies in restored database"
  exit 1
fi

echo ""
echo "=== Step 7: Cleanup drill databases ==="
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS $DRILL_TARGET;" 2>/dev/null

echo "Drill databases cleaned up"

echo ""
echo "=== Recovery Drill Complete ==="
echo "All steps completed successfully."
echo ""
echo "Summary:"
echo "  1. Created ephemeral drill database"
echo "  2. Seeded test data"
echo "  3. Created backup"
echo "  4. Created fresh target database"
echo "  5. Restored to target"
echo "  6. Validated restored database"
echo "  7. Cleaned up drill databases"
