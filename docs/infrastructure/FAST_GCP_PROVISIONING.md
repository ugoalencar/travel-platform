# TRAVEL PLATFORM — FAST INFRASTRUCTURE PROVISIONING (GCP)

## Mission

Provision complete production and staging infrastructure on Google Cloud Platform in **2-4 hours** using Infrastructure-as-Code (Terraform), with zero secrets in code and full readiness for deployment of v1.0.0-rc1 @ 0a762ee.

**Selected Stack:**
- Cloud Run (API, Agency Portal, Customer Portal)
- Cloud SQL PostgreSQL 15
- Memorystore Redis
- Cloud Storage (private documents bucket)
- Secret Manager (credential vault)
- Artifact Registry (container images)
- Cloud Build (CI/CD automation)
- Cloud Monitoring (observability)

## Autonomy & Constraints

**You are autonomous to:**
- Choose GCP region (recommend us-central1)
- Select machine sizes (start economical)
- Name resources consistently
- Structure Terraform modules
- Configure VPC, firewall, service accounts
- Set up IAM roles
- Create CI/CD triggers
- Configure backup policies
- Set up monitoring/logging

**You STOP and escalate ONLY for:**
- `gcloud auth` (requires human's GCP credentials)
- Project ID creation (requires human's billing account)
- Domain registration/transfer (requires domain registrar)
- DNS delegation (requires DNS provider control)
- OIDC provider credentials (if external IdP needed)
- TLS certificate generation (if not using Cloud Armor)

**No reversible technical decision is a blocker.**

## Provisioning Order (Strict Sequence)

### 1. GCP Project & Region Setup
- [ ] gcloud auth login (HUMAN ACTION)
- [ ] Create project or use existing (HUMAN provides PROJECT_ID)
- [ ] Set PROJECT_ID env var
- [ ] Enable required APIs (compute, sql, redis, storage, secretmanager, run, artifactregistry, cloudbuild, monitoring)
- [ ] Create Terraform state bucket (gs://{PROJECT_ID}-terraform-state)
- [ ] Initialize terraform remote state

### 2. Artifact Registry
- [ ] Create Artifact Registry repository: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel-platform`
- [ ] Configure authentication
- [ ] Tag v1.0.0-rc1 image: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel-platform/api:v1.0.0-rc1`

### 3. Cloud SQL PostgreSQL 15
- [ ] Create PostgreSQL instance (db-pg15-prod, 2 vCPU, 8GB RAM, SSD)
- [ ] Create database: `travel_platform_prod`
- [ ] Create runtime user: `travel_app_runtime`
- [ ] Create migration user: `travel_migrations`
- [ ] Set strong passwords (store in Secret Manager)
- [ ] Enable automated backups (daily, 30-day retention)
- [ ] Enable automated failover (HA setup)
- [ ] Configure private IP only (no public IP)
- [ ] Test connection from local: `psql -h {PRIVATE_IP} -U travel_app_runtime -d travel_platform_prod`
- [ ] Run migrations: `npm run migrations:validate` then `npm run db:migrate`

### 4. Memorystore Redis
- [ ] Create Redis instance (redis-prod, 5GB, standard tier)
- [ ] Configure private IP only
- [ ] Set strong auth password
- [ ] Enable persistence (RDB snapshots)
- [ ] Store password in Secret Manager
- [ ] Test connection: `redis-cli -h {PRIVATE_IP} -a {PASSWORD} ping`

### 5. Cloud Storage (Private Documents)
- [ ] Create bucket: `travel-platform-documents-prod`
- [ ] Enable uniform bucket-level access
- [ ] Block all public access (ACL disabled)
- [ ] Enable encryption at rest (Google-managed keys)
- [ ] Set lifecycle policy (90-day retention)
- [ ] Create bucket for staging: `travel-platform-documents-staging`
- [ ] Test upload/download with signed URLs (1-hour expiry)

### 6. Secret Manager
- [ ] Store: DATABASE_URL (postgresql://...)
- [ ] Store: REDIS_URL (redis://...)
- [ ] Store: JWT_SECRET (random 64-char hex)
- [ ] Store: MFA_ENCRYPTION_KEY (random 64-char hex)
- [ ] Store: OIDC_CLIENT_SECRET (if external IdP)
- [ ] Create service account with Secret Manager accessor role
- [ ] Test retrieval via gcloud secrets get-latest-version

### 7. Service Accounts & IAM
- [ ] Create service account: `travel-platform-api`
- [ ] Create service account: `travel-platform-ci`
- [ ] Grant API service account: Secret Manager accessor, Cloud SQL client, Cloud Storage admin, Memorystore accessor
- [ ] Grant CI service account: Artifact Registry writer, Cloud Build trigger, Cloud Run deployer
- [ ] Create key files (JSON) for CI/CD GitHub Actions

### 8. Cloud Run — API Server
- [ ] Deploy: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel-platform/api:v1.0.0-rc1`
- [ ] Service name: `travel-platform-api-prod`
- [ ] CPU: 2, Memory: 2Gi, Timeout: 60s
- [ ] Min instances: 1, Max instances: 10
- [ ] Environment variables injected from Secret Manager
- [ ] Service account: travel-platform-api
- [ ] Ingress: internal (only from load balancer)
- [ ] Health check: /health endpoint
- [ ] Test: `curl -H "Authorization: Bearer {TOKEN}" https://cloud-run-url/health`

### 9. Cloud Run — Agency Portal
- [ ] Deploy: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel-platform/agency:v1.0.0-rc1`
- [ ] Service name: `travel-platform-agency-prod`
- [ ] Configuration: similar to API
- [ ] Route: /agency/* traffic
- [ ] Test: Load in browser from Cloud Run URL

### 10. Cloud Run — Customer Portal
- [ ] Deploy: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel-platform/customer:v1.0.0-rc1`
- [ ] Service name: `travel-platform-customer-prod`
- [ ] Configuration: similar to API
- [ ] Route: /customer/* traffic
- [ ] Test: Load in browser from Cloud Run URL

### 11. Domain & TLS
- [ ] Domain: `agencies.travel-platform.com` (HUMAN registers if needed)
- [ ] Domain: `travel.travel-platform.com` (HUMAN registers if needed)
- [ ] Domain: `api.travel-platform.com` (HUMAN registers if needed)
- [ ] Update DNS records to point to Cloud Load Balancer IP
- [ ] Create Cloud Armor security policy (CORS, rate limit, DDoS)
- [ ] TLS via managed certificates (auto-renewal)
- [ ] Test: `curl -I https://agencies.travel-platform.com` (returns 200/302)

### 12. OIDC Callbacks (If External IdP)
- [ ] Register OIDC provider (Auth0, Okta, etc.)
- [ ] Add redirect URLs:
  - `https://agencies.travel-platform.com/auth/callback`
  - `https://travel.travel-platform.com/auth/callback`
- [ ] Store OIDC_CLIENT_SECRET in Secret Manager
- [ ] Test OIDC flow end-to-end

### 13. Backup & Restore
- [ ] Verify Cloud SQL automated backups configured
- [ ] Test restore procedure (create test instance from backup)
- [ ] Create `docs/operations/GCP_BACKUP_RESTORE.md` with exact procedures
- [ ] Test recovery drill (restore, verify data, destroy test instance)

### 14. Observability & Logging
- [ ] Enable Cloud Logging for Cloud Run services
- [ ] Create Cloud Monitoring dashboard (error rates, latency, replicas)
- [ ] Set up alerts: 5xx errors > 1%, latency p99 > 1s
- [ ] Verify JSON logs shipping to Cloud Logging
- [ ] Create log sink for audit trail

### 15. CI/CD Pipeline (Cloud Build)
- [ ] Create Cloud Build trigger on GitHub (`release/product-completion-final` branch)
- [ ] Build steps: lint, typecheck, test, security, migrations validate, build
- [ ] Push image to Artifact Registry: `api:v1.0.0-rc1`, `agency:v1.0.0-rc1`, `customer:v1.0.0-rc1`
- [ ] Deploy to Cloud Run STAGING first (automated)
- [ ] Manual approval step before PRODUCTION
- [ ] Deploy to Cloud Run PRODUCTION (on approval)
- [ ] Test: Push commit, verify build triggers

### 16. Staging Environment Smoke Tests
- [ ] Deploy all three services to staging Cloud Run instances
- [ ] Create staging databases (copy schema only)
- [ ] Create staging Redis instance
- [ ] Create staging storage bucket
- [ ] Run smoke test suite against staging:
  - Agency login → dashboard → customer search
  - Customer login → home → trips
  - Create offer → campaign → proposal
  - Financial dashboard
- [ ] Document pass/fail

### 17. Production Ready Check
- [ ] Terraform apply succeeds with no errors
- [ ] All resources created and accessible
- [ ] Database connectivity verified (psql command works)
- [ ] Redis connectivity verified (redis-cli command works)
- [ ] Storage bucket is private (no public access)
- [ ] Secrets are present in Secret Manager
- [ ] Container images pushed to Artifact Registry
- [ ] Cloud Run services responding to health checks
- [ ] Load balancer routing traffic correctly
- [ ] TLS certificates valid
- [ ] Backup automation active
- [ ] Monitoring dashboards showing data
- [ ] CI/CD pipeline functional

## Terraform Structure

```hcl
# main.tf
provider "google" {
  project = var.project_id
  region  = var.region
}

# Variables
variable "project_id" {
  type = string
  description = "GCP Project ID"
}

variable "region" {
  type = string
  default = "us-central1"
}

variable "release_sha" {
  type = string
  default = "0a762ee"
}

# Modules
module "database" {
  source = "./modules/cloud-sql"
  project_id = var.project_id
  region = var.region
}

module "redis" {
  source = "./modules/memorystore"
  project_id = var.project_id
  region = var.region
}

module "storage" {
  source = "./modules/cloud-storage"
  project_id = var.project_id
}

module "secrets" {
  source = "./modules/secret-manager"
  project_id = var.project_id
}

module "run" {
  source = "./modules/cloud-run"
  project_id = var.project_id
  region = var.region
  database_url = module.database.connection_url
  redis_url = module.redis.connection_url
}

# Load balancer
resource "google_compute_backend_service" "api" {
  # ... routing to Cloud Run API service
}

# Outputs
output "api_url" {
  value = module.run.api_url
}

output "agency_url" {
  value = module.run.agency_url
}

output "customer_url" {
  value = module.run.customer_url
}
```

## Evidence Required (Not Optional)

**Before marking PRODUCTION = READY:**

1. **Terraform Plan Output**
   ```bash
   terraform plan -out=tfplan.out
   # Confirm all resources in plan
   ```

2. **Resource Creation Evidence**
   ```bash
   gcloud sql instances list | grep travel-platform-prod
   gcloud redis instances list | grep redis-prod
   gsutil ls -b gs://travel-platform-documents-prod
   gcloud secrets list | grep travel-platform
   gcloud run services list | grep travel-platform
   ```

3. **Database Connectivity**
   ```bash
   psql postgresql://travel_app_runtime:PASSWORD@{DB_IP}:5432/travel_platform_prod -c "SELECT version();"
   ```

4. **Redis Connectivity**
   ```bash
   redis-cli -h {REDIS_IP} -a {PASSWORD} ping
   ```

5. **Storage Bucket Privacy**
   ```bash
   gsutil iam get gs://travel-platform-documents-prod
   # Confirm allUsers NOT listed
   ```

6. **Secrets Present**
   ```bash
   gcloud secrets versions access latest --secret="DATABASE_URL"
   gcloud secrets versions access latest --secret="REDIS_URL"
   gcloud secrets versions access latest --secret="JWT_SECRET"
   ```

7. **Image Pushed**
   ```bash
   gcloud artifacts docker images list us-central1-docker.pkg.dev/{PROJECT_ID}/travel-platform
   # Confirm api, agency, customer images @ v1.0.0-rc1
   ```

8. **Cloud Run Health**
   ```bash
   curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
     https://travel-platform-api-prod-{hash}.run.app/health
   # Confirm 200 OK
   ```

## Final Checklist

- [ ] GCP project created
- [ ] All APIs enabled
- [ ] PostgreSQL provisioned, migrations applied
- [ ] Redis provisioned, connectivity verified
- [ ] Storage bucket private and encrypted
- [ ] Secrets stored in Secret Manager
- [ ] Service accounts created with correct IAM
- [ ] Cloud Run services deployed (API, Agency, Customer)
- [ ] Load balancer routing configured
- [ ] Domain DNS records updated
- [ ] TLS certificates active
- [ ] Backup automation enabled
- [ ] Monitoring/logging configured
- [ ] CI/CD pipeline functional
- [ ] Staging smoke tests PASS
- [ ] All evidence collected (terraform plan, resource listings, connectivity tests)

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| APIs + Registry | 10 min | ⏱️ |
| PostgreSQL | 15 min | ⏱️ |
| Redis | 10 min | ⏱️ |
| Storage + Secrets | 10 min | ⏱️ |
| IAM | 5 min | ⏱️ |
| Cloud Run (3 services) | 20 min | ⏱️ |
| Load Balancer + Domain | 15 min | ⏱️ |
| Backup + Observability | 10 min | ⏱️ |
| CI/CD + Staging | 15 min | ⏱️ |
| Testing + Evidence | 15 min | ⏱️ |
| **TOTAL** | **~2.5 hours** | ✅ |

## Success Criteria

✅ Terraform apply completes with 0 errors  
✅ All evidence requirements met  
✅ Staging smoke tests PASS  
✅ v1.0.0-rc1 @ 0a762ee ready to deploy  
✅ → Ready for Phase 02: Production Deploy + Go-Live

## When Infrastructure is READY

1. Update `.env.production` with actual values (from terraform outputs)
2. Populate GitHub Actions secrets
3. Proceed to: **Phase 02: PRODUCTION_DEPLOY_AND_GO_LIVE.md**
