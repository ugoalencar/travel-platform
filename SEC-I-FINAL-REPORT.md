# SEC-I — BACKUP / RESTORE READINESS

**BASE SHA:** fd59a3758b9995e612dc481aebd0e5b5c528a185  
**HEAD SHA:** (current branch HEAD)  
**DATE:** 2026-08-26

---

## FILES CHANGED

| File | Action | Description |
|------|--------|-------------|
| `scripts/backup-local-db.sh` | NEW | Local/test database backup script |
| `scripts/restore-local-db.sh` | NEW | Local/test database restore script with safety guards |
| `scripts/verify-restore.sh` | NEW | Restore verification script |
| `scripts/recovery-drill.sh` | NEW | Automated recovery drill script |
| `docs/BACKUP-RESTORE-RUNBOOK.md` | NEW | Complete runbook documentation |
| `.gitignore` | MODIFIED | Added backups/ directory exclusion |

---

## CURRENT BACKUP STATE

**Phase 0 Finding:** MISSING — No backup/restore strategy existed.

**Current State:** Local backup/restore tooling now implemented with:
- Timestamped pg_dump backups
- Safety guards against production/staging hosts
- Restoration verification
- Automated recovery drill

---

## BACKUP STRATEGY

### Local/Development
- **Method:** `pg_dump` with gzip compression
- **Frequency:** On-demand (manual trigger)
- **Storage:** Local `./backups/` directory (gitignored)
- **Retention:** Manual cleanup (recommended: 7 days)

### Production (Recommended)
- **Method:** 
  - Full backup: Daily pg_dump
  - Incremental: WAL archiving for PITR
- **Storage:** Cloud storage (S3/Azure Blob/GCS) with versioning
- **Encryption:** AES-256 at rest, SSL in transit
- **Offsite:** Separate region/AZ replication

---

## RESTORE STRATEGY

### Local/Development
- **Method:** Drop and recreate database from backup
- **Safety:** Host validation, confirmation prompt, dry-run option
- **Verification:** Automated schema/data/RLS checks

### Production (Recommended)
- **Method:** 
  - Point-in-time recovery using WAL archives
  - Cross-region restore from offsite backups
- **Validation:** Schema comparison, data integrity checks
- **Rollback:** Maintain previous backup until new one validated

---

## SAFETY GUARDS

1. **Host Validation:** Refuses to operate on production/staging hostnames
2. **Localhost Requirement:** Only allows 127.0.0.1, localhost, or docker containers
3. **Confirmation Prompt:** Requires explicit confirmation for destructive operations
4. **Dry-Run Mode:** Preview changes without executing
5. **Backup Validation:** Checks file size and integrity before restore
6. **Temporary Database:** Restores to temp DB first, then swaps

---

## RESTORE DRILL

**Command:** `./scripts/recovery-drill.sh`

**Drill Steps:**
1. Create ephemeral drill database
2. Seed synthetic test data
3. Create backup of drill database
4. Create fresh target database
5. Restore backup to target
6. Validate schema, tables, RLS, data
7. Clean up all drill resources

**Expected Duration:** 2-5 minutes  
**Frequency:** Weekly (recommended)

---

## RLS/FORCE RLS AFTER RESTORE

**Verification:**
- RLS policies present on all tenant tables
- FORCE RLS enabled on sensitive tables
- Tenant isolation policies verified

**Checks:**
```sql
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agencies';
```

---

## RPO PROPOSAL

| Environment | RPO | Justification |
|-------------|-----|---------------|
| Local/Dev | 24 hours | On-demand backups acceptable |
| Production | 1 hour | WAL archiving + hourly backups |

---

## RTO PROPOSAL

| Environment | RTO | Justification |
|-------------|-----|---------------|
| Local/Dev | 1 hour | Manual restore acceptable |
| Production | 15 minutes | Automated restore + verification |

---

## RETENTION PROPOSAL

| Environment | Retention | Storage |
|-------------|-----------|---------|
| Local/Dev | 7 days | Local disk |
| Production | 30 days daily, 90 days weekly, 1 year monthly | Cloud storage |

---

## ENCRYPTION

| Environment | At-Rest | In-Transit |
|-------------|---------|------------|
| Local/Dev | Not required | Not required |
| Production | Required (AES-256) | Required (SSL/TLS) |

---

## OFFSITE

| Environment | Requirement |
|-------------|-------------|
| Local/Dev | Not required |
| Production | Required (separate region/AZ) |

---

## PITR/WAL

**Status:** Documented as production follow-up

**Recommendation:**
- Enable WAL archiving in production
- Store WAL segments in durable storage
- Configure archive timeout (5 minutes)
- Test point-in-time restore

**Note:** Local scripts do not implement full PITR; this requires infrastructure configuration.

---

## TENANT-LEVEL RESTORE

**Status:** Not implemented (whole-database recovery only)

**Rationale:**
- Complex reconciliation required
- Risk of data inconsistency
- Recommend whole-database restore for reliability

**Future:** If tenant-level restore needed, implement logical backup per tenant with reconciliation tools.

---

## RUNBOOK

**Document:** `docs/BACKUP-RESTORE-RUNBOOK.md`

**Contents:**
- Recovery objectives (RPO/RTO)
- Backup procedures
- Restore procedures
- Disaster recovery steps
- Credentials responsibilities
- Encryption requirements
- Retention policies
- Verification procedures
- Incident ownership
- Troubleshooting guide

---

## FINDINGS

| Priority | Finding | Status |
|----------|---------|--------|
| **P1** | No backup/restore strategy existed | **FIXED** — Local tooling implemented |
| **P2** | No automated recovery drill | **FIXED** — Drill script created |
| **P2** | No restore verification | **FIXED** — Verification script created |
| **P3** | Backup files not gitignored | **FIXED** — Added to .gitignore |

---

## TESTS

**Automated Tests:** N/A (operational scripts, not application code)

**Manual Verification:**
- Backup script execution
- Restore script execution
- Verification script execution
- Recovery drill execution

---

## DATABASE

**No migrations added** — Backup logic uses existing PostgreSQL tooling.

---

## LINT

**Shell Scripts:** Created with `set -euo pipefail` for safety

**Result:** ✅ PASS (warnings only, no errors)

---

## TYPECHECK

**Result:** ✅ PASS (0 errors)

---

## MIGRATIONS

**NONE** — Backup logic does not require schema changes.

---

## HUMAN DECISIONS REQUIRED

1. **Production backup frequency:** Daily full + hourly incremental recommended
2. **Backup storage location:** Cloud provider selection pending infrastructure decision
3. **Encryption requirements:** Confirm AES-256 at rest, SSL in transit
4. **Offsite replication:** Confirm separate region/AZ requirement
5. **PITR implementation:** Infrastructure configuration needed
6. **Tenant-level restore:** Business decision on complexity vs. need

---

## FINAL VERDICT

**COMPLETE** — Local/development backup/restore readiness achieved.

**Scope:**
- ✅ Backup script with safety guards
- ✅ Restore script with confirmation
- ✅ Verification script
- ✅ Automated recovery drill
- ✅ Complete runbook documentation
- ✅ Gitignore configuration

**Production Follow-up Needed:**
- Cloud backup storage configuration
- PITR/WAL archiving setup
- Encryption key management
- Offsite replication
- Monitoring and alerting

---

**DO NOT PUSH.**  
**DO NOT OPEN PR.**  
**DO NOT MERGE.**  
**AWAIT HUMAN REVIEW.**
