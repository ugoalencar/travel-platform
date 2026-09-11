#!/usr/bin/env bash
# SEC-I: Local/Test Database Backup Script
# Creates timestamped pg_dump of local/test database
# WARNING: Only for local/ephemeral environments

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/travel_platform_backup_$TIMESTAMP.sql.gz"

# Source database configuration (local/test only)
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-55432}"
DB_NAME="${DB_NAME:-travel_platform_test}"
DB_USER="${DB_USER:-travel_test}"

# Safety guards
PRODUCTION_HOSTS=("prod" "production" "staging" "live" "rds" "amazonaws" "azure" "gcp")
STAGING_HOSTS=("staging" "stage" "pre-prod" "preprod")

echo "=== SEC-I: Local Database Backup ==="
echo "Timestamp: $TIMESTAMP"
echo "Source: $DB_HOST:$DB_PORT/$DB_NAME"

# Validate host is not production/staging
for host_pattern in "${PRODUCTION_HOSTS[@]}" "${STAGING_HOSTS[@]}"; do
  if [[ "$DB_HOST" == *"$host_pattern"* ]]; then
    echo "ERROR: Refusing to backup from production/staging host: $DB_HOST"
    echo "This script is for local/ephemeral environments only."
    exit 1
  fi
done

# Require localhost or docker container
if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" && "$DB_HOST" != "postgres-local" ]]; then
  echo "ERROR: DB_HOST must be localhost or local docker container"
  echo "Got: $DB_HOST"
  exit 1
fi

# Create backup directory if it doesn't exist, restricted to the owning user.
# Best-effort: some filesystems (e.g. exFAT/NTFS via WSL/Windows mounts) ignore POSIX bits.
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

# Verify PostgreSQL client tools are available
if ! command -v pg_dump &> /dev/null; then
  echo "ERROR: pg_dump not found. Install PostgreSQL client tools."
  echo "On Ubuntu/Debian: sudo apt-get install postgresql-client"
  echo "On macOS: brew install postgresql"
  exit 1
fi

# Perform backup
echo "Creating backup..."
PGPASSWORD="${DB_PASSWORD:-travel_test_password}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  2>/dev/null | gzip > "$BACKUP_FILE"

# Verify backup was created
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file was not created"
  exit 1
fi

# Restrict access to the dump (contains raw tenant data) to the owning user only.
# Best-effort: some filesystems (e.g. exFAT/NTFS via WSL/Windows mounts) ignore POSIX bits.
chmod 600 "$BACKUP_FILE" 2>/dev/null || true

# Check backup size
BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
if [[ "$BACKUP_SIZE" -lt 100 ]]; then
  echo "ERROR: Backup file is suspiciously small ($BACKUP_SIZE bytes)"
  echo "This may indicate an empty database or connection issue"
  exit 1
fi

echo "Backup completed successfully"
echo "File: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE bytes"
echo ""
echo "To restore this backup, use:"
echo "  ./scripts/restore-local-db.sh $BACKUP_FILE"
