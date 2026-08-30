# Travel Platform — Production Rollback Procedures

## Rollback Triggers

**Automatic rollback triggers (if configured):**
- P0 severity alert fires
- Health check failed (>50% endpoints down)
- Error rate >5% for >5 minutes
- Database connection pool exhausted

**Manual rollback triggers (SRE decision):**
- Critical data loss or corruption
- Authentication/authorization broken across tenant boundary
- Financial calculations producing wrong values
- RLS/RBAC bypass detected
- Unrecoverable dependency failure (Redis, DB unavailable)

## Application Rollback (No Schema Change)

**Prerequisites:**
- Previous release image exists in container registry
- Rollback is backwards-compatible (schema unchanged)
- Database remains on latest schema version

**Procedure:**

### Step 1: Verify Previous Release

```bash
# List available images in registry
docker images | grep travel-platform-api

# Identify previous stable release
# Example: travel-platform-api:v1.0.0-rc0 (previous)
#         travel-platform-api:v1.0.0-rc1 (current, broken)
```

### Step 2: Drain Current Deployment

```bash
# Update load balancer to remove current instance from rotation
# New requests go to previous instance if multi-instance
gke-set-replicas travel-platform-api 0

# Allow existing connections to drain (30-60 seconds)
sleep 45
```

### Step 3: Deploy Previous Image

```bash
# Deploy previous known-good image
kubectl set image deployment/travel-platform-api \
  travel-platform-api=travel-platform-api:v1.0.0-rc0 \
  --namespace production

# Monitor rollout
kubectl rollout status deployment/travel-platform-api \
  --namespace production \
  --timeout=5m
```

### Step 4: Verify Health

```bash
# Health checks
curl -s https://api.travel-platform.com/health | jq .

# Readiness checks
curl -s https://api.travel-platform.com/ready | jq .

# Database connection
# App logs should show "DB connection pool active"
kubectl logs -n production deployment/travel-platform-api | grep -i "database\|connection"
```

### Step 5: Smoke Tests

```bash
# Run smoke test suite against production
npm run smoke:tests -- --env production

# Manually test critical path:
# - Agency login
# - Customer login
# - Create offer
# - Create proposal
# - View financial dashboard
```

### Step 6: Monitor

```bash
# Watch error rate for 5 minutes
# Should return to < 0.1% errors
kubectl logs -n production deployment/travel-platform-api \
  --tail=1000 | grep -i error | wc -l

# Check business metrics
# - New offers created post-rollback
# - No duplicate reservations
# - Financial totals consistent
```

## Database Rollback (Schema Change Failed)

**This is ONLY when a migration destroyed data or is incompatible.**

### Step 1: Notify Stakeholders

```
🚨 IMMEDIATE NOTIFICATION:
- Engineering lead
- SRE/Ops team
- Database team
- Executive on-call
```

### Step 2: Stop Application

```bash
# Prevent new requests to avoid further writes during recovery
kubectl scale deployment/travel-platform-api --replicas 0 -n production

# Wait for existing connections to drain
sleep 60
```

### Step 3: Restore from Backup

```bash
# Identify latest good backup BEFORE the broken migration
# Example: 2026-08-30_020000.dump (before the migration that broke things)

# Create recovery database
createdb travel_platform_recovery

# Restore backup
PGPASSWORD=$BACKUP_PASSWORD pg_restore \
  --dbname travel_platform_recovery \
  --host prod-db.internal \
  backup-2026-08-30_020000.dump

# Verify integrity
psql travel_platform_recovery -c "SELECT count(*) FROM customers;"
```

### Step 4: Validate Restore Point

```sql
-- Connect to recovered database
\c travel_platform_recovery

-- Verify data looks correct
SELECT 
  (SELECT count(*) FROM agencies) as agencies,
  (SELECT count(*) FROM customers) as customers,
  (SELECT count(*) FROM sales) as sales,
  (SELECT sum(amount) FROM revenues) as total_revenue;

-- Spot-check recent transactions
SELECT * FROM sales ORDER BY created_at DESC LIMIT 5;
```

### Step 5: Point-to-Restore Decision

**Two options:**

**Option A: Restore to specific timestamp (PITR)**
- Request database service restore to last good state
- Acceptable data loss: last 5-60 minutes
- Faster than manual restore + replay
- Requires managed DB service support

**Option B: Manual restore + replay missing data**
- Restore backup from before bad migration
- Replay customer actions from backup timestamp to present
- Manual data reconciliation needed
- Complex, higher risk of new errors

**Recommendation:** Use Option A (PITR) if available, with < 1 hour acceptable data loss window.

### Step 6: Swap Active Database

```bash
# After verification, point application to recovered database
# Update secrets manager with recovered DB URL
export DATABASE_URL=postgresql://travel_app_runtime:pw@prod-db-recovered.internal:5432/travel_platform_prod

# Restart application with recovered database
kubectl scale deployment/travel-platform-api --replicas 3 -n production
```

### Step 7: Run Migrations Again

```bash
# If the problematic migration is still pending, fix it BEFORE applying
# Edit the migration file to make it idempotent and safe

# Apply migrations with careful monitoring
kubectl exec -it deployment/travel-platform-api -- \
  npm run db:migrate

# Check results
kubectl logs -n production deployment/travel-platform-api | grep -i migration
```

### Step 8: Full Smoke Tests

```bash
# Comprehensive testing before re-opening to users
npm run smoke:tests -- --env production --verbose

# Business logic verification:
# - All agencies present
# - All customers present
# - No corrupted reservations
# - Financial totals match backups
# - No auth/RBAC issues
```

### Step 9: Gradual Traffic Restoration

```bash
# Do NOT send 100% traffic immediately
# 1. Start with canary: 5% traffic
kubectl set canary deployment/travel-platform-api --percent 5

# Monitor for 10 minutes
sleep 600

# 2. Increase to 25%
kubectl set canary deployment/travel-platform-api --percent 25
sleep 600

# 3. Increase to 50%
kubectl set canary deployment/travel-platform-api --percent 50
sleep 600

# 4. Full traffic (100%)
kubectl set canary deployment/travel-platform-api --percent 100
```

## Failure to Rollback

**If rollback itself fails:**

1. **Do not retry** — investigate root cause first
2. **Escalate to VP Engineering** — requires executive decision on:
   - Acceptable downtime
   - Data loss tolerance
   - Customer communication strategy
3. **Notify customers** — transparency about incident and recovery timeline
4. **RCA + Fix** — identify root cause and deploy proper fix

## Post-Rollback

### Phase 1: Incident Report (30 min)

- What happened
- When it was detected
- Why it made it to production
- Rollback steps taken
- Customer impact

### Phase 2: Root Cause Analysis (24 hours)

- Why did this release pass CI?
- Why did this release pass staging smoke tests?
- Why did this not fail in manual QA?
- Prevention for next time

### Phase 3: Fix & Deploy (48-72 hours)

- Fix the original issue properly
- Add test coverage
- Re-test in staging
- Deploy as fresh release (v1.0.1-rc1)
- Monitor for 24 hours

## Rollback Decision Matrix

| Scenario | Action | Time |
|----------|--------|------|
| P1: Auth broken | Rollback immediately | < 2 min |
| P1: Financial wrong | Restore from backup | < 15 min |
| P1: RLS bypass | Rollback + audit | < 5 min |
| P0: 404 on API | Rollback | < 2 min |
| P2: UI broken | Rollback if widespread, else monitor | 5-30 min |
| P2: Performance slow | Monitor, don't rollback yet | N/A |

## Contacts & Authority

**Rollback authority (in order):**
1. SRE on-call (up to P0 without approval)
2. Engineering lead (P1 decision)
3. CTO (business impact decision)

**Notification contacts:**
- Slack: #incident
- PagerDuty: trigger incident
- Email: engineering@travel-platform.com
