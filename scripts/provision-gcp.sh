#!/bin/bash

# Travel Platform GCP Provisioning Script
# Automates infrastructure deployment to Google Cloud Platform
#
# Usage: ./scripts/provision-gcp.sh <environment> <project-id> [region]
# Example: ./scripts/provision-gcp.sh prod my-travel-platform-prod us-central1

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-prod}"
PROJECT_ID="${2:-}"
REGION="${3:-us-central1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform"

# Validation
if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: PROJECT_ID is required${NC}"
  echo "Usage: $0 <environment> <project-id> [region]"
  exit 1
fi

if [ "$ENVIRONMENT" != "prod" ] && [ "$ENVIRONMENT" != "staging" ]; then
  echo -e "${RED}Error: ENVIRONMENT must be 'prod' or 'staging'${NC}"
  exit 1
fi

echo -e "${GREEN}=== Travel Platform GCP Provisioning ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Step 1: Verify gcloud authentication
echo -e "${YELLOW}[Step 1] Verifying gcloud authentication...${NC}"
if ! gcloud auth list 2>&1 | grep -q "ACTIVE"; then
  echo -e "${RED}Error: Not authenticated with gcloud${NC}"
  echo "Run: gcloud auth login"
  exit 1
fi
gcloud config set project $PROJECT_ID
echo -e "${GREEN}✓ Authenticated with gcloud${NC}"

# Step 2: Enable APIs
echo -e "${YELLOW}[Step 2] Enabling required GCP APIs...${NC}"
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
echo -e "${GREEN}✓ APIs enabled${NC}"

# Step 3: Create Terraform state bucket
echo -e "${YELLOW}[Step 3] Setting up Terraform state bucket...${NC}"
STATE_BUCKET="${PROJECT_ID}-terraform-state"
if ! gsutil ls -b "gs://$STATE_BUCKET" &>/dev/null; then
  gsutil mb -p $PROJECT_ID "gs://$STATE_BUCKET"
  gsutil versioning set on "gs://$STATE_BUCKET"
  echo -e "${GREEN}✓ State bucket created: gs://$STATE_BUCKET${NC}"
else
  echo -e "${GREEN}✓ State bucket already exists: gs://$STATE_BUCKET${NC}"
fi

# Step 4: Generate secrets if not already set
echo -e "${YELLOW}[Step 4] Generating secrets...${NC}"
if [ -z "$TF_VAR_jwt_secret" ]; then
  export TF_VAR_jwt_secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "Generated JWT_SECRET"
fi

if [ -z "$TF_VAR_mfa_encryption_key" ]; then
  export TF_VAR_mfa_encryption_key=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "Generated MFA_ENCRYPTION_KEY"
fi

if [ -z "$TF_VAR_db_password_runtime" ]; then
  export TF_VAR_db_password_runtime=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
  echo "Generated DB_PASSWORD_RUNTIME"
fi

if [ -z "$TF_VAR_db_password_migrations" ]; then
  export TF_VAR_db_password_migrations=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
  echo "Generated DB_PASSWORD_MIGRATIONS"
fi

if [ -z "$TF_VAR_redis_password" ]; then
  export TF_VAR_redis_password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
  echo "Generated REDIS_PASSWORD"
fi
echo -e "${GREEN}✓ Secrets generated${NC}"

# Step 5: Initialize Terraform
echo -e "${YELLOW}[Step 5] Initializing Terraform...${NC}"
cd $TERRAFORM_DIR
terraform init -upgrade
echo -e "${GREEN}✓ Terraform initialized${NC}"

# Step 6: Format and validate Terraform
echo -e "${YELLOW}[Step 6] Validating Terraform configuration...${NC}"
terraform fmt -recursive .
terraform validate
echo -e "${GREEN}✓ Terraform configuration valid${NC}"

# Step 7: Plan Terraform deployment
echo -e "${YELLOW}[Step 7] Planning Terraform deployment...${NC}"
TFVARS_FILE="terraform.${ENVIRONMENT}.tfvars"
terraform plan \
  -var-file=$TFVARS_FILE \
  -var="gcp_project_id=$PROJECT_ID" \
  -var="gcp_region=$REGION" \
  -out=tfplan.$ENVIRONMENT
echo -e "${GREEN}✓ Terraform plan complete${NC}"

# Step 8: Apply Terraform
echo -e "${YELLOW}[Step 8] Applying Terraform configuration...${NC}"
read -p "Do you want to apply this plan? (yes/no): " -r REPLY
if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  terraform apply tfplan.$ENVIRONMENT
  echo -e "${GREEN}✓ Infrastructure deployed${NC}"
else
  echo -e "${YELLOW}Deployment cancelled${NC}"
  exit 1
fi

# Step 9: Export outputs
echo -e "${YELLOW}[Step 9] Exporting outputs...${NC}"
terraform output -json > outputs.$ENVIRONMENT.json
echo -e "${GREEN}✓ Outputs exported to outputs.$ENVIRONMENT.json${NC}"

# Step 10: Display summary
echo -e "${YELLOW}[Step 10] Deployment Summary${NC}"
echo ""
echo -e "${GREEN}URLs:${NC}"
echo "API: $(terraform output -raw api_service_url 2>/dev/null || echo 'N/A')"
echo "Agency Portal: $(terraform output -raw agency_service_url 2>/dev/null || echo 'N/A')"
echo "Customer Portal: $(terraform output -raw customer_service_url 2>/dev/null || echo 'N/A')"
echo ""
echo -e "${GREEN}Database:${NC}"
echo "Instance: $(terraform output -raw database_instance_name 2>/dev/null || echo 'N/A')"
echo "Private IP: $(terraform output -raw database_private_ip 2>/dev/null || echo 'N/A')"
echo ""
echo -e "${GREEN}Redis:${NC}"
echo "Host: $(terraform output -raw redis_host 2>/dev/null || echo 'N/A')"
echo "Port: $(terraform output -raw redis_port 2>/dev/null || echo 'N/A')"
echo ""
echo -e "${GREEN}Storage:${NC}"
echo "Prod Bucket: $(terraform output -raw documents_bucket_name 2>/dev/null || echo 'N/A')"
echo "Staging Bucket: $(terraform output -raw documents_bucket_staging_name 2>/dev/null || echo 'N/A')"
echo ""
echo -e "${GREEN}✓ Infrastructure provisioning complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Build and push container images: scripts/build-images.sh"
echo "2. Run database migrations: npm run db:migrate"
echo "3. Test connectivity: scripts/test-connectivity.sh"
echo "4. Configure domains (if using custom domains)"
echo "5. Run smoke tests: npm run test:smoke"
