# Travel Platform Infrastructure

Complete Infrastructure-as-Code setup for Travel Platform on Google Cloud Platform (GCP).

## Quick Start

```bash
# 1. Set your GCP project
export GCP_PROJECT_ID="your-project-id"
gcloud config set project $GCP_PROJECT_ID

# 2. Generate secrets
export TF_VAR_jwt_secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export TF_VAR_mfa_encryption_key=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export TF_VAR_db_password_runtime=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
export TF_VAR_db_password_migrations=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
export TF_VAR_redis_password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# 3. Run provisioning script
cd ../scripts
chmod +x provision-gcp.sh build-images.sh test-gcp-connectivity.sh
./provision-gcp.sh prod $GCP_PROJECT_ID us-central1
```

## Directory Structure

```
infrastructure/
├── terraform/                 # Terraform Infrastructure-as-Code
│   ├── main.tf              # Main orchestration
│   ├── variables.tf         # Variable definitions
│   ├── outputs.tf           # Output definitions
│   ├── providers.tf         # Provider configuration
│   ├── terraform.prod.tfvars    # Production variables
│   ├── terraform.staging.tfvars # Staging variables
│   └── modules/             # Reusable Terraform modules
│       ├── networking/      # VPC, subnets, firewalls
│       ├── iam/            # Service accounts, roles
│       ├── secrets/        # Secret Manager
│       ├── cloud-sql/      # PostgreSQL database
│       ├── redis/          # Redis cache
│       ├── storage/        # Cloud Storage buckets
│       ├── cloud-run/      # Cloud Run services
│       └── monitoring/     # Monitoring & logging
├── migrations/             # Database migration files
├── docker-compose.*.yml    # Local development compose files
└── README.md              # This file
```

## Components

### Core Services

1. **Cloud Run** - Serverless container deployment
   - API service
   - Agency portal
   - Customer portal

2. **Cloud SQL** - PostgreSQL 15 managed database
   - Production: 2 vCPU, 8GB RAM, HA-enabled
   - Staging: 2 vCPU, 8GB RAM
   - Automated daily backups (30-day retention)

3. **Memorystore Redis** - Redis cache
   - Production: 5GB, standard tier with RDB persistence
   - Staging: 2GB, standard tier
   - Private IP only

4. **Cloud Storage** - Private documents bucket
   - Production bucket with 90-day retention
   - Staging bucket with 30-day retention
   - Uniform bucket-level access enabled

5. **Secret Manager** - Credentials vault
   - Database passwords
   - Redis password
   - JWT secret
   - MFA encryption key

6. **Artifact Registry** - Container image registry
   - Private Docker repository
   - us-central1 location

7. **Cloud Monitoring** - Observability
   - Dashboards for API performance
   - Alert policies for errors and latency
   - Log sinks for audit trail

## Prerequisites

### Required Tools

- `terraform` >= 1.5 ([Install](https://developer.hashicorp.com/terraform/downloads))
- `gcloud` CLI ([Install](https://cloud.google.com/sdk/docs/install))
- `docker` ([Install](https://docs.docker.com/install/))
- `kubectl` (optional, for advanced debugging)
- `psql` (for database testing)
- `redis-cli` (for Redis testing)

### GCP Setup

- GCP Project (create one if you don't have it)
- Billing account linked to project
- Owner or Editor role on project
- Service account creation permissions

## Usage

### Phase 1: Initialize GCP Infrastructure

```bash
cd terraform

# Initialize Terraform
terraform init

# Validate configuration
terraform validate

# Format code
terraform fmt -recursive .
```

### Phase 2: Plan Deployment

```bash
# For production
terraform plan -var-file=terraform.prod.tfvars \
  -var="gcp_project_id=$GCP_PROJECT_ID" \
  -out=tfplan.prod

# For staging
terraform plan -var-file=terraform.staging.tfvars \
  -var="gcp_project_id=$GCP_PROJECT_ID" \
  -out=tfplan.staging
```

### Phase 3: Apply Configuration

```bash
# Apply production infrastructure
terraform apply tfplan.prod

# Or apply staging infrastructure
terraform apply tfplan.staging
```

### Phase 4: Get Outputs

```bash
# Display all outputs
terraform output

# Get specific output
terraform output api_service_url

# Export to JSON
terraform output -json > outputs.json
```

## Configuration

### Variables

All Terraform variables are defined in `variables.tf`. Key variables:

- `gcp_project_id` - GCP Project ID (required)
- `gcp_region` - GCP region (default: us-central1)
- `environment` - Environment name (prod or staging)
- `database_tier` - Cloud SQL machine type
- `redis_memory_size_gb` - Redis memory size
- `cloud_run_memory` - Cloud Run memory allocation
- `cloud_run_cpu` - Cloud Run CPU allocation

### Secrets Management

Sensitive values are stored in GCP Secret Manager:

```bash
# List all secrets
gcloud secrets list --filter="labels.app:travel-platform"

# Access secret value
gcloud secrets versions access latest --secret="travel-platform-database-url-prod"

# Rotate secret
gcloud secrets versions add travel-platform-database-url-prod \
  --data-file=- <<< "new_value"
```

## Deployment

### Automated Deployment Script

```bash
# Make scripts executable
chmod +x ../scripts/provision-gcp.sh
chmod +x ../scripts/build-images.sh
chmod +x ../scripts/test-gcp-connectivity.sh

# Run automated provisioning
../scripts/provision-gcp.sh prod $GCP_PROJECT_ID us-central1

# Build and push images
../scripts/build-images.sh $GCP_PROJECT_ID v1.0.0-rc1

# Test connectivity
../scripts/test-gcp-connectivity.sh prod
```

### Manual Deployment Steps

See [GCP_PROVISIONING_GUIDE.md](docs/operations/GCP_PROVISIONING_GUIDE.md) for detailed step-by-step instructions.

## Database

### Initial Setup

```bash
# Extract connection details
INSTANCE_NAME=$(terraform output -raw database_instance_name)
PRIVATE_IP=$(terraform output -raw database_private_ip)
CONNECTION_NAME=$(terraform output -raw database_connection_name)

# Run migrations
npm run migrations:validate
npm run db:migrate

# Verify database
psql postgresql://travel_app_runtime:PASSWORD@$PRIVATE_IP:5432/travel_platform_prod -c "SELECT version();"
```

### Backup & Restore

```bash
# Create manual backup
gcloud sql backups create \
  --instance=$INSTANCE_NAME

# List backups
gcloud sql backups list --instance=$INSTANCE_NAME

# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --restore-instance=INSTANCE_NAME
```

## Monitoring

### Dashboard

Access Cloud Monitoring dashboard:

```bash
gcloud monitoring dashboards list
# Then open in Cloud Console
```

### Logs

```bash
# View API service logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=travel-platform-api-prod" \
  --limit 50 \
  --format json

# View error logs only
gcloud logging read \
  "resource.type=cloud_run_revision AND severity=ERROR" \
  --limit 50
```

### Alerts

Alert policies are configured in the monitoring module:

- API error rate > 5%
- API latency p99 > 1s
- Database connectivity issues
- Redis connectivity issues

Configure notification channels in Cloud Console to receive alerts.

## Testing

### Connectivity Tests

```bash
# Test all resources
../scripts/test-gcp-connectivity.sh prod

# Test API
curl -I $(terraform output -raw api_service_url)/health

# Test database
psql $DATABASE_URL -c "SELECT NOW();"

# Test Redis
redis-cli -h $(terraform output -raw redis_host) ping
```

### Health Checks

```bash
# API health
curl $(terraform output -raw api_service_url)/health

# Database health
gcloud sql instances describe $INSTANCE_NAME --format="value(state)"

# Redis health
gcloud redis instances describe travel-platform-redis-prod --region=us-central1
```

## Troubleshooting

### Common Issues

#### Terraform State Lock

```bash
# If Terraform is locked, force unlock (use with caution)
terraform force-unlock LOCK_ID
```

#### Cloud SQL Connection Refused

```bash
# Check instance status
gcloud sql instances describe $INSTANCE_NAME --format="value(state)"

# Check private IP is enabled
gcloud sql instances describe $INSTANCE_NAME --format="value(settings.ipConfiguration)"

# Restart instance
gcloud sql instances restart $INSTANCE_NAME
```

#### Redis Connection Issues

```bash
# Check Redis instance status
gcloud redis instances describe travel-platform-redis-prod --region=us-central1

# Check network connectivity
gcloud compute ssh test-vm --zone=us-central1-a \
  -- nc -zv redis-host 6379
```

#### Cloud Run Deployment Failures

```bash
# Check service logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=travel-platform-api-prod" \
  --limit 20

# Check service status
gcloud run services describe travel-platform-api-prod --region=us-central1

# Redeploy service
terraform apply -var-file=terraform.prod.tfvars -target=module.cloud_run.google_cloud_run_service.api
```

## Scaling

### Cloud Run Scaling

Adjust in `terraform.prod.tfvars`:

```hcl
cloud_run_min_instances = 1
cloud_run_max_instances = 100

cloud_run_memory = "2Gi"
cloud_run_cpu = "2"
```

### Database Scaling

```bash
# Connect to Cloud Console and modify:
gcloud sql instances patch $INSTANCE_NAME \
  --tier=db-custom-4-16384  # 4 vCPU, 16GB RAM
```

### Redis Scaling

```bash
# Scale up memory
gcloud redis instances update travel-platform-redis-prod \
  --size-gb=10 \
  --region=us-central1
```

## Security

### Best Practices

1. **Secrets**: Never commit secrets to version control
2. **Firewall**: All resources use private IPs
3. **Authentication**: Cloud Run requires IAM authentication for production
4. **RBAC**: Service accounts have minimal required permissions
5. **Audit Logging**: All API calls logged to Cloud Logging
6. **Encryption**: Secrets encrypted in Secret Manager

### Access Control

```bash
# Grant access to infrastructure
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member=user:email@example.com \
  --role=roles/editor

# Create custom role for deployment
gcloud iam roles create travelPlatformDeployer \
  --project=$GCP_PROJECT_ID \
  --title="Travel Platform Deployer" \
  --description="Deploy Travel Platform infrastructure"
```

## Cleanup

### Destroy All Infrastructure

```bash
# CAUTION: This will delete ALL resources
terraform destroy -var-file=terraform.prod.tfvars
```

### Selective Cleanup

```bash
# Destroy only Cloud Run services
terraform destroy -var-file=terraform.prod.tfvars \
  -target=module.cloud_run

# Destroy only monitoring
terraform destroy -var-file=terraform.prod.tfvars \
  -target=module.monitoring
```

## Documentation

- [GCP Provisioning Guide](../docs/operations/GCP_PROVISIONING_GUIDE.md) - Step-by-step deployment guide
- [Terraform Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Memorystore Redis Documentation](https://cloud.google.com/memorystore/docs/redis)

## Support

For issues or questions:

1. Check [GCP_PROVISIONING_GUIDE.md](../docs/operations/GCP_PROVISIONING_GUIDE.md) troubleshooting section
2. Review Terraform logs: `TF_LOG=debug terraform apply`
3. Check GCP Cloud Logging for service errors
4. Open an issue with error logs and Terraform state snapshot

## Versioning

- **Terraform Version**: >= 1.5
- **Google Provider**: ~> 6.0
- **Kubernetes Version**: Not applicable (Cloud Run is serverless)

## License

Same as Travel Platform project

## Last Updated

2026-08-30

---

**Maintained by:** Claude Code  
**Status:** Production Ready (v1.0.0-rc1)
