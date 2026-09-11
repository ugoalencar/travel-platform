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

> **⚠️ RECOMMENDATION, not a final decision (human/business sign-off required):**
> The ops/security hardening pack (`docs/travel_platform_ops_security_pack/backup/BACKUP_RESTORE_DR.md`)
> proposes an initial floor of **RPO ≤ 1h / RTO ≤ 4h** as a starting target for production, pending
> real infra (WAL archiving cadence, restore automation, on-call staffing) to validate it's achievable.
> This is looser on RTO than the "15 minutes" aspiration already in the table above — reconciling the
> two, and picking the actual production figures, retention/offsite provider, and KMS setup, is a
> decision for the business/DevOps/Security owners listed under **Incident Ownership**, not something
> this document or any automated agent may finalize. Nothing in this repository enforces either number
> today; both remain proposals until signed off.

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

## Incident / DR Response Flow

This is the general shape any data-loss or database-availability incident should follow (mirrors
`docs/travel_platform_ops_security_pack/runbooks/INCIDENT.md`). The backup/restore tooling in this
document is what makes the **Recuperar** and **Validar** steps executable rather than aspirational.

1. **Detectar** — Alerting/monitoring (or a report) surfaces the incident. Note the first-observed
   timestamp; it anchors the RPO calculation once resolved.
2. **Classificar severidade** — Scope: single tenant vs. platform-wide, data-loss vs. availability-only,
   reversible vs. destructive.
3. **Identificar tenants afetados** — Query affected `agency_id`s; this determines who needs
   notification and whether a partial vs. full restore is viable.
4. **Conter** — Stop further damage: pause writers, disable the offending feature flag, or take the
   affected service out of rotation. Do not restore yet — containment first.
5. **Feature flag OFF se aplicável** — If the incident traces to a specific feature, disable it before
   touching data.
6. **Rollback app se seguro** — If a bad deploy caused the incident and rollback is safe (no destructive
   migration in between), roll back the application first; this alone may resolve availability
   incidents without needing a restore.
7. **Preservar evidências** — Before restoring anything, snapshot/export the current (corrupted) state
   for postmortem and, if applicable, forensic/compliance review. A restore is destructive to the
   pre-restore state — see `restore-local-db.sh`'s swap-and-rename step, which already keeps a
   timestamped `${DB_NAME}_backup_*` copy of what was overwritten as a same-instance safety net; treat
   that as a convenience, not a substitute for a real evidence snapshot in a production incident.
8. **Comunicar** — Notify affected tenants and internal stakeholders per severity. What/when/who is a
   business decision outside this document's scope.
9. **Recuperar** — Execute the restore. Locally: `./scripts/restore-local-db.sh` (or the fully
   containerized, non-destructive `./scripts/recovery-drill.js`/`.sh` as a rehearsal). In production this
   is where WAL-based PITR (not yet implemented — see **Production Infrastructure (Future)**) would let
   you recover to a specific point in time rather than the last full backup.
10. **Validar** — Run `./scripts/verify-restore.sh` (schema, RLS, tenant isolation, representative row
    counts) or the full `./scripts/recovery-drill.js` cycle, which additionally re-runs the RLS runtime
    test suite (`tests/integration/database/003_rls_runtime_test.sql`) against the restored data to
    confirm tenant isolation survived the restore, not just that rows came back.
11. **Postmortem** — Document timeline, root cause, actual RPO/RTO achieved (compare against the
    recommendation above), and follow-up actions. Postmortems are how the RPO/RTO recommendation above
    eventually gets validated or revised — they are evidence for that future human sign-off, not a
    substitute for it.

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

### Local/Development — current, honest state
- Backup files (`backups/*.sql.gz`) are **NOT encrypted**. They are plain gzip, not AES or any
  cipher — gzip provides compression only, no confidentiality.
- What *is* enforced today: the dump never leaves the local machine, `backups/` is gitignored
  (`.gitignore:89`), and `backup-local-db.sh`/the directory itself are now restricted to the owning
  user (`chmod 600` on the dump, `chmod 700` on `backups/`, best-effort — some filesystems, e.g.
  exFAT/NTFS via WSL/Windows mounts, ignore POSIX bits, so this is defense-in-depth, not a guarantee).
  Scripts never print `PGPASSWORD`/`DB_PASSWORD` to stdout/logs (only the value substituted into the
  environment for the `pg_dump`/`psql` subprocess, which is not logged).
- This is acceptable for local/dev because the data is synthetic/ephemeral and the threat model is
  "don't leak dev secrets into git or leave world-readable dumps on a shared dev box" — not "protect
  real customer PII at rest."
- **Do not treat this as production-ready.** There is no local encryption-at-rest story that would
  meaningfully protect real tenant data, and building one for a throwaway dev dump would be
  security theater without a real key-management story behind it.

### Production — required, not yet built (human/infra decision)
- **At-rest:** Rely on the storage layer's encryption once backups target real infra — S3/Azure
  Blob/GCS server-side encryption (SSE-KMS or equivalent), or managed DB snapshot encryption
  (RDS/Cloud SQL encryption-at-rest). Do not hand-roll local encryption for cloud-bound backups;
  use the provider's native encryption plus KMS-managed keys.
- **In-transit:** Require SSL/TLS for all database connections (`sslmode=require` or stricter).
- **Access:** IAM roles scoped to backup read/write, not shared credentials; see also **Production
  Infrastructure (Future)** below.
- **Key management:** AWS KMS, Azure Key Vault, or similar — owned by the Security team per
  **Incident Ownership**.
- None of this is implemented in this repository. It requires provisioning real cloud infrastructure,
  which is explicitly out of scope for local/dev tooling and for this document to finalize.

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

Two drill scripts exist; prefer the containerized one — it is the one that is actually exercised
against a truly separate ephemeral target and validates RLS/tenant isolation post-restore, not just
schema/row counts:

**Containerized drill (recommended):**
```bash
node scripts/recovery-drill.js
```
Requires Docker only (no local `psql`/`pg_dump`, no shared state with your dev DB). Spins up two
throwaway `postgres:15` containers (source + target) on `127.0.0.1:55433`/`55434` — override with
`RECOVERY_DRILL_SOURCE_PORT`/`RECOVERY_DRILL_TARGET_PORT` env vars if those ports collide with another
local Postgres instance. Applies all migrations to the source, seeds two-tenant synthetic data,
`pg_dump`s it, restores into the target, then verifies:
1. All migrated tables present (reusing `expectedAllTables` from
   `tests/integration/database/database.integration.test.ts` — extracted at run time, not duplicated,
   so this drill cannot silently drift from the canonical schema list as migrations are added)
2. Representative row counts match source (agencies, users, customers, offers, wishes, proposals,
   sales, commissions, trips)
3. FORCE RLS enabled on every tenant-scoped table (`expectedTenantTables`, same source file)
4. The full RLS runtime test suite (`tests/integration/database/003_rls_runtime_test.sql`) passes
   against the restored database
5. Runtime role is non-superuser, no BYPASSRLS/CREATEROLE, owns no tables
6. Tenant isolation is fail-closed: querying without a tenant context set returns zero rows (smoke
   query proving RLS survives a restore, not just that RLS policies exist)

All containers and volumes are torn down on exit (success or failure). Verified passing locally
(19/19 checks) as part of this hardening pass — see commit history for the run output.

**Simpler, same-instance drill:**
```bash
./scripts/recovery-drill.sh
```
Uses the local `psql`/`pg_dump` and creates disposable databases (`travel_platform_drill_*`) on the
same Postgres instance as your dev DB, rather than separate containers. Useful when Docker isn't
available; the containerized drill above is preferred whenever it is.

**Drill steps (either script):**
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
