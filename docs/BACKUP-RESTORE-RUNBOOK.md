# SEC-I: Backup / Restore Runbook

**Document Version:** 1.0  
**Date:** 2026-08-26  
**Status:** Local/Development Ready

---

## Overview

This runbook covers backup and restore procedures for the Travel Platform PostgreSQL database. It is scoped to local/development environments and provides a foundation for production backup strategy.

---

## Recovery Objectives

| Objective | Local/Dev Target | Production Recommendation |
|-----------|------------------|---------------------------|
| **RPO** (Recovery Point Objective) | 24 hours | 1 hour |
| **RTO** (Recovery Time Objective) | 1 hour | 15 minutes |
| **Backup Frequency** | On-demand | Daily full, hourly incremental |
| **Retention** | 7 days | 30 days |
| **Offsite** | Not required | Required (separate region/AZ) |
| **Encryption** | Not required | Required (at-rest + in-transit) |
| **Restore Test Frequency** | Weekly | Daily |

---

## Backup Procedures

### Local/Development Backup

**Prerequisites:**
- PostgreSQL client tools installed (`pg_dump`, `psql`)
- Local PostgreSQL running via Docker Compose
- Database credentials configured

**Steps:**

1. **Run backup script:**
   ```bash
   ./scripts/backup-local-db.sh
   ```

2. **Verify backup:**
   - Check backup directory for timestamped `.sql.gz` file
   - Verify file size is reasonable (>100 bytes)

3. **Backup location:**
   - Local: `./backups/travel_platform_backup_YYYYMMDD_HHMMSS.sql.gz`
   - Gitignored: Yes (backups/ in .gitignore)

**Environment Variables:**
- `DB_HOST` (default: 127.0.0.1)
- `DB_PORT` (default: 55432)
- `DB_NAME` (default: travel_platform_test)
- `DB_USER` (default: travel_test)
- `DB_PASSWORD` (default: travel_test_password)

---

## Restore Procedures

### Local/Development Restore

**⚠️ WARNING:** Restore is destructive. It will destroy all data in the target database.

**Prerequisites:**
- PostgreSQL client tools installed
- Backup file available
- Confirmation prompt (or --force flag)

**Steps:**

1. **List available backups:**
   ```bash
   ls -la ./backups/
   ```

2. **Dry run (optional):**
   ```bash
   ./scripts/restore-local-db.sh --dry-run backups/travel_platform_backup_YYYYMMDD_HHMMSS.sql.gz
   ```

3. **Restore with confirmation:**
   ```bash
   ./scripts/restore-local-db.sh backups/travel_platform_backup_YYYYMMDD_HHMMSS.sql.gz
   ```

4. **Restore without confirmation (CI/automation):**
   ```bash
   ./scripts/restore-local-db.sh --force backups/travel_platform_backup_YYYYMMDD_HHMMSS.sql.gz
   ```

5. **Verify restore:**
   ```bash
   ./scripts/verify-restore.sh
   ```

---

## Disaster Recovery Steps

### Scenario 1: Local Database Corruption

1. Stop application
2. Stop PostgreSQL container
3. Remove Docker volume:
   ```bash
   docker compose -f infrastructure/docker-compose.local-postgres.yml -p travel-platform-local-postgres down -v
   ```
4. Start fresh PostgreSQL:
   ```bash
   docker compose -f infrastructure/docker-compose.local-postgres.yml -p travel-platform-local-postgres up -d
   ```
5. Run migrations:
   ```bash
   npm run migrations:validate
   ```
6. Restore from backup:
   ```bash
   ./scripts/restore-local-db.sh backups/<backup-file>.sql.gz
   ```

### Scenario 2: Schema Migration Failure

1. Identify failed migration
2. Restore to pre-migration backup
3. Fix migration script
4. Re-run migration

---

## Credentials Responsibilities

| Credential | Storage | Access |
|------------|---------|--------|
| Local DB Password | Environment variable | Developer workstation |
| Production DB Password | Secrets manager | DevOps team |
| Backup Encryption Key | Secrets manager | Security team |

**Never:**
- Commit credentials to git
- Share credentials via insecure channels
- Store credentials in plain text

---

## Encryption Requirements

### Local/Development
- Not required (ephemeral data)

### Production (Recommended)
- **At-rest:** Enable PostgreSQL encryption at rest (RDS encryption, disk encryption)
- **In-transit:** Require SSL/TLS for all database connections
- **Backups:** Encrypt backup files using AES-256
- **Key management:** Use AWS KMS, Azure Key Vault, or similar

---

## Retention Policies

### Local/Development
- Keep last 7 backups
- Manual cleanup of older backups

### Production (Recommended)
- **Daily backups:** Retain for 30 days
- **Weekly backups:** Retain for 90 days
- **Monthly backups:** Retain for 1 year
- **Yearly backups:** Retain for 7 years
- **Compliance:** Adjust based on regulatory requirements

---

## Verification Procedures

### Post-Restore Verification

Run the verification script:
```bash
./scripts/verify-restore.sh
```

**Checks performed:**
1. Database connectivity
2. Schema version (table count)
3. Expected tables present
4. RLS policies present
5. FORCE RLS configuration
6. Tenant isolation policies
7. Representative row counts
8. Backup file integrity

### Manual Verification

```sql
-- Check table count
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Check RLS policies
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';

-- Check tenant isolation
SELECT COUNT(*) FROM pg_policies 
WHERE qual LIKE '%agency_id%' OR with_check LIKE '%agency_id%';

-- Check sample data
SELECT COUNT(*) FROM agencies;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM customers;
```

---

## Automated Recovery Drill

Run the full recovery drill:
```bash
./scripts/recovery-drill.sh
```

**Drill steps:**
1. Create ephemeral drill database
2. Seed test data
3. Create backup
4. Create fresh target database
5. Restore to target
6. Validate restored database
7. Clean up drill databases

**Expected duration:** 2-5 minutes

---

## Multi-Tenant Recovery Considerations

### Current Scope: Whole-Database Recovery
- Backup/restore operates on entire database
- All tenants restored together
- Simplest and most reliable approach

### Future: Tenant-Level Recovery (Not Implemented)
- Would require logical backup per tenant
- Complex reconciliation needed
- Risk of data inconsistency
- **Recommendation:** Avoid unless business-critical

---

## Audit Log Interaction

- Backup includes all tables (including future audit_logs)
- Restore preserves audit trail
- No special exclusions required
- Audit logs are part of recoverable data

---

## CI Integration

### Backup Validation (Future)
- Run backup/restore drill in CI
- Use synthetic data only
- Verify schema consistency
- Time-box to reasonable duration (5-10 min)

### Artifact Handling
- Never upload database dumps as public artifacts
- Store in secure, access-controlled storage
- Encrypt at rest

---

## Incident Ownership

| Role | Responsibility |
|------|----------------|
| Developer | Local backup/restore, verification |
| DevOps | Production backup management |
| Security | Encryption, access control |
| On-call | Disaster recovery execution |

---

## Production Infrastructure (Future)

### Cloud Provider Requirements
- **Backup storage:** S3, Azure Blob, or GCS with versioning
- **Encryption:** KMS-managed keys
- **Access:** IAM roles, not shared credentials
- **Monitoring:** Backup success/failure alerts
- **Compliance:** Audit logs of all backup/restore operations

### PostgreSQL PITR/WAL Archiving (Production)
- Enable WAL archiving for point-in-time recovery
- Store WAL segments in durable storage
- Configure archive timeout (e.g., 5 minutes)
- Test restore to specific point in time

---

## Troubleshooting

### Backup Fails
- Check PostgreSQL connection
- Verify credentials
- Check disk space
- Verify pg_dump is installed

### Restore Fails
- Check backup file integrity
- Verify target database exists
- Check PostgreSQL permissions
- Review error messages

### Verification Fails
- Compare schema with expected migrations
- Check RLS policies
- Verify data consistency
- Review migration history

---

## Appendix A: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | 127.0.0.1 | Database host |
| `DB_PORT` | 55432 | Database port |
| `DB_NAME` | travel_platform_test | Database name |
| `DB_USER` | travel_test | Database user |
| `DB_PASSWORD` | travel_test_password | Database password |

---

## Appendix B: Script Dependencies

- `pg_dump` - PostgreSQL backup tool
- `psql` - PostgreSQL client
- `gzip` - Compression tool
- `bash` - Shell interpreter

Install on Ubuntu/Debian:
```bash
sudo apt-get install postgresql-client gzip
```

Install on macOS:
```bash
brew install postgresql gzip
```
