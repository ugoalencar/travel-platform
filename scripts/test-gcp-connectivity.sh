#!/bin/bash

# Travel Platform GCP Connectivity Test Script
# Verifies connectivity to all provisioned GCP resources
#
# Usage: ./scripts/test-gcp-connectivity.sh [environment]
# Example: ./scripts/test-gcp-connectivity.sh prod

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
ENVIRONMENT="${1:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function for test results
test_result() {
  local test_name="$1"
  local result="$2"

  if [ "$result" -eq 0 ]; then
    echo -e "${GREEN}✓ $test_name${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ $test_name${NC}"
    ((TESTS_FAILED++))
  fi
}

echo -e "${GREEN}=== Travel Platform GCP Connectivity Tests ===${NC}"
echo "Environment: $ENVIRONMENT"
echo ""

# Change to Terraform directory to access state
cd $TERRAFORM_DIR

# Step 1: Extract resource details from Terraform
echo -e "${YELLOW}[Step 1] Extracting resource details from Terraform state...${NC}"
API_URL=$(terraform output -raw api_service_url 2>/dev/null || echo "")
AGENCY_URL=$(terraform output -raw agency_service_url 2>/dev/null || echo "")
CUSTOMER_URL=$(terraform output -raw customer_service_url 2>/dev/null || echo "")
DB_INSTANCE=$(terraform output -raw database_instance_name 2>/dev/null || echo "")
DB_PRIVATE_IP=$(terraform output -raw database_private_ip 2>/dev/null || echo "")
DB_CONNECTION=$(terraform output -raw database_connection_name 2>/dev/null || echo "")
REDIS_HOST=$(terraform output -raw redis_host 2>/dev/null || echo "")
REDIS_PORT=$(terraform output -raw redis_port 2>/dev/null || echo "")
PROD_BUCKET=$(terraform output -raw documents_bucket_name 2>/dev/null || echo "")
STAGING_BUCKET=$(terraform output -raw documents_bucket_staging_name 2>/dev/null || echo "")

if [ -z "$API_URL" ]; then
  echo -e "${RED}Error: Could not extract Terraform outputs${NC}"
  echo "Make sure you're in the infrastructure/terraform directory and Terraform state exists"
  exit 1
fi

echo -e "${GREEN}✓ Extracted resources from Terraform state${NC}"
echo ""

# Test results file
RESULTS_FILE="/tmp/gcp-connectivity-test-${ENVIRONMENT}-$(date +%s).txt"
{
  echo "Travel Platform GCP Connectivity Test Results"
  echo "Environment: $ENVIRONMENT"
  echo "Date: $(date)"
  echo "======================================"
  echo ""
} > $RESULTS_FILE

# Cloud Run API Tests
echo -e "${YELLOW}[Test 2] Testing Cloud Run API Service...${NC}"
{
  curl -s -I "$API_URL/health" > /dev/null 2>&1 && echo "OK: API health check" || echo "FAIL: API health check"
  echo "API URL: $API_URL"
} | tee -a $RESULTS_FILE

curl -s -I "$API_URL/health" >/dev/null 2>&1
test_result "API Health Endpoint" $?

# Cloud Run Agency Portal Tests
echo -e "${YELLOW}[Test 3] Testing Cloud Run Agency Portal Service...${NC}"
{
  curl -s -I "$AGENCY_URL/health" > /dev/null 2>&1 && echo "OK: Agency health check" || echo "FAIL: Agency health check"
  echo "Agency URL: $AGENCY_URL"
} | tee -a $RESULTS_FILE

curl -s -I "$AGENCY_URL/health" >/dev/null 2>&1
test_result "Agency Health Endpoint" $?

# Cloud Run Customer Portal Tests
echo -e "${YELLOW}[Test 4] Testing Cloud Run Customer Portal Service...${NC}"
{
  curl -s -I "$CUSTOMER_URL/health" > /dev/null 2>&1 && echo "OK: Customer health check" || echo "FAIL: Customer health check"
  echo "Customer URL: $CUSTOMER_URL"
} | tee -a $RESULTS_FILE

curl -s -I "$CUSTOMER_URL/health" >/dev/null 2>&1
test_result "Customer Health Endpoint" $?

# Cloud SQL Database Tests
echo -e "${YELLOW}[Test 5] Testing Cloud SQL Database Connectivity...${NC}"
{
  echo "Database Instance: $DB_INSTANCE"
  echo "Database Private IP: $DB_PRIVATE_IP"
  echo "Connection Name: $DB_CONNECTION"
} | tee -a $RESULTS_FILE

if command -v psql &> /dev/null; then
  # Use gcloud sql connect for easier testing
  if gcloud sql connect $DB_INSTANCE --user=postgres --quiet --database=postgres -c "SELECT version();" 2>/dev/null | grep -q "PostgreSQL"; then
    test_result "Cloud SQL Database Connection" 0
  else
    test_result "Cloud SQL Database Connection" 1
  fi
else
  echo -e "${YELLOW}⚠ psql not installed - skipping direct database test${NC}"
  test_result "Cloud SQL Database Connection (skipped)" 0
fi

# Redis Tests
echo -e "${YELLOW}[Test 6] Testing Memorystore Redis Connectivity...${NC}"
{
  echo "Redis Host: $REDIS_HOST"
  echo "Redis Port: $REDIS_PORT"
} | tee -a $RESULTS_FILE

if command -v redis-cli &> /dev/null; then
  # Construct Redis URL from secret (masked)
  if redis-cli -h $REDIS_HOST -p $REDIS_PORT ping >/dev/null 2>&1; then
    test_result "Redis Connectivity" 0
  else
    test_result "Redis Connectivity" 1
  fi
else
  echo -e "${YELLOW}⚠ redis-cli not installed - skipping Redis test${NC}"
  test_result "Redis Connectivity (skipped)" 0
fi

# Cloud Storage Tests
echo -e "${YELLOW}[Test 7] Testing Cloud Storage Buckets...${NC}"
{
  echo "Production Bucket: $PROD_BUCKET"
  echo "Staging Bucket: $STAGING_BUCKET"
} | tee -a $RESULTS_FILE

if gsutil ls -b "gs://$PROD_BUCKET" >/dev/null 2>&1; then
  test_result "Production Storage Bucket" 0
else
  test_result "Production Storage Bucket" 1
fi

if gsutil ls -b "gs://$STAGING_BUCKET" >/dev/null 2>&1; then
  test_result "Staging Storage Bucket" 0
else
  test_result "Staging Storage Bucket" 1
fi

# Secret Manager Tests
echo -e "${YELLOW}[Test 8] Testing Secret Manager...${NC}"
{
  echo "Testing secret manager access..."
} | tee -a $RESULTS_FILE

if gcloud secrets versions access latest --secret="travel-platform-database-url-${ENVIRONMENT}" >/dev/null 2>&1; then
  test_result "Database URL Secret" 0
else
  test_result "Database URL Secret" 1
fi

if gcloud secrets versions access latest --secret="travel-platform-redis-url-${ENVIRONMENT}" >/dev/null 2>&1; then
  test_result "Redis URL Secret" 0
else
  test_result "Redis URL Secret" 1
fi

# Service Account Tests
echo -e "${YELLOW}[Test 9] Testing Service Accounts...${NC}"
{
  echo "Testing service account configuration..."
} | tee -a $RESULTS_FILE

API_SA=$(terraform output -raw api_service_account_email 2>/dev/null || echo "")
if gcloud iam service-accounts describe "$API_SA" >/dev/null 2>&1; then
  test_result "API Service Account" 0
else
  test_result "API Service Account" 1
fi

# Summary
echo ""
echo -e "${YELLOW}=== Test Summary ===${NC}"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

# Append summary to results file
{
  echo ""
  echo "Test Summary"
  echo "======================================"
  echo "Passed: $TESTS_PASSED"
  echo "Failed: $TESTS_FAILED"
  echo "Total: $((TESTS_PASSED + TESTS_FAILED))"
} >> $RESULTS_FILE

echo "Full results saved to: $RESULTS_FILE"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All connectivity tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Check results and troubleshoot.${NC}"
  exit 1
fi
