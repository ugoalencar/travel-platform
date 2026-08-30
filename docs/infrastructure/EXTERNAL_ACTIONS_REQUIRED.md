# Travel Platform v1.0.0-rc1 — External Actions Required

**Status:** BLOCKED_EXTERNAL

**Release SHA:** 0a762ee (tag: v1.0.0-rc1)

**Code Status:** ✅ READY (P0=0, P1=0, all gates pass)

**Infrastructure Status:** ⏸️ AWAITING (external service provisioning required)

---

## External Services Required

### 1. PostgreSQL 15+ Production Database

**Why Required:** Primary data store for multi-tenant SaaS

**Exact Value Needed:**
- Database host: `prod-db.internal` (or your provider's hostname)
- Database port: `5432`
- Database name: `travel_platform_prod`
- Runtime user: `travel_app_runtime` (create with limited permissions)
- Migration user: `travel_migrations` (DDL-only access)
- Database passwords: (random, 32+ chars, stored in secrets manager)

**Where to Obtain:**
- AWS: RDS PostgreSQL 15
- GCP: Cloud SQL PostgreSQL 15
- Azure: Database for PostgreSQL 15
- Self-hosted: PostgreSQL 15 server

**Where to Configure:**
- Store `DATABASE_URL` in GitHub Secrets or secrets manager
- Inject at container launch: `export DATABASE_URL=...`
- **Do NOT put credentials in code or .env files**

**Can Deploy Continue Without It:** NO — database is mandatory

---

### 2. Redis 6.0+ (Managed or Self-Hosted)

**Why Required:** Session storage, rate limiting, distributed state

**Exact Value Needed:**
- Redis host: `prod-redis.internal` (or your provider's hostname)
- Redis port: `6379` (standard)
- Redis password: (random, 32+ chars)
- TLS support: (recommended if provider supports)

**Where to Obtain:**
- AWS: ElastiCache Redis
- GCP: Memorystore for Redis
- Azure: Azure Cache for Redis
- Self-hosted: Redis server on private network

**Where to Configure:**
- Store `REDIS_URL` in GitHub Secrets or secrets manager
- Inject at container launch: `export REDIS_URL=...`
- **Do NOT put password in code**

**Can Deploy Continue Without It:** NO — rate limiting requires Redis

---

### 3. OIDC / OAuth2 Provider (Optional, If Using External Auth)

**Why Required:** Only if NOT using built-in JWT authentication

**Current Status:** Application uses JWT-based auth (no OIDC configured yet)

**If needed in future:**
- OIDC Issuer URL: `https://auth.example.com` or similar
- Client ID: `travel-platform-prod`
- Client Secret: (random, stored in secrets manager)
- Redirect URLs: 
  - Agency: `https://agencies.travel-platform.com/auth/callback`
  - Customer: `https://travel.travel-platform.com/auth/callback`

**Where to Obtain:**
- Auth0
- Okta
- Google Identity Platform
- Microsoft Entra
- Self-hosted OpenID provider

**Can Deploy Continue Without It:** YES (JWT auth works standalone)

---

### 4. TLS Certificates & Domain Names

**Why Required:** HTTPS, security, browser trust

**Exact Values Needed:**
- Agency Portal domain: `agencies.travel-platform.com` (example, customize)
- Customer Portal domain: `travel.travel-platform.com` (example, customize)
- API domain: `api.travel-platform.com` (example, customize)
- TLS certificate: Issued by trusted CA for all three domains

**Where to Obtain:**
- Let's Encrypt (free, auto-renew)
- Commercial CA (Comodo, DigiCert, etc.)
- Cloud provider's managed certificates (AWS Certificate Manager, GCP SSL Certificate, Azure)

**Where to Configure:**
- Load balancer / Ingress Controller
- DNS records pointing to load balancer IP

**DNS Records Required:**
```
agencies.travel-platform.com  A  <load-balancer-ip>
travel.travel-platform.com    A  <load-balancer-ip>
api.travel-platform.com       A  <load-balancer-ip>
```

**Can Deploy Continue Without It:** NO — browsers require HTTPS for credentials

---

### 5. Object Storage for Documents

**Why Required:** Private storage for customer documents (not in database)

**Exact Value Needed:**
- Storage bucket/container: `travel-platform-documents-prod`
- Region: (your choice, e.g., us-east-1)
- Credentials: (access key/secret, stored in secrets manager)
- Encryption: Enabled (AES-256)

**Where to Obtain:**
- AWS: S3 bucket
- GCP: Cloud Storage bucket
- Azure: Blob Storage container
- Self-hosted: MinIO or S3-compatible server

**Where to Configure:**
- Store `DOCUMENT_STORAGE_URL` in secrets manager
- Example: `s3://travel-platform-documents-prod`
- Inject credentials via AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

**Access Pattern:**
- Server generates signed URLs (valid 1 hour)
- No public direct access
- All access logged in audit trail

**Can Deploy Continue Without It:** NO (document upload feature requires storage)

---

### 6. Secrets Manager

**Why Required:** Secure storage for credentials, not in code

**Exact Value Needed:**
- Secrets manager access configured for deployment pipeline
- Secrets stored:
  - `travel-platform/prod/DATABASE_URL`
  - `travel-platform/prod/REDIS_URL`
  - `travel-platform/prod/JWT_SECRET`
  - `travel-platform/prod/MFA_ENCRYPTION_KEY`
  - `travel-platform/prod/DOCUMENT_STORAGE_CREDENTIALS`

**Where to Obtain:**
- AWS Secrets Manager
- Google Secret Manager
- Azure Key Vault
- HashiCorp Vault
- GitHub Secrets (limited, use for CI/CD only)

**Where to Configure:**
- Create secrets via provider's UI or CLI
- Grant deployment service account read permissions
- Inject via environment at container launch

**Can Deploy Continue Without It:** NO (credentials must be secured)

---

### 7. Container Registry

**Why Required:** Store and distribute Docker images

**Exact Value Needed:**
- Registry URL: `gcr.io/myproject/travel-platform-api:v1.0.0-rc1` (example)
- Registry credentials: (push access for CI/CD pipeline)

**Where to Obtain:**
- AWS ECR (Elastic Container Registry)
- GCP GCR (Google Container Registry)
- Azure Container Registry
- Docker Hub
- Private registry (Nexus, Artifactory)

**Where to Configure:**
- Configure in CI/CD pipeline (.github/workflows/)
- Push built image after all tests pass
- Tag with exact release SHA/tag

**Can Deploy Continue Without It:** NO (need place to store container images)

---

### 8. Load Balancer / Ingress Controller

**Why Required:** Route traffic to API and portals, TLS termination

**Exact Value Needed:**
- Load balancer IP address or DNS name: `prod-lb.travel-platform.com`
- Routing rules configured (see PRODUCTION_ARCHITECTURE.md)
- Health check endpoints configured

**Where to Obtain:**
- AWS: Application Load Balancer (ALB) or Network Load Balancer
- GCP: Cloud Load Balancing
- Azure: Application Gateway
- Self-hosted Kubernetes: Ingress Controller (nginx-ingress, istio, etc.)

**Where to Configure:**
- Route `/api/*` to API (port 4000)
- Route `/` to Agency Portal (port 5173) on agencies domain
- Route `/` to Customer Portal (port 5174) on travel domain
- TLS termination

**Can Deploy Continue Without It:** NO (need way to receive traffic)

---

### 9. Observability / Logging Stack

**Why Required:** Monitor health, debug issues, audit access

**Exact Value Needed:**
- Logging service endpoint: (your provider's URL)
- Log index/dataset name: `travel-platform-prod`
- Credentials: (API key, stored in secrets manager)

**Where to Obtain:**
- AWS CloudWatch
- GCP Cloud Logging
- Azure Monitor
- Datadog
- Elastic Stack / ELK
- Splunk
- Grafana Loki

**Where to Configure:**
- Application sends logs to stdout (JSON format)
- Log aggregator ships to service
- Set up dashboards and alerts

**Can Deploy Continue Without It:** NO — need visibility into production

---

### 10. Billing / Cloud Account

**Why Required:** Pay for managed services (compute, database, storage)

**Exact Value Needed:**
- Cloud account (AWS, GCP, Azure, etc.)
- Billing method configured
- Budget alerts set up

**Where to Obtain:**
- Create account at provider's website
- Add payment method
- Set up billing alerts

**Can Deploy Continue Without It:** NO (need place to run infrastructure)

---

## Action Items Summary

| Item | Status | Action | Timeline |
|------|--------|--------|----------|
| PostgreSQL | ❌ BLOCKED | Provision managed RDS/Cloud SQL/etc | Week 1 |
| Redis | ❌ BLOCKED | Provision ElastiCache/Memorystore/etc | Week 1 |
| Object Storage | ❌ BLOCKED | Create S3/GCS/Azure bucket | Week 1 |
| Secrets Manager | ❌ BLOCKED | Set up and populate secrets | Week 1 |
| Domains | ❌ BLOCKED | Register/allocate domains | Week 1 |
| TLS Cert | ❌ BLOCKED | Issue certificate | Week 1 |
| Load Balancer | ❌ BLOCKED | Configure ALB/CloudLB/Ingress | Week 1 |
| Container Registry | ❌ BLOCKED | Create and configure | Week 1 |
| Observability | ⚠️ OPTIONAL | Set up logging/monitoring | Week 2 |
| OIDC | ⚠️ OPTIONAL | Only if external IdP needed | Week 2+ |

---

## Next Steps

**Once all external services are provisioned and configured:**

1. Update `.env.production` with actual service endpoints
2. Populate secrets manager with credentials
3. Update DNS records to point to load balancer
4. Proceed with Phase 02: Production Deploy + Go-Live

**Code is ready now. Waiting on infrastructure provisioning.**

---

## Contacts & Escalation

- **Infrastructure Lead:** infra@travel-platform.com
- **Cloud Architect:** architect@travel-platform.com
- **SRE:** sre@travel-platform.com
- **Security:** security@travel-platform.com
