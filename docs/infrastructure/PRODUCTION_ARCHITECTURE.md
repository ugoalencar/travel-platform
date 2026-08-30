# Travel Platform — Production Architecture

## Overview

Travel Platform v1.0.0-rc1 is designed as a **containerized multi-tier SaaS application** deployable to cloud platforms (AWS, GCP, Azure, or self-hosted Kubernetes).

```
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer / Ingress                     │
│                  (TLS termination, CORS)                         │
└──────────┬──────────────────┬──────────────────┬────────────────┘
           │                  │                  │
      ┌────▼────┐        ┌────▼────┐       ┌────▼────┐
      │ Agency   │        │ Customer │       │ API     │
      │ Portal   │        │ Portal   │       │ Server  │
      │ (React)  │        │ (React)  │       │(Fastify)│
      └────┬────┘        └────┬────┘       └────┬────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
            ┌─────▼─────┐          ┌─────▼─────┐
            │ PostgreSQL │          │ Redis     │
            │ (RLS, RBAC)│          │ (Sessions,│
            │            │          │ Rate Limit)
            └────────────┘          └───────────┘
                  │
            ┌─────▼──────────┐
            │  Object Storage │
            │  (Documents)    │
            └─────────────────┘
```

## Infrastructure Components

### 1. Application Runtime

**Technology:** Node.js 24 (TypeScript)

**Services:**
- API Server (Fastify): `services/api/src/app.ts`
- Agency Portal (React + Vite): `apps/agency/`
- Customer Portal (React + Vite): `apps/customer/`

**Container image:** Multi-stage build
```dockerfile
# Stage 1: Build (TypeScript, React)
FROM node:24-alpine AS builder
# ... compile ts, bundle React

# Stage 2: Runtime (minimal)
FROM node:24-alpine
# ... copy runtime deps only
```

**Ports:**
- API: 4000
- Agency Portal: 5173 (or 3000 in docker)
- Customer Portal: 5174 (or 3001 in docker)

### 2. PostgreSQL 15+

**Purpose:** Primary data store for multi-tenant SaaS

**Key features:**
- Row-level security (RLS) enforced at DB layer
- Role-based access control (RBAC)
- Immutable audit trails
- Connection pooling (PgBouncer recommended)

**Requirements:**
- PostgreSQL 15 or later
- Extensions enabled: `plpgsql` (default)
- Connection pool size: 20-50 depending on load
- Backup: automated daily + WAL archiving

**Credentials:**
- Runtime role: `travel_app_runtime` (read/write SELECT/INSERT/UPDATE)
- Migration role: `travel_migrations` (DDL access)
- Superuser: for initial setup only

**Connection string:**
```
postgresql://travel_app_runtime:PASSWORD@host:5432/travel_platform_prod
```

### 3. Redis

**Purpose:** Distributed session store, rate limiting, caching

**Requirements:**
- Redis 6.0+
- External instance (required, no in-memory fallback in production)
- TLS if provider supports
- Persistence enabled (RDB or AOF)

**Key-value schema:**
- Session tokens: `session:{token}` → user data (TTL: 15m)
- Rate limits: `ratelimit:{ip}:{endpoint}` → count (TTL: 1m)
- Cache: `cache:{key}` → serialized value (TTL: variable)

**Connection string:**
```
redis://[:password@]host:6379/0
```

### 4. Object Storage (Documents)

**Purpose:** Private storage for customer documents

**Requirements:**
- Non-public access (no anonymous reads)
- Bucket/container name: `travel-platform-documents-prod`
- Encryption at rest (AES-256)
- Lifecycle policy: 90-day retention minimum

**Supported providers:**
- AWS S3
- Google Cloud Storage
- Azure Blob Storage
- MinIO (self-hosted S3-compatible)

**Access pattern:**
- Server-side signed URLs (expires in 1 hour)
- No public direct URLs
- All access logged in audit trail

### 5. TLS / Domain / DNS

**Agency Portal:**
- Domain: `agencies.travel-platform.com` (example)
- Certificate: Issued by trusted CA (Let's Encrypt or commercial)
- HSTS: `max-age=31536000` (1 year)

**Customer Portal:**
- Domain: `travel.travel-platform.com` (example)
- Certificate: Same or wildcard cert
- HSTS: `max-age=31536000`

**API:**
- Domain: `api.travel-platform.com` (example)
- Certificate: Same or wildcard cert
- CORS configured to allow only above domains

**DNS records required:**
```
agencies.travel-platform.com    A    <load-balancer-ip>
travel.travel-platform.com      A    <load-balancer-ip>
api.travel-platform.com         A    <load-balancer-ip>
```

### 6. Secrets Management

**Secret store:** (choose based on platform)
- AWS Secrets Manager
- Google Secret Manager
- Kubernetes Secrets + sealed-secrets
- HashiCorp Vault

**Secrets stored:**
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `MFA_ENCRYPTION_KEY`
- `OIDC_CLIENT_SECRET` (if applicable)
- Object storage credentials

**Access:** Injected as environment variables at container launch

### 7. Load Balancer / Ingress

**Requirements:**
- TLS termination
- Health checks (readiness + liveness)
- Session affinity (if needed)
- Rate limiting (optional, can be in Redis)

**Routing:**
```
Load Balancer
├── /api/* → API (4000)
├── / (agency domain) → Agency Portal (5173)
└── / (customer domain) → Customer Portal (5174)
```

### 8. Observability

**Logging:**
- Application logs → JSON to stdout
- Aggregation → Cloudwatch / Datadog / ELK
- Retention → 30 days minimum

**Metrics:**
- Request latency (p50, p95, p99)
- Error rate (5xx)
- Database pool utilization
- Redis memory

**Tracing:** (optional)
- Distributed trace IDs in logs
- APM integration if available

### 9. Backup & Recovery

**See:** `docs/operations/BACKUP_AND_RECOVERY.md`

- PostgreSQL: Daily backups + WAL archiving
- Redis: Snapshots hourly
- Restore drill: Monthly

### 10. CI/CD Pipeline

**See:** `.github/workflows/ci.yml`

**Pre-deployment checks:**
1. Lint (0 errors)
2. TypeCheck (0 errors)
3. Security scan (no high-severity CVEs)
4. Tests (all passing)
5. Migrations validation (no duplicates, correct sequence)
6. Build (production bundle)

**Deployment:**
- Exact immutable tag deployment: `v1.0.0-rc1`
- No floating `latest` tags
- Canary rollout: 5% → 25% → 50% → 100%

## Deployment Models

### Model A: Docker Compose (Small/Staging)

**Use case:** Staging, small production (< 1k users)

```bash
docker-compose up -d
```

**Includes:** API, Agency, Customer, PostgreSQL, Redis

**Limits:** Single machine, no HA, manual backups

### Model B: Kubernetes (Medium/Large Production)

**Use case:** Production (1k-100k+ users)

**Components:**
- Deployment manifests
- Service mesh (optional)
- Ingress controller
- StatefulSets for DB/Redis (or managed services)

**Scaling:** Horizontal pod autoscaling (HPA) based on CPU/Memory

### Model C: Managed Services (Recommended)

**Use case:** Production (all scales)

**Services:**
- Cloud Run / App Engine (API + Frontends)
- Cloud SQL / RDS (PostgreSQL)
- Memorystore / ElastiCache (Redis)
- Cloud Storage / S3 (Documents)

**Benefits:** Automated backups, high availability, CDN integration, less operational overhead

## Environment Variables

**See:** `.env.production.example` for all configuration options

**Critical for production:**
```
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=(random 32-byte hex)
ALLOW_DEV_AUTH=false
COOKIE_SECURE=true
```

## Security Checklist

- [ ] No dev-auth headers enabled
- [ ] No localhost databases
- [ ] No in-memory Redis fallback
- [ ] TLS enforced on all endpoints
- [ ] CORS allowlist strict (no wildcards)
- [ ] Secrets in manager, never in code
- [ ] Database RLS/FORCE enabled
- [ ] Rate limiting active
- [ ] Audit logging enabled
- [ ] MFA encryption key configured
- [ ] Document storage is private
- [ ] Backups automated and tested

## Post-Deployment Tasks

1. **Smoke tests** (see Phase 27_PRODUCTION_DEPLOY_AND_GO_LIVE)
2. **Monitor metrics** (first 24 hours)
3. **User acceptance testing** (first week)
4. **Performance baseline** (week 2)
5. **Security scan** (week 3)

## References

- Backup/Recovery: `docs/operations/BACKUP_AND_RECOVERY.md`
- Rollback: `docs/operations/ROLLBACK.md`
- CI/CD: `.github/workflows/ci.yml`
- Environment: `.env.production.example`
- Database: `infrastructure/migrations/`
