# Travel Platform v1.0.0-rc3 - Production Deployment & Operations Guide

**Release Date**: 2026-08-29  
**Version**: v1.0.0-rc3  
**Status**: PRODUCTION READY  
**Last Updated**: 2026-08-29

---

## 1. EXECUTIVE SUMMARY

Travel Platform v1.0.0-rc3 is a production-ready, multi-tenant SaaS application for travel agencies and customers. The release includes critical P0 security fixes, comprehensive authentication (MFA), distributed rate limiting, and audit logging.

**Key Highlights**:
- Multi-tenant isolation via PostgreSQL Row-Level Security (RLS)
- TOTP-based MFA + Recovery Codes
- Redis-backed distributed rate limiting
- Append-only audit logging with transaction isolation
- Role-based access control (RBAC) with 5 roles
- Decimal-safe financial tracking
- Responsive UI (mobile to desktop)
- Full test coverage on critical paths

**Critical P0 Fixes in RC03**:
1. MFA RLS policies enabled on 3 sensitive tables (017_mfa_rls_p0_fix.sql)
2. Security vulnerability patched (deepmerge-ts GHSA-ggr8-5vv4-36mx)
3. All TypeScript errors resolved (48 total)
4. Rate limiting store production-ready
5. Test suite passing

---

## 2. ARCHITECTURE OVERVIEW

### 2.1 Stack

| Component | Technology | Version | Notes |
|-----------|-----------|---------|-------|
| **Runtime** | Node.js | 24.x | LTS, strictly enforced |
| **Package Manager** | npm | 11.x | Workspace support |
| **API Server** | Fastify | 5.5+ | TypeScript, HTTP2 support |
| **Frontend (Apps)** | React | 19+ | SPA with Vite build |
| **Database** | PostgreSQL | 15+ | RLS, SAVEPOINT support required |
| **Cache/Rate-Limit** | Redis | 4.7+ | Distributed store |
| **ORM** | Prisma | 6.14+ | Type-safe queries |
| **Testing** | Vitest | 3.2+ | Fast unit/integration tests |

### 2.2 Services & Apps

```
travel-platform/
├── services/
│   └── api/              # Fastify HTTP API (port 4000)
│       ├── auth          # Production auth (OIDC/OAuth2)
│       ├── mfa           # TOTP + recovery codes
│       ├── captcha       # CAPTCHA verification
│       ├── rate-limit    # Redis-backed rate limiting
│       ├── audit-log     # Append-only audit trail
│       └── commercial    # Agency management routes
├── apps/
│   ├── agency/           # Agency SPA (port 3000)
│   │   ├── dashboard     # Commercial cockpit
│   │   ├── customers     # Customer management
│   │   ├── trips         # Trip management
│   │   ├── wishes        # Customer wishes
│   │   ├── offers        # Proposal engine
│   │   ├── bookings      # Booking management
│   │   └── reports       # Revenue & analytics
│   └── customer/         # Customer Portal SPA (port 3001)
│       ├── home          # Dashboard
│       ├── trips         # View trips
│       ├── proposals     # View proposals
│       ├── bookings      # View bookings
│       └── profile       # User settings
└── packages/
    ├── database/         # Prisma schema & migrations
    └── domain/           # Shared TypeScript types
```

### 2.3 Database Schema

**17 Migrations Applied**:
1. Initial schema (users, agencies, roles)
2. RLS policies (multi-tenant isolation)
3. Transportation & routes
4. Bookings & reservations
5. Financial tracking (decimal-safe)
6. Operations & assignments
7. Commission tracking
8. Commercial cockpit
9. Configurable pipelines
10. Financial foundation
11. Booking cancellation
12. Staff assignments
13. Pescador foundation
14. Offer growth
15. Audit logging (append-only)
16. **Production auth + CAPTCHA + MFA** (P0)
17. **MFA RLS P0 fix** (CRITICAL)

**Key Tables** (RLS Enabled):
- `users` - User accounts (tenant-scoped)
- `auth_sessions` - Session management
- `mfa_totp_secrets` - TOTP secret storage
- `mfa_recovery_codes` - Recovery codes
- `mfa_requirements` - MFA policies per agency
- `captcha_verifications` - CAPTCHA challenge log
- `audit_logs` - Append-only event log

### 2.4 Security Model

**Authentication Flow**:
```
1. User submits credentials → CAPTCHA verification
2. Credentials validated → If MFA required: send challenge
3. User submits TOTP/recovery code
4. JWT issued → Stored in secure HTTP-only cookie
5. Session expires: 15 minutes (configurable)
```

**Multi-Tenant Isolation**:
- PostgreSQL RLS policies on all sensitive tables
- `agency_id` in context → automatic row filtering
- Cross-tenant access: impossible via SQL (RLS enforces)
- User role checked: VIEWER/AGENT/MANAGER/ADMIN/OWNER

**Rate Limiting**:
- Redis backing store (distributed)
- Per-IP + per-user rates
- Default: 300 requests / 60 seconds
- Graceful degradation (if Redis down: memory store fallback)
- Returns 429 with X-RateLimit-* headers

**Audit Logging**:
- Append-only: INSERTs only, no UPDATEs
- SAVEPOINT isolation: transaction abort won't lose logs
- Events: auth, MFA, API calls, financial transactions
- No sensitive data logged (passwords, secrets redacted)

---

## 3. PRODUCTION DEPLOYMENT

### 3.1 Prerequisites Checklist

Before deploying to production, verify:

- [ ] **Database Ready**
  - PostgreSQL 15+ running
  - Database created: `travel_platform_prod` (or name of choice)
  - Backup configured (daily recommended)
  - Replication set up (if high availability required)

- [ ] **Redis Ready**
  - Redis 4.7+ running
  - Network accessible from API servers
  - Persistence enabled (RDB/AOF)
  - Memory limit set appropriately

- [ ] **Secrets & Certificates**
  - SSL/TLS certificates installed
  - Environment variables prepared (.env or secrets manager)
  - Signing keys generated (JWT_SECRET: 256+ bit random)
  - Session secret generated (COOKIE_SECURE_SECRET: random)

- [ ] **DNS & Networking**
  - DNS records pointing to load balancer
  - API endpoint: `api.travel-platform.com` (or internal)
  - App endpoints: `travel-platform.com` (agency + customer)
  - CORS policies configured
  - Firewall rules for DB/Redis ports

- [ ] **Monitoring & Logging**
  - Logging infrastructure ready (Datadog, CloudWatch, etc.)
  - Error tracking configured (Sentry, Rollbar)
  - Metrics collection active (Prometheus, StatsD)
  - Alerting channels configured

- [ ] **Backup & Disaster Recovery**
  - Database backup automation tested
  - Restore procedure documented & tested
  - Point-in-time recovery capability verified
  - Backup storage location verified

### 3.2 Release Tag

The release is tagged as `v1.0.0-rc3`:

```bash
git tag -l v1.0.0-rc3
git show v1.0.0-rc3
```

**Tag Contents**:
- Commit SHA: `7b89388` (fix(ci): also suppress false positives in MFA provider source file)
- Date: 2026-08-29
- All P0 fixes included
- All tests passing
- TypeScript strict mode passing

### 3.3 Deployment Steps

#### Option A: Docker Container Deployment

```bash
# 1. Build Docker image from tag
git clone https://github.com/ugoalencar/travel-platform.git
cd travel-platform
git checkout v1.0.0-rc3

# 2. Build image
docker build -t travel-platform:v1.0.0-rc3 \
  --build-arg NODE_ENV=production \
  .

# 3. Tag for registry
docker tag travel-platform:v1.0.0-rc3 \
  your-registry.azurecr.io/travel-platform:v1.0.0-rc3
docker tag travel-platform:v1.0.0-rc3 \
  your-registry.azurecr.io/travel-platform:latest

# 4. Push to registry
docker push your-registry.azurecr.io/travel-platform:v1.0.0-rc3

# 5. Deploy to Kubernetes / ECS / App Service
kubectl apply -f k8s/production.yaml  # or your deployment config
# or
aws ecs update-service --cluster prod --service travel-platform \
  --force-new-deployment

# 6. Verify deployment
kubectl get pods -l app=travel-platform
kubectl logs deployment/travel-platform --tail=50
```

#### Option B: Node.js Direct Deploy (VPS/EC2)

```bash
# 1. On production server, clone and checkout tag
ssh deploy@api.travel-platform.com
cd /opt/apps/travel-platform

git clone https://github.com/ugoalencar/travel-platform.git .
git checkout v1.0.0-rc3

# 2. Install dependencies (production only)
npm ci --omit=dev

# 3. Build applications
npm run build

# 4. Run database migrations
npm run migrate:prod

# 5. Start services with process manager
pm2 start ecosystem.config.js --env production
# or
systemctl restart travel-platform-api
systemctl restart travel-platform-agency
systemctl restart travel-platform-customer

# 6. Verify running
pm2 status
ps aux | grep node
```

#### Option C: CI/CD Pipeline

```bash
# 1. Push tag to repository
git push origin v1.0.0-rc3

# 2. CI/CD pipeline triggers automatically:
#    - GitHub Actions / GitLab CI / Jenkins
#    - Builds Docker image
#    - Runs security scan
#    - Pushes to registry
#    - Deploys to staging
#    - Runs smoke tests
#    - Promotes to production

# 3. Monitor pipeline
# - Check GitHub Actions / CI dashboard
# - Verify all stages pass
# - Confirm deployment complete
```

### 3.4 Database Migrations

Run migrations **before** starting the application:

```bash
# Connect to production database
export DATABASE_URL="postgresql://user:password@prod-db.example.com:5432/travel_platform_prod"

# Run migrations (Prisma)
npx prisma migrate deploy --skip-generate

# Verify all 17 migrations applied
psql $DATABASE_URL -c "SELECT version FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"

# Expected output:
# version
# -------
# 17 (mfa_rls_p0_fix)
# 16 (production_auth_captcha_mfa)
# ...
# 1 (initial_schema)
```

### 3.5 Environment Configuration

Create `.env.production` (never commit this!):

```bash
# Application
NODE_ENV=production
APP_ENV=production
APP_URL=https://travel-platform.com
API_URL=https://api.travel-platform.com

# Database (CRITICAL: use strong password)
DATABASE_URL=postgresql://prod_user:STRONG_PASSWORD_HERE@prod-db.example.com:5432/travel_platform_prod

# Authentication
JWT_SECRET=<256+ bit random string>  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_EXPIRES_IN=15m
COOKIE_NAME=travel_platform_session
COOKIE_SECURE=true  # Production: MUST be true
COOKIE_SAME_SITE=strict

# Tenant context (KEEP THESE)
TENANT_CONTEXT_SETTING=app.current_agency_id
USER_CONTEXT_SETTING=app.current_user_id

# Observability
LOG_LEVEL=info  # or 'warn' in production
LOG_FORMAT=json  # For structured logging

# Rate Limiting (CRITICAL: use Redis for production)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORE=external  # NOT 'memory' in production!
RATE_LIMIT_STORE_URL=redis://prod-redis.example.com:6379  # Redis URL
RATE_LIMIT_MAX=300  # requests
RATE_LIMIT_WINDOW_MS=60000  # milliseconds (1 minute)
RATE_LIMIT_REDIS_PREFIX=ratelimit:

# CAPTCHA (if using external service)
CAPTCHA_PROVIDER=google  # or internal
CAPTCHA_SECRET_KEY=<your-captcha-secret>  # Never commit

# MFA (enabled by default)
MFA_ISSUER=Travel Platform  # Shown in authenticator apps
MFA_ENABLED=true

# Session
SESSION_SECRET=<random-string>  # For session encryption
SESSION_TTL_SECONDS=900  # 15 minutes

# Monitoring & Observability
SENTRY_DSN=<optional>  # Error tracking
DD_API_KEY=<optional>  # Datadog monitoring
PAGERDUTY_INTEGRATION_KEY=<optional>  # PagerDuty alerts
```

**Security Notes**:
- Store `.env.production` in a secrets manager (Vault, AWS Secrets Manager, etc.)
- Never commit secrets to git
- Rotate secrets quarterly
- Use strong passwords (minimum 32 characters, mixed case + numbers + symbols)
- Use environment-specific databases (no production data on staging)

### 3.6 Health Checks

After deployment, verify services are running:

```bash
# API Health
curl -s https://api.travel-platform.com/health | jq .
# Expected: {"status":"ok","service":"api","version":"1.0.0-rc3","uptime":...}

# Database Check
curl -s https://api.travel-platform.com/api/health/db | jq .
# Expected: {"database":"connected","migrations":17}

# Redis Check
curl -s https://api.travel-platform.com/api/health/redis | jq .
# Expected: {"redis":"connected","ping":"PONG"}

# Agency App
curl -s -L https://travel-platform.com/ | grep -i "<title>"
# Expected: <title>Travel Platform - Agency</title>

# Customer Portal
curl -s -L https://travel-platform.com/customer/ | grep -i "<title>"
# Expected: <title>Travel Platform - Customer Portal</title>
```

---

## 4. SMOKE TEST SUITE

### 4.1 API Endpoints (Core)

#### 4.1.1 Health Checks (Public)
```bash
# API health
curl -X GET https://api.travel-platform.com/health
# Expected: 200 OK
# Response: {"status":"ok","service":"api","version":"1.0.0-rc3"}

# Database connectivity
curl -X GET https://api.travel-platform.com/api/health/db
# Expected: 200 OK
# Response: {"database":"connected","migrations":17,"latest":"017_mfa_rls_p0_fix"}

# Redis connectivity
curl -X GET https://api.travel-platform.com/api/health/redis
# Expected: 200 OK
# Response: {"redis":"connected","ping":"PONG","latency_ms":5}
```

#### 4.1.2 Authentication Flow

```bash
# 1. Test CAPTCHA challenge (if enabled)
curl -X POST https://api.travel-platform.com/api/auth/captcha \
  -H "Content-Type: application/json" \
  -d '{"action":"login"}'
# Expected: 200 OK, captcha_token returned

# 2. Test login with credentials
curl -X POST https://api.travel-platform.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@agency1.com",
    "password":"TestPassword123!",
    "captcha_token":"token_from_step_1"
  }'
# Expected: 200 OK, JWT and session_id returned

# 3. Test MFA challenge (if enabled on test account)
curl -X POST https://api.travel-platform.com/api/auth/mfa/challenge \
  -H "Content-Type: application/json" \
  -d '{"session_id":"session_from_step_2"}'
# Expected: 200 OK, MFA required, awaiting code

# 4. Submit TOTP code
curl -X POST https://api.travel-platform.com/api/auth/mfa/verify \
  -H "Content-Type: application/json" \
  -d '{
    "session_id":"session_from_step_2",
    "code":"123456"
  }'
# Expected: 200 OK, JWT issued, session fully authenticated

# 5. Verify JWT
curl -X GET https://api.travel-platform.com/api/auth/me \
  -H "Authorization: Bearer <jwt_from_step_4>"
# Expected: 200 OK, user details returned
```

#### 4.1.3 Rate Limiting

```bash
# Test rate limit enforcement
for i in {1..310}; do
  curl -s -X GET https://api.travel-platform.com/api/customers \
    -H "Authorization: Bearer $JWT" \
    -w "%{http_code}\n" -o /dev/null
done

# Expected behavior:
# - First 300 requests: 200 OK
# - Request 301-310: 429 Too Many Requests
# - Response headers include:
#   X-RateLimit-Limit: 300
#   X-RateLimit-Remaining: 0
#   X-RateLimit-Reset: 1693485660
```

### 4.2 Agency App Routes

```bash
# Get JWT first (login flow from 4.1.2)
export JWT="<your_jwt_token>"

# 1. Dashboard
curl -X GET https://api.travel-platform.com/api/commercial/dashboard \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK, aggregated metrics for agency

# 2. Customers list
curl -X GET "https://api.travel-platform.com/api/customers?limit=10&offset=0" \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK, customer records with pagination

# 3. Create wish
curl -X POST https://api.travel-platform.com/api/wishes \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id":"cust_123",
    "description":"Beach vacation in Maldives",
    "destination":"Maldives",
    "start_date":"2026-12-01",
    "end_date":"2026-12-15",
    "preferences":{"budget":"$5000-10000","activities":"diving"}
  }'
# Expected: 201 Created, wish_id returned

# 4. Create trip
curl -X POST https://api.travel-platform.com/api/trips \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id":"cust_123",
    "wish_id":"wish_456",
    "destination":"Maldives",
    "start_date":"2026-12-01",
    "end_date":"2026-12-15",
    "status":"proposed"
  }'
# Expected: 201 Created, trip_id returned

# 5. Create proposal
curl -X POST https://api.travel-platform.com/api/proposals \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "trip_id":"trip_789",
    "amount":"7500.00",
    "currency":"USD",
    "includes":["flights","accommodation","activities"],
    "valid_until":"2026-09-15"
  }'
# Expected: 201 Created, proposal_id returned
# Important: amount is decimal string, not float

# 6. Create booking
curl -X POST https://api.travel-platform.com/api/bookings \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "proposal_id":"proposal_101",
    "status":"pending_payment"
  }'
# Expected: 201 Created, booking_id returned

# 7. Revenue report
curl -X GET "https://api.travel-platform.com/api/reports/revenue?start_date=2026-08-01&end_date=2026-08-31" \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK, revenue data with decimal precision
```

### 4.3 Customer Portal Routes

```bash
# Login as customer (different endpoint)
curl -X POST https://api.travel-platform.com/api/customer-auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"customer@example.com",
    "password":"CustomerPassword123!",
    "captcha_token":"token"
  }'
# Expected: 200 OK, customer JWT returned

export CUSTOMER_JWT="<customer_jwt>"

# 1. View trips
curl -X GET https://api.travel-platform.com/api/customer/trips \
  -H "Authorization: Bearer $CUSTOMER_JWT"
# Expected: 200 OK, only customer's trips returned

# 2. View proposals
curl -X GET https://api.travel-platform.com/api/customer/proposals \
  -H "Authorization: Bearer $CUSTOMER_JWT"
# Expected: 200 OK, only customer's proposals returned

# 3. View bookings
curl -X GET https://api.travel-platform.com/api/customer/bookings \
  -H "Authorization: Bearer $CUSTOMER_JWT"
# Expected: 200 OK, only customer's bookings returned

# 4. Download proposal PDF
curl -X GET https://api.travel-platform.com/api/customer/proposals/proposal_101/pdf \
  -H "Authorization: Bearer $CUSTOMER_JWT" \
  -o proposal.pdf
# Expected: 200 OK, PDF file returned
```

### 4.4 Multi-Tenant Isolation Verification

```bash
# Login as Agency A user
curl -X POST https://api.travel-platform.com/api/auth/login \
  -d '{"email":"agent_a@agency1.com","password":"...","captcha_token":"..."}'
export AGENCY_A_JWT="<jwt_a>"

# Create a booking in Agency A
curl -X POST https://api.travel-platform.com/api/bookings \
  -H "Authorization: Bearer $AGENCY_A_JWT" \
  -d '{"proposal_id":"..."}' | jq '.id'
export BOOKING_A="booking_123"

# Logout and login as Agency B user
curl -X POST https://api.travel-platform.com/api/auth/login \
  -d '{"email":"agent_b@agency2.com","password":"...","captcha_token":"..."}'
export AGENCY_B_JWT="<jwt_b>"

# Try to access Agency A's booking
curl -X GET https://api.travel-platform.com/api/bookings/$BOOKING_A \
  -H "Authorization: Bearer $AGENCY_B_JWT"
# Expected: 403 Forbidden or 404 Not Found (RLS filtered)

# Verify Agency B can't see Agency A's data
curl -X GET https://api.travel-platform.com/api/bookings \
  -H "Authorization: Bearer $AGENCY_B_JWT" | jq '.total'
# Expected: 0 (Agency B has no bookings, only sees own data)
```

### 4.5 MFA Verification

```bash
# 1. Enable MFA on test account (or use pre-enrolled account)
# If user has MFA enabled, login will require MFA

# 2. Login with MFA-enabled account
curl -X POST https://api.travel-platform.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agency1.com","password":"...","captcha_token":"..."}'
# Expected: 200 OK, status: "mfa_required", session_id returned

# 3. Submit TOTP code
# Get current TOTP from authenticator app (Google Authenticator, Authy, etc.)
curl -X POST https://api.travel-platform.com/api/auth/mfa/verify \
  -H "Content-Type: application/json" \
  -d '{"session_id":"session_123","code":"123456"}'
# Expected: 200 OK, JWT issued, fully authenticated

# 4. Test recovery code (single-use)
curl -X POST https://api.travel-platform.com/api/auth/mfa/verify-recovery \
  -H "Content-Type: application/json" \
  -d '{"session_id":"session_456","recovery_code":"XXXX-XXXX-XXXX-XXXX"}'
# Expected: 200 OK on first use, 400 Bad Request on second use

# 5. Verify MFA is required in database
psql $DATABASE_URL -c "SELECT user_id, mfa_enabled, created_at FROM mfa_requirements WHERE agency_id = current_agency_id() LIMIT 5;"
# Expected: Rows returned with mfa_enabled=true for enrolled users
```

### 4.6 Audit Logging

```bash
# Verify audit logs are being written
psql $DATABASE_URL -c "
  SELECT 
    event_type, 
    user_id, 
    agency_id, 
    COUNT(*) as count
  FROM audit_logs 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY event_type, user_id, agency_id
  ORDER BY created_at DESC
  LIMIT 10;
"

# Expected output:
# event_type                 | user_id | agency_id | count
# ----------------------------- | -------- | ---------- | -------
# AUTH_SESSION_CREATE        | user_1  | agency_1  | 5
# MFA_VERIFICATION_SUCCESS   | user_1  | agency_1  | 2
# BOOKING_CREATED            | user_2  | agency_1  | 1
# ...

# Verify no sensitive data in logs
psql $DATABASE_URL -c "
  SELECT COUNT(*) as secret_count 
  FROM audit_logs 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  AND (
    metadata ILIKE '%password%' 
    OR metadata ILIKE '%secret%'
    OR metadata ILIKE '%token%'
  );
"
# Expected: 0 rows (no secrets exposed)

# Verify RLS protects audit logs
export CUSTOMER_JWT="<customer_token>"
curl -X GET https://api.travel-platform.com/api/audit-logs \
  -H "Authorization: Bearer $CUSTOMER_JWT"
# Expected: 403 Forbidden (customers can't access audit logs)
```

### 4.7 Error Handling

```bash
# 1. Test 404 Not Found
curl -X GET https://api.travel-platform.com/api/customers/nonexistent-id \
  -H "Authorization: Bearer $JWT" \
  -w "\nStatus: %{http_code}\n"
# Expected: 404 Not Found, message: "Customer not found"

# 2. Test validation error (400 Bad Request)
curl -X POST https://api.travel-platform.com/api/wishes \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"description":""}' \
  -w "\nStatus: %{http_code}\n"
# Expected: 400 Bad Request, field-level errors returned

# 3. Test authorization error (403 Forbidden)
# Use VIEWER role trying to create booking (requires AGENT+ role)
curl -X POST https://api.travel-platform.com/api/bookings \
  -H "Authorization: Bearer $VIEWER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"proposal_id":"..."}' \
  -w "\nStatus: %{http_code}\n"
# Expected: 403 Forbidden, message: "Insufficient permissions"

# 4. Test 500 error handling
# Trigger server error (varies by endpoint)
# Expected: 500 Internal Server Error, generic message (no stack trace)
# No sensitive implementation details leaked
```

### 4.8 Performance Baseline

```bash
# Time API response latency
time curl -s https://api.travel-platform.com/api/customers?limit=100 \
  -H "Authorization: Bearer $JWT" \
  | jq '.total'

# Expected: < 500ms for 100 customers
# Alert if > 1000ms (possible database or network issue)

# Monitor API process memory
ps aux | grep "node.*api" | grep -v grep | awk '{print $6 " MB"}'
# Expected: < 200MB in typical operation
# Alert if > 500MB (possible memory leak)

# Check database connection pool
psql $DATABASE_URL -c "
  SELECT 
    datname,
    count(*) as connection_count,
    max_conn,
    round(100.0 * count(*) / max_conn, 2) as used_percent
  FROM pg_stat_activity, pg_database
  WHERE pg_database.datname = pg_stat_activity.datname
  GROUP BY datname, max_conn;
"
# Expected: < 20 connections, < 75% of max pool
# Alert if > 80% utilized (connection leak possible)
```

---

## 5. MONITORING & ALERTING

### 5.1 Logging Infrastructure

**Where logs go**:
- Application logs: `stdout` (JSON format in production)
- API requests: Fastify request logs (request ID, path, method, status, latency)
- Database queries: Prisma logs (only if LOG_LEVEL=debug)
- Audit logs: Database table `audit_logs` (append-only)

**Aggregation** (choose one):
- **Datadog**: Set `DD_API_KEY`, logs auto-collected
- **CloudWatch**: AWS Lambda/ECS auto-collects
- **Sentry**: Set `SENTRY_DSN`, errors auto-collected
- **ELK Stack**: Forward logs via Fluent Bit
- **Splunk**: Configure log forwarder

**Sample Log Query** (find recent errors):
```sql
-- SQL for audit_logs table
SELECT created_at, event_type, user_id, agency_id, metadata
FROM audit_logs
WHERE event_type = 'ERROR'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 50;

-- JSON search (for application logs)
logQuery: {
  "service": "travel-platform-api",
  "status": "error",
  "timestamp": {"$gte": "2026-08-29T00:00:00Z"}
}
```

### 5.2 Key Metrics to Monitor

| Metric | Alert Threshold | Tool |
|--------|-----------------|------|
| **API Error Rate** | > 5% in 5 min | Datadog, CloudWatch |
| **API Latency (p95)** | > 1000ms | Prometheus, New Relic |
| **Database Conn Pool** | > 80% utilized | pg_stat_activity query |
| **Redis Latency** | > 100ms ping | redis-cli PING command |
| **MFA Failure Rate** | > 20 failures / 5 min | audit_logs query |
| **Rate Limit Hits** | > 100 429s / hour | Rate-limit metrics |
| **Disk Usage** | > 80% | Disk monitoring |
| **Memory Usage** | > 85% | Node process monitor |
| **Authentication Failures** | > 10 / 5 min | audit_logs query |

### 5.3 Alert Configuration Examples

**Datadog**:
```
Alert: "Travel Platform - High Error Rate"
Condition: avg:travel_platform.api.errors{service:api} > 5 over 5m
Notify: @pagerduty-oncall #alerts-prod

Alert: "Travel Platform - Rate Limit Exhaustion"
Condition: sum:travel_platform.rate_limit.429{*} > 100 over 1h
Notify: @slack-#ops
```

**AWS CloudWatch**:
```
Alarm: "API-500-Errors"
Metric: λ/travel-platform-api/5XXError
Threshold: > 5 errors in 5 minutes
Action: SNS notification to ops@example.com

Alarm: "RDS-Database-Down"
Metric: AWS/RDS/DatabaseConnections
Threshold: 0 for 2 minutes
Action: Page oncall engineer
```

**PostgreSQL Monitoring**:
```sql
-- Check for long-running queries
SELECT pid, usename, state, query, query_start
FROM pg_stat_activity
WHERE query_start < NOW() - INTERVAL '10 minutes'
AND state != 'idle';

-- Alert if queries running > 10 minutes
```

### 5.4 Dashboards

**Main Dashboard** (API + Database + Redis):
- API Error Rate (5-minute window)
- API Latency (p50/p95/p99)
- Database Query Times
- Redis Connection Count
- Authentication Success Rate
- MFA Verification Success Rate
- Rate Limit Hits (429 count)
- Audit Log Events (last hour)

**Security Dashboard**:
- Authentication Attempts (success vs. failure)
- MFA Enrollment Rate
- CAPTCHA Verification Rate
- Audit Log Event Types
- Cross-Tenant Access Attempts (should be 0)
- Rate Limit Violations

**Business Dashboard** (for stakeholders):
- Bookings Created (24h)
- Revenue Total (YTD)
- Active Users (daily)
- Proposal Acceptance Rate

---

## 6. ROLLBACK PROCEDURE

If critical production issue discovered post-deployment:

### 6.1 Immediate Action (Stop the Bleeding)

```bash
# 1. Stop affected instances
docker stop travel-platform-api  # or
systemctl stop travel-platform-api

# 2. Route traffic to previous version / standby
# - Update load balancer to point to v1.0.0-rc2 servers
# - Or failover to standby region
# - Or activate previous Kubernetes deployment

# 3. Alert on-call team immediately
# - PagerDuty incident
# - Slack #incident-response
# - Page lead engineer

# 4. Customer communication (if needed)
# - Post status on status.travel-platform.com
# - Email customers with ETA
```

### 6.2 Investigation Phase (5-30 minutes)

```bash
# 1. Examine error logs
kubectl logs deployment/travel-platform-api --tail=500
# or
tail -f /var/log/travel-platform/api.log | grep ERROR

# 2. Check database for issues
psql $DATABASE_URL -c "
  SELECT * FROM pg_stat_statements 
  WHERE mean_exec_time > 1000 
  ORDER BY mean_exec_time DESC LIMIT 10;
"

# 3. Check Redis connectivity
redis-cli ping
redis-cli info stats

# 4. Review recent changes in git
git log v1.0.0-rc2..v1.0.0-rc3 --oneline

# 5. Determine: Can we fix forward, or must rollback?
```

### 6.3 Rollback Execution

```bash
# Option 1: Revert to previous version (v1.0.0-rc2)
git checkout v1.0.0-rc2

# Option 2: If using Docker
docker pull your-registry.azurecr.io/travel-platform:v1.0.0-rc2
docker stop travel-platform-api
docker rm travel-platform-api
docker run -d --name travel-platform-api \
  -e DATABASE_URL=$DATABASE_URL \
  -e REDIS_URL=$REDIS_URL \
  your-registry.azurecr.io/travel-platform:v1.0.0-rc2

# Option 3: If using Kubernetes
kubectl set image deployment/travel-platform \
  travel-platform=your-registry.azurecr.io/travel-platform:v1.0.0-rc2

# Option 4: Rollback database (if schema migration caused issue)
# Only if migration was reversible
# psql $DATABASE_URL -c "ROLLBACK;" (only if transaction still open)
# Or manually revert migration:
psql $DATABASE_URL -c "\i infrastructure/migrations/REVERT_017_mfa_rls_p0_fix.sql"
```

### 6.4 Verify Rollback

```bash
# 1. Health checks pass
curl -s https://api.travel-platform.com/health | jq .
# Expected: {"status":"ok","version":"1.0.0-rc2"}

# 2. Error rate drops to normal
# Check logs: no new 5xx errors in 5 minutes

# 3. Alert resolves
# PagerDuty incident auto-resolves (if error-rate driven)

# 4. Communicate status
# Update status page: "Incident Resolved"
# Post in #ops: "Rolled back to v1.0.0-rc2, investigating root cause"
```

### 6.5 Post-Incident

```bash
# 1. Document what went wrong
# Create incident report (Confluence, Notion, etc.)
# Include: Timeline, RCA, lessons learned

# 2. Fix in new release
# Create fix branch from v1.0.0-rc2
# Deploy as v1.0.0-rc4 (or skip to v1.0.0)

# 3. Schedule post-mortem
# Invite: engineers, product, ops
# Time: within 48 hours of incident
# Outcome: prevent similar issues

# 4. Update runbooks
# Reflect lessons learned
# Update alert thresholds if needed
```

**Estimated Rollback Time**: 10-15 minutes (from detection to full traffic on previous version)

---

## 7. OPERATIONAL RUNBOOK

### 7.1 Start the Application

```bash
# Development
npm run dev                    # Starts all services in dev mode

# Production (via PM2)
pm2 start ecosystem.config.js --env production

# Production (via systemd)
systemctl start travel-platform-api
systemctl start travel-platform-agency
systemctl start travel-platform-customer

# Production (via Docker Compose)
docker-compose -f docker-compose.production.yml up -d

# Production (via Kubernetes)
kubectl apply -f k8s/production.yaml
```

### 7.2 Stop the Application

```bash
# Development
# Ctrl+C in terminal, or:
npm run dev -- --kill

# Production (PM2)
pm2 stop all

# Production (systemd)
systemctl stop travel-platform-api
systemctl stop travel-platform-agency

# Production (Docker)
docker-compose down

# Production (Kubernetes)
kubectl delete -f k8s/production.yaml
```

### 7.3 Restart a Service

```bash
# Restart API only
pm2 restart travel-platform-api
# or
systemctl restart travel-platform-api
# or
kubectl rollout restart deployment/travel-platform-api

# Restart Agency app
pm2 restart travel-platform-agency
# or
systemctl restart travel-platform-agency
```

### 7.4 View Logs

```bash
# API logs (last 50 lines)
pm2 logs travel-platform-api -n 50
# or
tail -50 /var/log/travel-platform/api.log
# or
kubectl logs deployment/travel-platform-api -n production --tail=50

# Continuous log stream
kubectl logs -f deployment/travel-platform-api -n production

# Database logs
psql $DATABASE_URL -c "
  SELECT * FROM audit_logs 
  WHERE created_at > NOW() - INTERVAL '1 hour' 
  ORDER BY created_at DESC 
  LIMIT 50 \g"

# Errors only
tail -f /var/log/travel-platform/api.log | grep ERROR
```

### 7.5 Database Operations

```bash
# Connect to database
psql postgresql://user:password@host:5432/travel_platform_prod

# Backup database
pg_dump -d travel_platform_prod -U postgres -h localhost > backup_$(date +%s).sql
# or via AWS
aws rds create-db-snapshot --db-instance-identifier travel-platform-prod \
  --db-snapshot-identifier backup-$(date +%Y%m%d-%H%M%S)

# Restore from backup
psql -d travel_platform_prod -U postgres < backup_123456.sql

# Run migration
npx prisma migrate deploy --skip-generate

# List applied migrations
psql $DATABASE_URL -c "SELECT version, finished_at FROM _prisma_migrations ORDER BY finished_at DESC;"

# Check RLS policies
psql $DATABASE_URL -c "
  SELECT schemaname, tablename, rowsecurity, policyname 
  FROM pg_tables 
  LEFT JOIN pg_policies ON pg_tables.oid = pg_policies.relname::regclass
  WHERE schemaname = 'public' 
  ORDER BY tablename;"

# Troubleshoot multi-tenant isolation
psql $DATABASE_URL -c "
  SELECT * FROM audit_logs 
  WHERE event_type = 'RBAC_VIOLATION' 
  ORDER BY created_at DESC 
  LIMIT 10;"
```

### 7.6 Redis Operations

```bash
# Check Redis connectivity
redis-cli ping
# Expected: PONG

# View memory usage
redis-cli info memory | grep used_memory_human
# Expected: < 1GB typically

# Flush rate-limit cache (use cautiously!)
redis-cli FLUSHDB
# Warning: This resets all rate-limit counters!

# Monitor live commands
redis-cli MONITOR

# Check key expiration
redis-cli TTL "ratelimit:user:user_1"
# Expected: -1 (no expiration) or > 0 (seconds remaining)
```

### 7.7 MFA Management

```bash
# Disable MFA for a user (admin action)
psql $DATABASE_URL -c "
  UPDATE mfa_requirements 
  SET mfa_enabled = false 
  WHERE user_id = 'user_123';"

# View MFA enrollment status
psql $DATABASE_URL -c "
  SELECT user_id, agency_id, mfa_enabled, created_at 
  FROM mfa_requirements 
  WHERE agency_id = 'agency_1' 
  ORDER BY created_at DESC;"

# Reset TOTP secret for user (they must re-enroll)
psql $DATABASE_URL -c "
  DELETE FROM mfa_totp_secrets 
  WHERE user_id = 'user_123';"

# Check recovery code usage
psql $DATABASE_URL -c "
  SELECT user_id, used_at 
  FROM mfa_recovery_codes 
  WHERE user_id = 'user_123' 
  ORDER BY used_at DESC;"
```

### 7.8 Rate Limiting Troubleshooting

```bash
# User blocked by rate limit (429)?
# Check Redis for their key
redis-cli GET "ratelimit:user:user_1"
# Returns: remaining count (0 if blocked)

# Reset rate limit for user
redis-cli DEL "ratelimit:user:user_1"
# User can immediately retry

# Disable rate limiting (emergency only!)
# Edit .env: RATE_LIMIT_ENABLED=false
# Restart API

# Check rate-limit store connectivity
curl -X GET https://api.travel-platform.com/api/health/redis | jq .redis
# Expected: "connected" with "PONG" ping
```

### 7.9 Performance Troubleshooting

**Issue: API requests slow (> 1000ms)**
```sql
-- Find slow queries
SELECT * FROM pg_stat_statements 
WHERE mean_exec_time > 100 
ORDER BY mean_exec_time DESC LIMIT 10;

-- Check for missing indexes
SELECT schemaname, tablename FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check query plan for slow query
EXPLAIN ANALYZE 
SELECT * FROM bookings WHERE agency_id = 'agency_1' LIMIT 10;
```

**Issue: Memory leak (API process growing)**
```bash
# Monitor process memory
watch -n 1 'ps aux | grep node | grep api | awk "{print \$2, \$6 \" MB\"}"'

# Check for Redis connection leaks
redis-cli info stats | grep client_connections

# Restart affected service
systemctl restart travel-platform-api
```

**Issue: Database connection pool exhausted**
```sql
-- Check connection count
SELECT count(*) FROM pg_stat_activity WHERE datname = 'travel_platform_prod';

-- Find idle connections
SELECT pid, usename, state, query_start 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND query_start < NOW() - INTERVAL '30 minutes';

-- Terminate idle connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND query_start < NOW() - INTERVAL '30 minutes';
```

---

## 8. SECURITY CHECKLIST

- [ ] SSL/TLS certificates installed and valid
- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] CORS policies restricted to known domains
- [ ] JWT secret strong (256+ bit, random)
- [ ] Database passwords strong (32+ chars, mixed case + symbols)
- [ ] PostgreSQL RLS policies enabled on all sensitive tables
- [ ] MFA enabled for admin users
- [ ] Rate limiting enabled with Redis backing
- [ ] Audit logging enabled and monitored
- [ ] No secrets in environment or logs
- [ ] Database backups tested and verified
- [ ] Firewall restricts access (DB/Redis from app servers only)
- [ ] Security headers configured (Helmet)
- [ ] CAPTCHA enabled for login
- [ ] Session timeout configured (15 minutes)
- [ ] Account lockout after failed login attempts
- [ ] Security.txt file configured
- [ ] Dependency vulnerabilities scanned (npm audit)
- [ ] Secrets scanning enabled (git-secrets, Trivy)
- [ ] Monitoring alerts configured

---

## 9. CONTACT & ESCALATION

**On-Call Rotation**:
- Primary: [Engineer name] - [Phone] - [Slack]
- Secondary: [Engineer name] - [Phone] - [Slack]
- Manager: [Manager name] - [Phone] - [Slack]

**Slack Channels**:
- #travel-platform-ops - Operations & deployments
- #travel-platform-incidents - Active incidents
- #alerts-prod - Automated alerts from monitoring

**Escalation Path**:
1. **Level 1** (5 min): Check logs, verify services running, restart if needed
2. **Level 2** (10 min): Investigate database/Redis, check metrics
3. **Level 3** (20 min): Analyze root cause, consider rollback
4. **Level 4** (30+ min): Page lead engineer, initiate incident response

---

## 10. VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0-rc3 | 2026-08-29 | P0 MFA RLS fix, security patches, full test suite |
| 1.0.0-rc2 | 2026-08-27 | Production auth, CAPTCHA, MFA, rate limiting |
| 1.0.0-rc1 | 2026-08-20 | Initial release candidate, core features |

---

**Document Version**: 1.0  
**Last Updated**: 2026-08-29  
**Owner**: Agent 08 (PRODUCTION_AND_HANDOFF)  
**Review Frequency**: Quarterly or as deployment practice evolves
