# GCP Infrastructure Deployment Checklist

Complete checklist for provisioning Travel Platform on Google Cloud Platform.

## Pre-Deployment (Day 1)

### GCP Project Setup
- [ ] GCP Project created or selected
  - Project ID: `_______________________`
  - Project Number: `_______________________`
- [ ] Billing account configured and linked
- [ ] `gcloud` authenticated with `gcloud auth login`
- [ ] Project set as default: `gcloud config set project PROJECT_ID`

### Required APIs Enabled
- [ ] `compute.googleapis.com`
- [ ] `sqladmin.googleapis.com`
- [ ] `redis.googleapis.com`
- [ ] `storage.googleapis.com`
- [ ] `secretmanager.googleapis.com`
- [ ] `run.googleapis.com`
- [ ] `artifactregistry.googleapis.com`
- [ ] `cloudbuild.googleapis.com`
- [ ] `monitoring.googleapis.com`
- [ ] `logging.googleapis.com`
- [ ] `cloudresourcemanager.googleapis.com`
- [ ] `iam.googleapis.com`
- [ ] `serviceusage.googleapis.com`

### Terraform Setup
- [ ] Terraform state bucket created: `gs://{PROJECT_ID}-terraform-state`
- [ ] Terraform initialized: `terraform init`
- [ ] Terraform configuration validated: `terraform validate`
- [ ] Terraform formatted: `terraform fmt -recursive .`

### Secrets Generated
- [ ] JWT Secret generated (32 bytes hex)
  - `TF_VAR_jwt_secret=_______________________`
- [ ] MFA Encryption Key generated (32 bytes hex)
  - `TF_VAR_mfa_encryption_key=_______________________`
- [ ] Database Runtime Password generated
  - `TF_VAR_db_password_runtime=_______________________`
- [ ] Database Migration Password generated
  - `TF_VAR_db_password_migrations=_______________________`
- [ ] Redis Password generated
  - `TF_VAR_redis_password=_______________________`
- [ ] Secrets saved securely (not in version control)

---

## Infrastructure Deployment (Day 2)

### Terraform Planning
- [ ] Terraform plan created: `terraform plan -var-file=terraform.prod.tfvars -out=tfplan.prod`
- [ ] Plan reviewed for all resources
- [ ] No destructive changes in plan
- [ ] All module dependencies correct

### Infrastructure Provisioning
- [ ] Terraform applied: `terraform apply tfplan.prod`
- [ ] All resources created successfully
- [ ] No terraform errors or warnings
- [ ] Outputs captured: `terraform output -json > outputs.prod.json`

### Artifact Registry Setup
- [ ] Artifact Registry repository created
- [ ] Docker authentication configured: `gcloud auth configure-docker us-central1-docker.pkg.dev`
- [ ] Repository accessible from local Docker daemon

### Container Images Built
- [ ] API image built and pushed
  - Image: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel_platform_registry/api:v1.0.0-rc1`
  - Pushed: `docker push`
- [ ] Agency portal image built and pushed
  - Image: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel_platform_registry/agency:v1.0.0-rc1`
  - Pushed: `docker push`
- [ ] Customer portal image built and pushed
  - Image: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel_platform_registry/customer:v1.0.0-rc1`
  - Pushed: `docker push`
- [ ] Images verified in Artifact Registry: `gcloud artifacts docker images list`

### VPC & Networking
- [ ] VPC network created: `travel-platform-prod-vpc`
- [ ] Subnet created: `travel-platform-prod-subnet`
- [ ] Cloud NAT configured for outbound access
- [ ] Firewall rules created
  - [ ] Internal communication allowed (10.0.0.0/24)
  - [ ] Health checks allowed (35.191.0.0/16, 130.211.0.0/22)
  - [ ] No public ingress (private IP only)
- [ ] Private VPC peering configured for Cloud SQL and Redis

---

## Database Deployment (Day 3)

### Cloud SQL Instance
- [ ] Cloud SQL instance created: `travel-platform-db-prod`
- [ ] Instance status: RUNNING
- [ ] Database tier verified: `db-custom-2-8192`
- [ ] PostgreSQL version: 15
- [ ] High availability enabled
- [ ] Private IP configured (no public IP)
- [ ] SSL required
- [ ] Automated backups enabled (daily, 30-day retention)

### Database Users
- [ ] Runtime user created: `travel_app_runtime`
  - Password stored in Secret Manager
- [ ] Migrations user created: `travel_migrations`
  - Password stored in Secret Manager

### Database & Schema
- [ ] Database created: `travel_platform_prod`
- [ ] Migrations validated: `npm run migrations:validate`
- [ ] Migrations applied: `npm run db:migrate`
- [ ] Schema verified:
  ```bash
  psql $DATABASE_URL -c "\dt" | wc -l  # Should show all tables
  ```

### Database Connectivity
- [ ] psql connection tested:
  ```bash
  psql -h {PRIVATE_IP} -U travel_app_runtime -d travel_platform_prod -c "SELECT version();"
  ```
  - Result: `PostgreSQL 15.x...`
- [ ] Cloud SQL Proxy configured (if needed)
- [ ] Query performance baseline established

### Backup Testing
- [ ] Manual backup created: `gcloud sql backups create --instance=travel-platform-db-prod`
- [ ] Backup appears in backups list
- [ ] Backup size recorded: `_______________________`
- [ ] Restore procedure documented and tested

---

## Redis Deployment (Day 3)

### Memorystore Instance
- [ ] Redis instance created: `travel-platform-redis-prod`
- [ ] Instance status: READY
- [ ] Memory size: 5GB
- [ ] Redis version: 7.0
- [ ] Auth enabled
- [ ] RDB persistence enabled
- [ ] Backup snapshot period: HOURLY (production)
- [ ] Private IP configured (no public access)

### Redis Connectivity
- [ ] redis-cli connection tested:
  ```bash
  redis-cli -h {REDIS_HOST} -a {REDIS_PASSWORD} ping
  ```
  - Result: `PONG`
- [ ] Connection string stored in Secret Manager
- [ ] Memory usage baseline: `_______________________`

### Redis Verification
- [ ] Command: `redis-cli -h {HOST} INFO stats | grep instantaneous_ops_per_sec`
- [ ] Response indicates connectivity

---

## Storage Deployment (Day 3)

### Cloud Storage Buckets
- [ ] Production bucket created: `travel-platform-documents-prod`
  - [ ] Uniform bucket-level access enabled
  - [ ] Public access blocked
  - [ ] Encryption enabled
  - [ ] Versioning enabled
  - [ ] Lifecycle policy set (90-day retention)
  - [ ] Verified no public ACLs

- [ ] Staging bucket created: `travel-platform-documents-staging`
  - [ ] Uniform bucket-level access enabled
  - [ ] Public access blocked
  - [ ] Encryption enabled
  - [ ] Versioning disabled
  - [ ] Lifecycle policy set (30-day retention)
  - [ ] Verified no public ACLs

### Storage Testing
- [ ] Test upload: `gsutil cp test.txt gs://travel-platform-documents-staging/`
- [ ] Test signed URL generation (1-hour expiry)
- [ ] Test download via signed URL
- [ ] Cleanup test files

---

## Cloud Run Deployment (Day 4)

### API Service
- [ ] Service created: `travel-platform-api-prod`
- [ ] Service URL: `_______________________`
- [ ] Image: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel_platform_registry/api:v1.0.0-rc1`
- [ ] CPU: 2, Memory: 2Gi, Timeout: 60s
- [ ] Min instances: 1, Max instances: 10
- [ ] Service account: `travel-platform-api-prod@...`
- [ ] Environment variables set from Secret Manager
- [ ] Health check endpoint: `/health`
- [ ] Status: RUNNING

### Agency Portal Service
- [ ] Service created: `travel-platform-agency-prod`
- [ ] Service URL: `_______________________`
- [ ] Image: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel_platform_registry/agency:v1.0.0-rc1`
- [ ] CPU: 2, Memory: 2Gi, Timeout: 60s
- [ ] Min instances: 1, Max instances: 10
- [ ] Service account: `travel-platform-api-prod@...`
- [ ] Environment variables set
- [ ] Health check endpoint: `/health`
- [ ] Status: RUNNING

### Customer Portal Service
- [ ] Service created: `travel-platform-customer-prod`
- [ ] Service URL: `_______________________`
- [ ] Image: `us-central1-docker.pkg.dev/{PROJECT_ID}/travel_platform_registry/customer:v1.0.0-rc1`
- [ ] CPU: 2, Memory: 2Gi, Timeout: 60s
- [ ] Min instances: 1, Max instances: 10
- [ ] Service account: `travel-platform-api-prod@...`
- [ ] Environment variables set
- [ ] Health check endpoint: `/health`
- [ ] Status: RUNNING

### Service Verification
- [ ] API health check: `curl {API_URL}/health`
  - Expected: `200 OK`
- [ ] Agency health check: `curl {AGENCY_URL}/health`
  - Expected: `200 OK`
- [ ] Customer health check: `curl {CUSTOMER_URL}/health`
  - Expected: `200 OK`
- [ ] Services responding to requests
- [ ] Response latency acceptable (< 1s)

---

## Secret Manager (Day 4)

### Secrets Stored
- [ ] `travel-platform-database-url-prod` - Database connection string
- [ ] `travel-platform-database-migration-url-prod` - Migration connection string
- [ ] `travel-platform-redis-url-prod` - Redis connection string
- [ ] `travel-platform-jwt-secret-prod` - JWT secret
- [ ] `travel-platform-mfa-encryption-key-prod` - MFA encryption key
- [ ] `travel-platform-document-storage-url-prod` - Storage bucket URL

### Secret Access Verified
- [ ] Cloud Run services can access secrets
- [ ] Test secret retrieval (masked output)
- [ ] No secrets exposed in logs

---

## IAM & Security (Day 4)

### Service Accounts Created
- [ ] `travel-platform-api-prod@{PROJECT}.iam.gserviceaccount.com`
  - Roles:
    - [ ] `roles/secretmanager.secretAccessor`
    - [ ] `roles/cloudsql.client`
    - [ ] `roles/storage.objectAdmin`
    - [ ] `roles/redis.client`
    - [ ] `roles/logging.logWriter`
    - [ ] `roles/monitoring.metricWriter`

- [ ] `travel-platform-ci-prod@{PROJECT}.iam.gserviceaccount.com`
  - Roles:
    - [ ] `roles/artifactregistry.writer`
    - [ ] `roles/cloudbuild.builds.editor`
    - [ ] `roles/run.deployer`
    - [ ] `roles/iam.serviceAccountUser`
    - [ ] `roles/cloudsql.client`
    - [ ] `roles/secretmanager.secretAccessor`

### Access Verified
- [ ] Service accounts can assume their roles
- [ ] CI/CD service account can push images
- [ ] API service account can access database and Redis
- [ ] No over-privileged permissions

---

## Monitoring & Logging (Day 5)

### Cloud Monitoring
- [ ] Dashboard created: `Travel Platform prod Dashboard`
- [ ] Panels configured:
  - [ ] API Error Rate
  - [ ] API Latency (p99)
  - [ ] Database Connections
  - [ ] Redis Memory Usage
- [ ] Dashboard accessible from Cloud Console

### Alert Policies
- [ ] Error rate alert (> 5%)
- [ ] Latency alert (p99 > 1s)
- [ ] Database connectivity alert
- [ ] Redis connectivity alert
- [ ] Notification channels configured (email/Slack)
  - [ ] Email: `_______________________`
  - [ ] Slack: `_______________________`

### Logging
- [ ] Cloud Logging enabled for all services
- [ ] Log router configured
- [ ] Audit trail sink created
- [ ] Logs visible in Cloud Logging dashboard
- [ ] Error logs properly formatted (JSON)

### Uptime Checks
- [ ] Uptime check configured for API `/health` endpoint
- [ ] Region: USA
- [ ] Check frequency: 60s
- [ ] Alert on failure

---

## Staging Environment (Day 5)

### Staging Infrastructure
- [ ] Staging Terraform applied: `terraform apply tfplan.staging`
- [ ] Staging Cloud SQL instance created
- [ ] Staging Redis instance created
- [ ] Staging storage buckets created

### Staging URLs
- [ ] API Staging URL: `_______________________`
- [ ] Agency Staging URL: `_______________________`
- [ ] Customer Staging URL: `_______________________`

### Staging Verification
- [ ] Database migrations completed on staging
- [ ] All health checks passing on staging
- [ ] Staging services connected to staging database and Redis

---

## Smoke Tests (Day 6)

### Service Health
- [ ] API responds to health check: `curl https://{API_URL}/health`
- [ ] Agency responds to health check: `curl https://{AGENCY_URL}/health`
- [ ] Customer responds to health check: `curl https://{CUSTOMER_URL}/health`

### Database Operations
- [ ] Database connection successful
- [ ] Query execution successful (< 500ms)
- [ ] Transactions working correctly
- [ ] RLS policies enforced

### Redis Operations
- [ ] Redis ping successful
- [ ] Key-value operations working
- [ ] Expiration working
- [ ] Persistence verified

### Storage Operations
- [ ] File upload to bucket successful
- [ ] Signed URL generation working
- [ ] File download via signed URL successful
- [ ] Access control working (no public reads)

### API Integration Tests
- [ ] Login endpoint working
- [ ] Agency endpoints accessible
- [ ] Customer endpoints accessible
- [ ] Data retrieval working
- [ ] Authentication enforced

### End-to-End Tests
- [ ] Agency can login
- [ ] Agency can view dashboard
- [ ] Customer can login
- [ ] Customer can browse trips
- [ ] Create offer workflow functional
- [ ] Payment flow (if applicable) working

---

## Domain & DNS Setup (Day 7, If Using Custom Domains)

### Domain Registration
- [ ] Domain registered: `travel-platform.com`
  - Registrar: `_______________________`
  - Renewal date: `_______________________`

### DNS Configuration
- [ ] API subdomain A record configured
  - Subdomain: `api.travel-platform.com`
  - Points to: Cloud Run IP or Load Balancer
- [ ] Agency subdomain A record configured
  - Subdomain: `agencies.travel-platform.com`
  - Points to: Cloud Run IP or Load Balancer
- [ ] Customer subdomain A record configured
  - Subdomain: `travel.travel-platform.com`
  - Points to: Cloud Run IP or Load Balancer
- [ ] DNS propagation verified (wait 24-48 hours)

### TLS Certificates
- [ ] Managed certificates created for all domains
- [ ] Certificates in PROVISIONING or ACTIVE status
- [ ] Certificate auto-renewal enabled

### HTTPS Verification
- [ ] `https://api.travel-platform.com/health` returns 200
- [ ] `https://agencies.travel-platform.com` loads
- [ ] `https://travel.travel-platform.com` loads
- [ ] SSL/TLS certificate valid and not expired

---

## Backup & Disaster Recovery (Day 7)

### Backup Configuration Verified
- [ ] Cloud SQL automated backups enabled
- [ ] Backup retention: 30 days
- [ ] Backup time: 03:00 UTC
- [ ] Transaction logs retained: 7 days
- [ ] Latest backup age: `_______________________`

### Backup Testing
- [ ] Manual backup created and verified
- [ ] Backup size: `_______________________`
- [ ] Restore procedure documented
- [ ] Test restore completed successfully
  - [ ] Test instance created
  - [ ] Data integrity verified
  - [ ] Test instance deleted

### Redis Persistence
- [ ] RDB snapshots enabled
- [ ] Snapshot frequency: HOURLY (production)
- [ ] Snapshot size: `_______________________`
- [ ] Persistence restoration tested

### Disaster Recovery Plan
- [ ] RTO (Recovery Time Objective): `_______________________`
- [ ] RPO (Recovery Point Objective): `_______________________`
- [ ] Runbook documented: `docs/operations/GCP_BACKUP_RESTORE.md`
- [ ] Team trained on restoration procedure

---

## Production Readiness (Day 8)

### Final Checklist
- [ ] All infrastructure deployed and tested
- [ ] All services responding to health checks
- [ ] Database migrations completed
- [ ] Secrets securely stored
- [ ] Monitoring and logging active
- [ ] Backup automation verified
- [ ] Staging environment operational
- [ ] Smoke tests passing
- [ ] Documentation complete
- [ ] Runbooks prepared
- [ ] Team trained and ready

### Performance Baseline
- [ ] API response time (p50): `_______________________` ms
- [ ] API response time (p99): `_______________________` ms
- [ ] Database query time (avg): `_______________________` ms
- [ ] Redis ping time: `_______________________` ms
- [ ] Cloud Run cold start time: `_______________________` s

### Resource Utilization
- [ ] Cloud Run CPU utilization: `_______________________`%
- [ ] Cloud Run memory utilization: `_______________________`%
- [ ] Database CPU utilization: `_______________________`%
- [ ] Database memory utilization: `_______________________`%
- [ ] Redis memory utilization: `_______________________`%

### Cost Estimate
- [ ] Monthly compute cost: `$_______________________`
- [ ] Monthly database cost: `$_______________________`
- [ ] Monthly cache cost: `$_______________________`
- [ ] Monthly storage cost: `$_______________________`
- [ ] **Total monthly estimate**: `$_______________________`

---

## Sign-Off

- [ ] Infrastructure lead approval: `_______________________` (Date: `_______`)
- [ ] Operations lead approval: `_______________________` (Date: `_______`)
- [ ] Security review completed: `_______________________` (Date: `_______`)
- [ ] Go-live authorized: `_______________________` (Date: `_______`)

---

## Post-Deployment

### Day 1 Monitoring
- [ ] Monitor error rates (target: < 1%)
- [ ] Monitor latency (target: < 500ms p99)
- [ ] Monitor database connections
- [ ] Monitor Redis memory usage
- [ ] Check all logs for errors
- [ ] Review CloudTrail audit logs

### Week 1 Review
- [ ] Performance metrics normal
- [ ] No unexpected errors
- [ ] Backup automation working
- [ ] Monitoring alerts working
- [ ] Team comfortable with procedures

### Month 1 Review
- [ ] Cost tracking vs. budget
- [ ] Performance trends stable
- [ ] Scaling working as expected
- [ ] Disaster recovery validated
- [ ] Documentation updated

---

## Notes & Issues Log

```
Date: _______
Issue: _________________________________________________________________
Status: Open / Resolved
Resolution: ______________________________________________________________

---

Date: _______
Issue: _________________________________________________________________
Status: Open / Resolved
Resolution: ______________________________________________________________
```

---

**Prepared by:** `_______________________`  
**Date:** `_______________________`  
**Status:** ✓ COMPLETE / ⚠ IN PROGRESS / ✗ BLOCKED

Last Updated: 2026-08-30
