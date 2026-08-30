# Travel Platform — Production Backup & Disaster Recovery

## Backup Strategy

### PostgreSQL Backups

**Automated backup schedule:**
- **Full backups:** Daily at 02:00 UTC
- **WAL archiving:** Continuous (every ~16MB of changes)
- **Retention:** 30 days minimum
- **Encryption:** At rest (AES-256)
- **Offsite:** Cross-region replication

**Backup command (manual):**
```bash
PGPASSWORD=$DB_PASSWORD pg_dump \
  --host prod-db.internal \
  --port 5432 \
  --username travel_app_runtime \
  --dbname travel_platform_prod \
  --format custom \
  --verbose \
  --file backup-$(date +%Y%m%d_%H%M%S).dump
```

### Redis Snapshots

**Automated snapshots:**
- **Frequency:** Hourly
- **Retention:** 7 days
- **Storage:** Managed service snapshots

**Manual Redis dump:**
```bash
redis-cli --host prod-redis.internal --auth $REDIS_PASSWORD BGSAVE
```

### Application State

**Stateless design:**
- No persistent state in containers
- All session data in Redis
- All business data in PostgreSQL
- Safe to terminate any instance

**Artifacts to preserve:**
- Application logs (sent to centralized logging)
- Database backups (automated)
- Redis snapshots (automated)

## Restore Procedures

### PostgreSQL Full Restore

**Preconditions:**
- New PostgreSQL 15+ instance (same version as backup)
- Empty database
- Credentials configured

**Restore command:**
```bash
PGPASSWORD=$DB_PASSWORD pg_restore \
  --host prod-db.internal \
  --port 5432 \
  --username travel_migrations \
  --dbname travel_platform_prod \
  --verbose \
  --no-owner \
  backup-20260830_020000.dump
```

**Verification after restore:**
1. Connect and verify row counts:
   ```sql
   SELECT schemaname, tablename, rowcount FROM pg_stat_user_tables ORDER BY rowcount DESC;
   ```

2. Verify RLS policies exist:
   ```sql
   SELECT * FROM pg_policies WHERE schemaname = 'public' LIMIT 5;
   ```

3. Run migrations to bring schema to current:
   ```bash
   npm run migrations:validate  # First verify migration sequence
   npm run db:migrate          # Apply any pending migrations
   ```

### Point-in-Time Recovery (PITR)

**If needing data from specific point in time:**
1. Request database service restore to timestamp
2. Verify data appears at restore point
3. Run any pending migrations
4. Run application smoke tests
5. Promote restored instance to active

### Redis Cache Restore

**Redis is non-critical cache:**
- Can be cleared without data loss
- Sessions will be re-established
- Rate limits will reset (acceptable)
- Cache can rebuild on first access

**If restoring from snapshot:**
```bash
redis-cli --host prod-redis.internal --auth $REDIS_PASSWORD SHUTDOWN
# Restore snapshot via managed service
redis-cli --host prod-redis.internal --auth $REDIS_PASSWORD PING  # Verify
```

## Recovery Drill

**Monthly recovery drill (non-production environment):**

1. Create staging database clone
2. Restore latest production backup to staging
3. Run all migrations
4. Connect staging to staging application stack
5. Execute smoke test suite
6. Document time-to-recovery (TTR)
7. Document any issues found

**Automate via:**
```bash
npm run recovery:drill
```

**Expected results:**
- Full restore should complete in < 15 minutes
- No schema drift after restore + migrations
- Application boots successfully with restored DB
- Core workflows pass

## Rollback Impact on Backups

**If production requires rollback to prior release:**

1. Application container reverts to prior image
2. Database schema does NOT revert automatically
3. Backwards-compatible schema changes must be maintained
4. Non-reversible migrations require forward-only migration strategy

**Strategy:**
- Keep database schema on latest version
- Application version skew is safe if schema is backwards-compatible
- For true schema rollback, restore from backup (see PITR above)

## Backup Verification

**Automated weekly verification:**
- Restore latest backup to test database
- Verify integrity (row counts, constraints)
- Run smoke test against restored DB
- Log results and alert on failure

**Manual verification:**
```bash
# Check backup exists and is not corrupt
pg_restore --list backup.dump | wc -l  # Count objects

# Test restore to a temporary database
createdb temp_restore
pg_restore --dbname temp_restore backup.dump
psql temp_restore -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
```

## Contacts & Escalation

- **Database Admin:** oncall@travel-platform.com
- **SRE/Ops:** ops@travel-platform.com
- **Severity levels:** 
  - P1: Backup verification failed (needs attention within 24h)
  - P0: Unable to restore (immediate response)

## Monitoring

**Alerts configured for:**
- Backup process fails
- Backup size anomalies (too large/small)
- WAL archiving lag > 1 hour
- Redis snapshot missing
- Restore test fails
