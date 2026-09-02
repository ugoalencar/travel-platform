# GCP Infrastructure Provisioning Guide

## Overview

This guide walks through provisioning complete production and staging infrastructure for the Travel Platform on Google Cloud Platform using Infrastructure-as-Code (Terraform).

**Timeline:** 2-4 hours  
**Stack:** Cloud Run, Cloud SQL PostgreSQL 15, Memorystore Redis, Cloud Storage, Secret Manager, Artifact Registry, Cloud Build, Cloud Monitoring

---

## Prerequisites

### Required Tools
- `gcloud` CLI (installed and authenticated)
- `terraform` >= 1.5
- `docker` (for building container images)
- `kubectl` (optional, for advanced debugging)
- `psql` (for testing database connectivity)
- `redis-cli` (for testing Redis connectivity)

### Required Permissions
- GCP Project owner or editor role
- Billing account configured
- Service account creation permissions

### Environment Setup

```bash
# Verify gcloud authentication
gcloud auth list

# Set your GCP project
export GCP_PROJECT_ID="your-project-id"
gcloud config set project $GCP_PROJECT_ID

# Verify project
gcloud projects describe $GCP_PROJECT_ID
```

---

## Phase 1: GCP Project & APIs Setup

### Step 1.1: Create or Select GCP Project

```bash
# Option A: Use existing project
gcloud projects describe $GCP_PROJECT_ID

# Option B: Create new project (if needed)
gcloud projects create travel-platform-prod \
  --name="Travel Platform Production" \
  --enable-cloud-apis
```

### Step 1.2: Enable Required APIs

```bash
export PROJECT_ID=$GCP_PROJECT_ID

gcloud services enable \
  compute.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  serviceusage.googleapis.com \
  --project=$PROJECT_ID
```

### Step 1.3: Create Terraform State Bucket

```bash
# Create GCS bucket for Terraform state
gsutil mb -p $PROJECT_ID gs://${PROJECT_ID}-terraform-state

# Enable versioning
gsutil versioning set on gs://${PROJECT_ID}-terraform-state

# Block public access
gsutil iam ch projectEditor:$PROJECT_ID:objectAdmin gs://${PROJECT_ID}-terraform-state
```

---

## Phase 2: Generate Secrets

### Step 2.1: Generate Required Secrets

```bash
# JWT Secret (32 bytes, hex encoded)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export TF_VAR_jwt_secret=$JWT_SECRET
echo "JWT_SECRET=$JWT_SECRET" >> /tmp/secrets.env

# MFA Encryption Key (32 bytes, hex encoded)
MFA_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export TF_VAR_mfa_encryption_key=$MFA_KEY
echo "MFA_ENCRYPTION_KEY=$MFA_KEY" >> /tmp/secrets.env

# Database Passwords (32 characters, alphanumeric)
DB_RUNTIME_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
export TF_VAR_db_password_runtime=$DB_RUNTIME_PASS
echo "DB_PASSWORD_RUNTIME=$DB_RUNTIME_PASS" >> /tmp/secrets.env

DB_MIGRATIONS_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
export TF_VAR_db_password_migrations=$DB_MIGRATIONS_PASS
echo "DB_PASSWORD_MIGRATIONS=$DB_MIGRATIONS_PASS" >> /tmp/secrets.env

# Redis Password (32 characters, alphanumeric)
REDIS_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
export TF_VAR_redis_password=$REDIS_PASS
echo "REDIS_PASSWORD=$REDIS_PASS" >> /tmp/secrets.env

# Save secrets securely (DO NOT COMMIT)
echo "Secrets saved to /tmp/secrets.env"
cat /tmp/secrets.env
```

### Step 2.2: Verify Secrets

```bash
test -n "$TF_VAR_jwt_secret" && echo "JWT_SECRET is set"
test -n "$TF_VAR_mfa_encryption_key" && echo "MFA_ENCRYPTION_KEY is set"
test -n "$TF_VAR_db_password_runtime" && echo "DB_PASSWORD_RUNTIME is set"
test -n "$TF_VAR_db_password_migrations" && echo "DB_PASSWORD_MIGRATIONS is set"
test -n "$TF_VAR_redis_password" && echo "REDIS_PASSWORD is set"
```

---

## Phase 3: Build & Push Container Images

### Step 3.1: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create travel_platform_registry \
  --repository-format=docker \
  --location=us-central1 \
  --description="Travel Platform Docker Registry" \
  --project=$PROJECT_ID
```

### Step 3.2: Configure Docker Authentication

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### Step 3.3: Build Container Images

From the project root directory:

```bash
# Build API image
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/travel_platform_registry/api:v1.0.0-rc1 \
  -f services/api/Dockerfile \
  --build-arg NODE_ENV=production \
  .

# Build Agency portal image
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/travel_platform_registry/agency:v1.0.0-rc1 \
  -f apps/agency/Dockerfile \
  --build-arg NODE_ENV=production \
  .

# Build Customer portal image
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/travel_platform_registry/customer:v1.0.0-rc1 \
  -f apps/customer/Dockerfile \
  --build-arg NODE_ENV=production \
  .
```

### Step 3.4: Push Images to Artifact Registry

```bash
docker push us-central1-docker.pkg.dev/$PROJECT_ID/travel_platform_registry/api:v1.0.0-rc1
docker push us-central1-docker.pkg.dev/$PROJECT_ID/travel_platform_registry/agency:v1.0.0-rc1
docker push us-central1-docker.pkg.dev/$PROJECT_ID/travel_platform_registry/customer:v1.0.0-rc1

# Verify images
gcloud artifacts docker images list us-central1-docker.pkg.dev/$PROJECT_ID/travel_platform_registry
```

---

## Phase 4: Deploy Infrastructure with Terraform

### Step 4.1: Initialize Terraform

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Verify initialization
terraform version
```

### Step 4.2: Validate Configuration

```bash
# Format Terraform files
terraform fmt -recursive .

# Validate configuration
terraform validate

# Plan infrastructure (production)
terraform plan -var-file=terraform.prod.tfvars \
  -var="gcp_project_id=$PROJECT_ID" \
  -out=tfplan.prod
```

### Step 4.3: Review Plan Output

```bash
# Display plan (review all changes)
terraform show tfplan.prod | head -100
```

### Step 4.4: Apply Terraform Configuration

```bash
# Apply infrastructure
terraform apply tfplan.prod

# Capture outputs
terraform output -json > outputs.prod.json
```

---

## Phase 5: Database Setup

### Step 5.1: Get Database Connection Details

```bash
# Extract database details from Terraform outputs
INSTANCE_NAME=$(terraform output -raw database_instance_name)
PRIVATE_IP=$(terraform output -raw database_private_ip)
CONNECTION_NAME=$(terraform output -raw database_connection_name)

echo "Instance Name: $INSTANCE_NAME"
echo "Private IP: $PRIVATE_IP"
echo "Connection Name: $CONNECTION_NAME"
```

### Step 5.2: Run Database Migrations

```bash
# Set environment variables
export DATABASE_URL="postgresql://travel_app_runtime:${TF_VAR_db_password_runtime}@${PRIVATE_IP}:5432/travel_platform_prod"
export DATABASE_MIGRATION_URL="postgresql://travel_migrations:${TF_VAR_db_password_migrations}@${PRIVATE_IP}:5432/travel_platform_prod"

# Run migrations validation
npm run migrations:validate

# Run migrations
npm run db:migrate

# Verify migrations
psql $DATABASE_URL -c "SELECT version(); SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema');"
```

### Step 5.3: Test Database Connectivity

```bash
# Install Cloud SQL Proxy (if needed)
curl -o cloud-sql-proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64
chmod +x cloud-sql-proxy

# Start Cloud SQL Proxy
./cloud-sql-proxy $CONNECTION_NAME &

# Test connection
psql -h 127.0.0.1 -U travel_app_runtime -d travel_platform_prod -c "SELECT NOW();"
```

---

## Phase 6: Redis Verification

### Step 6.1: Get Redis Details

```bash
# Extract Redis details
REDIS_HOST=$(terraform output -raw redis_host)
REDIS_PORT=$(terraform output -raw redis_port)

echo "Redis Host: $REDIS_HOST"
echo "Redis Port: $REDIS_PORT"
```

### Step 6.2: Test Redis Connectivity

```bash
# Install redis-cli (if needed)
# Ubuntu/Debian:
# sudo apt-get install redis-tools
#
# macOS:
# brew install redis

# Test connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $TF_VAR_redis_password ping

# Verify Redis is accepting connections
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $TF_VAR_redis_password INFO server
```

---

## Phase 7: Cloud Run Deployment Verification

### Step 7.1: Get Cloud Run URLs

```bash
# Extract URLs
API_URL=$(terraform output -raw api_service_url)
AGENCY_URL=$(terraform output -raw agency_service_url)
CUSTOMER_URL=$(terraform output -raw customer_service_url)

echo "API URL: $API_URL"
echo "Agency Portal URL: $AGENCY_URL"
echo "Customer Portal URL: $CUSTOMER_URL"
```

### Step 7.2: Test API Health Endpoint

```bash
# Test API health check
curl -I $API_URL/health

# Test with authentication
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" $API_URL/health
```

### Step 7.3: Load Services in Browser

```bash
# Open URLs in browser
echo "API: $API_URL"
echo "Agency Portal: $AGENCY_URL"
echo "Customer Portal: $CUSTOMER_URL"

# Test agency portal
curl -I $AGENCY_URL/health

# Test customer portal
curl -I $CUSTOMER_URL/health
```

---

## Phase 8: Storage Verification

### Step 8.1: Verify Bucket Privacy

```bash
# Get bucket names
PROD_BUCKET=$(terraform output -raw documents_bucket_name)
STAGING_BUCKET=$(terraform output -raw documents_bucket_staging_name)

echo "Production Bucket: $PROD_BUCKET"
echo "Staging Bucket: $STAGING_BUCKET"

# Verify no public access
gsutil iam get gs://$PROD_BUCKET | grep -i "allusers" || echo "✓ No public access"
gsutil iam get gs://$STAGING_BUCKET | grep -i "allusers" || echo "✓ No public access"
```

### Step 8.2: Test Upload/Download with Signed URLs

```bash
# Create test file
echo "test data" > /tmp/test-document.txt

# Upload to staging bucket (test only)
gsutil cp /tmp/test-document.txt gs://$STAGING_BUCKET/test-document.txt

# Generate signed URL (1 hour expiry)
gsutil signurl -d 1h /tmp/gcp-key.json gs://$STAGING_BUCKET/test-document.txt

# Download and verify
gsutil cp gs://$STAGING_BUCKET/test-document.txt /tmp/test-document-download.txt
cat /tmp/test-document-download.txt

# Clean up
gsutil rm gs://$STAGING_BUCKET/test-document.txt
```

---

## Phase 9: Secrets Verification

### Step 9.1: List Secrets

```bash
# List all secrets
gcloud secrets list --filter="labels.app:travel-platform"
```

### Step 9.2: Verify Secret Values

```bash
# Test secret retrieval without printing values.
for name in travel-platform-database-url-prod travel-platform-redis-url-prod travel-platform-jwt-secret-prod; do
  gcloud secrets versions access latest --secret="$name" --project="$PROJECT_ID" >/dev/null
  echo "$name is readable"
done
```

---

## Phase 10: Domain & TLS Setup

### Step 10.1: Register Domains (Manual)

```
Required domains:
- api.travel-platform.com
- agencies.travel-platform.com
- travel.travel-platform.com

Note: Domain registration must be done manually at your domain registrar
(Namecheap, GoDaddy, Google Domains, etc.)
```

### Step 10.2: Create Cloud Load Balancer (Optional, for custom domains)

```bash
# This is a manual step if you want to use custom domains
# For now, Cloud Run provides URLs:
echo "API URL: $API_URL"
echo "Agency URL: $AGENCY_URL"
echo "Customer URL: $CUSTOMER_URL"

# Update DNS records in your domain registrar to point to Cloud Run URLs
# Or set up Cloud Load Balancer + Cloud Armor for DDoS protection
```

---

## Phase 11: Monitoring & Logging

### Step 11.1: Access Cloud Monitoring Dashboard

```bash
# Open in browser (requires GCP console access)
echo "https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"

# Or view via gcloud
gcloud monitoring dashboards list --project=$PROJECT_ID
```

### Step 11.2: Configure Alert Notifications

```bash
# Create notification channel (manual)
# https://console.cloud.google.com/monitoring/alerting/notifications?project=$PROJECT_ID

# Verify alerts are active
gcloud alpha monitoring policies list --project=$PROJECT_ID
```

### Step 11.3: View Logs

```bash
# Tail Cloud Run logs
gcloud logging read \
  "resource.type=cloud_run_revision AND severity=ERROR" \
  --limit 50 \
  --format json \
  --project=$PROJECT_ID

# View specific service logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=travel-platform-api-prod" \
  --limit 20 \
  --format json \
  --project=$PROJECT_ID
```

---

## Phase 12: Backup & Disaster Recovery Testing

### Step 12.1: Verify Backup Configuration

```bash
# Check Cloud SQL backup configuration
gcloud sql instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  | grep -A 5 "backupConfiguration"

# List existing backups
gcloud sql backups list --instance=$INSTANCE_NAME --project=$PROJECT_ID
```

### Step 12.2: Test Restore Procedure (Optional)

```bash
# Create test instance from backup (DO NOT run in production without planning)
# This is for documentation only - restore procedures vary by use case

# List available backups
BACKUP_ID=$(gcloud sql backups list --instance=$INSTANCE_NAME --project=$PROJECT_ID --limit=1 --format="value(name)")

echo "Latest backup ID: $BACKUP_ID"
echo "To restore, use: gcloud sql backups restore $BACKUP_ID --restore-instance=<target-instance>"
```

---

## Phase 13: Staging Environment Smoke Tests

### Step 13.1: Deploy Staging Infrastructure

```bash
# Plan staging infrastructure
terraform plan -var-file=terraform.staging.tfvars \
  -var="gcp_project_id=$PROJECT_ID" \
  -out=tfplan.staging

# Apply staging
terraform apply tfplan.staging

# Get staging URLs
STAGING_API_URL=$(terraform output -raw api_service_url 2>/dev/null || echo "staging-api-url")
STAGING_AGENCY_URL=$(terraform output -raw agency_service_url 2>/dev/null || echo "staging-agency-url")
STAGING_CUSTOMER_URL=$(terraform output -raw customer_service_url 2>/dev/null || echo "staging-customer-url")
```

### Step 13.2: Run Smoke Tests

```bash
# Test API health
curl -I $STAGING_API_URL/health || echo "API unreachable"

# Test Agency portal loads
curl -I $STAGING_AGENCY_URL/health || echo "Agency unreachable"

# Test Customer portal loads
curl -I $STAGING_CUSTOMER_URL/health || echo "Customer unreachable"

# Run integration tests (if available)
npm run test:smoke 2>/dev/null || echo "Smoke tests not available"
```

---

## Production Ready Checklist

- [ ] GCP project created and APIs enabled
- [ ] Terraform state bucket created
- [ ] Secrets generated and stored securely
- [ ] Container images built and pushed
- [ ] Terraform plan reviewed and validated
- [ ] Infrastructure deployed successfully
- [ ] Database migrations completed
- [ ] Database connectivity verified (psql works)
- [ ] Redis connectivity verified (redis-cli works)
- [ ] Storage buckets created and secured
- [ ] Cloud Run services responding to health checks
- [ ] Secrets present in Secret Manager
- [ ] Monitoring dashboard active
- [ ] Logs flowing to Cloud Logging
- [ ] Backup automation configured and tested
- [ ] Staging environment deployed
- [ ] Smoke tests passing
- [ ] Domains registered (if using custom domains)
- [ ] DNS records configured (if using custom domains)

---

## Troubleshooting

### Database Connection Issues

```bash
# Check Cloud SQL instance is running
gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID | grep state

# Verify private IP connectivity from Cloud Run
gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID | grep -A 2 "ipAddresses"

# Check firewall rules
gcloud compute firewall-rules list --filter="name:travel-platform" --project=$PROJECT_ID
```

### Redis Connection Issues

```bash
# Check Redis instance status
gcloud redis instances describe travel-platform-redis-prod --region=us-central1 --project=$PROJECT_ID

# Verify network connectivity
gcloud redis instances describe travel-platform-redis-prod --region=us-central1 --project=$PROJECT_ID | grep -A 2 "host"
```

### Cloud Run Deployment Issues

```bash
# Check Cloud Run service logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=travel-platform-api-prod" \
  --limit 50 \
  --format text \
  --project=$PROJECT_ID

# Check service status
gcloud run services describe travel-platform-api-prod --region=us-central1 --project=$PROJECT_ID
```

---

## Cleanup (If Needed)

```bash
# CAUTION: This will delete all infrastructure

# Destroy infrastructure
terraform destroy -var-file=terraform.prod.tfvars \
  -var="gcp_project_id=$PROJECT_ID"

# Delete Terraform state bucket
gsutil rm -r gs://${PROJECT_ID}-terraform-state

# Delete Artifact Registry
gcloud artifacts repositories delete travel_platform_registry \
  --location=us-central1 \
  --project=$PROJECT_ID
```

---

## Support & Documentation

- [GCP Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Memorystore Redis Documentation](https://cloud.google.com/memorystore/docs/redis)
- [Terraform Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)

---

Last Updated: 2026-08-30  
Author: Claude Code  
Version: 1.0.0-rc1
