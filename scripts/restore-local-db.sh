#!/usr/bin/env bash
# SEC-I: Local/Test Database Restore Script
# Restores pg_dump backup to local/test database
# WARNING: Destructive operation - requires explicit confirmation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Target database configuration (local/test only)
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-55432}"
DB_NAME="${DB_NAME:-travel_platform_test}"
DB_USER="${DB_USER:-travel_test}"
DB_PASSWORD="${DB_PASSWORD:-travel_test_password}"

# Parse arguments
BACKUP_FILE=""
FORCE_RESTORE=false
DRY_RUN=false

usage() {
  echo "Usage: $0 [OPTIONS] <backup-file>"
  echo ""
  echo "Options:"
  echo "  --force       Skip confirmation prompt (for CI/automation)"
  echo "  --dry-run     Show what would be restored without executing"
  echo "  --help        Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 backups/travel_platform_backup_20260826_123456.sql.gz"
  echo "  $0 --force backups/travel_platform_backup_20260826_123456.sql.gz"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      FORCE_RESTORE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      usage
      ;;
    -*)
      echo "Unknown option: $1"
      usage
      ;;
    *)
      BACKUP_FILE="$1"
      shift
      ;;
  esac
done

if [[ -z "$BACKUP_FILE" ]]; then
  echo "ERROR: No backup file specified"
  usage
fi

echo "=== SEC-I: Local Database Restore ==="
echo "Backup file: $BACKUP_FILE"
echo "Target: $DB_HOST:$DB_PORT/$DB_NAME"

# Safety guards - validate target host
PRODUCTION_HOSTS=("prod" "production" "staging" "live" "rds" "amazonaws" "azure" "gcp")
for host_pattern in "${PRODUCTION_HOSTS[@]}"; do
  if [[ "$DB_HOST" == *"$host_pattern"* ]]; then
    echo "ERROR: Refusing to restore to production/staging host: $DB_HOST"
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

# Verify backup file exists
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Verify backup file is not empty
BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
if [[ "$BACKUP_SIZE" -lt 100 ]]; then
  echo "ERROR: Backup file is suspiciously small ($BACKUP_SIZE bytes)"
  echo "This may indicate a corrupted or empty backup"
  exit 1
fi

# Verify PostgreSQL client tools are available
if ! command -v psql &> /dev/null; then
  echo "ERROR: psql not found. Install PostgreSQL client tools."
  exit 1
fi

# Dry run - just show what would happen
if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "DRY RUN - Would execute:"
  echo "  Drop and recreate database $DB_NAME"
  echo "  Restore from: $BACKUP_FILE"
  echo ""
  echo "No changes were made."
  exit 0
fi

# Confirmation prompt (unless --force)
if [[ "$FORCE_RESTORE" == false ]]; then
  echo ""
  echo "WARNING: This will DESTROY all data in $DB_NAME and restore from backup."
  echo "Backup size: $BACKUP_SIZE bytes"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Restore cancelled."
    exit 0
  fi
fi

echo ""
echo "Starting restore..."

# Create temporary database for restore verification
TEMP_DB="${DB_NAME}_restore_$$"

echo "Creating temporary database: $TEMP_DB"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS $TEMP_DB; CREATE DATABASE $TEMP_DB;" 2>/dev/null

# Restore to temporary database first
echo "Restoring to temporary database..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEMP_DB" -q 2>/dev/null
else
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEMP_DB" -f "$BACKUP_FILE" -q 2>/dev/null
fi

if [[ $? -ne 0 ]]; then
  echo "ERROR: Restore to temporary database failed"
  echo "Cleaning up temporary database..."
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "DROP DATABASE IF EXISTS $TEMP_DB;" 2>/dev/null
  exit 1
fi

echo "Restore to temporary database completed"

# Swap databases
echo "Swapping databases..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS ${DB_NAME}_old; ALTER DATABASE $TEMP_DB RENAME TO ${DB_NAME}_old; ALTER DATABASE $DB_NAME RENAME TO ${DB_NAME}_backup_$(date +%Y%m%d_%H%M%S); ALTER DATABASE ${DB_NAME}_old RENAME TO $DB_NAME;" 2>/dev/null

# Drop old backup database
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS ${DB_NAME}_backup_$(date +%Y%m%d_%H%M%S);" 2>/dev/null

echo "Database swap completed"

echo ""
echo "Restore completed successfully"
echo "Database: $DB_NAME"
echo "Source: $BACKUP_FILE"
