#!/bin/bash

# Travel Platform Container Image Build Script
# Builds and pushes Docker images to Google Artifact Registry
#
# Usage: ./scripts/build-images.sh <project-id> [tag]
# Example: ./scripts/build-images.sh my-travel-platform-prod v1.0.0-rc1

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
PROJECT_ID="${1:-}"
TAG="${2:-v1.0.0-rc1}"
REGION="us-central1"
REGISTRY="${REGION}-docker.pkg.dev"
REPOSITORY="${PROJECT_ID}/travel_platform_registry"
IMAGE_BASE="${REGISTRY}/${REPOSITORY}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Validation
if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: PROJECT_ID is required${NC}"
  echo "Usage: $0 <project-id> [tag]"
  exit 1
fi

echo -e "${GREEN}=== Travel Platform Container Image Build ===${NC}"
echo "Project ID: $PROJECT_ID"
echo "Tag: $TAG"
echo "Registry: $IMAGE_BASE"
echo ""

# Step 1: Verify gcloud authentication
echo -e "${YELLOW}[Step 1] Verifying Docker authentication...${NC}"
gcloud auth configure-docker $REGISTRY --quiet
echo -e "${GREEN}✓ Docker authenticated${NC}"

# Step 2: Build API image
echo -e "${YELLOW}[Step 2] Building API image...${NC}"
docker build \
  --tag "${IMAGE_BASE}/api:${TAG}" \
  --tag "${IMAGE_BASE}/api:latest" \
  --build-arg NODE_ENV=production \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -f services/api/Dockerfile \
  "$PROJECT_ROOT"
echo -e "${GREEN}✓ API image built: ${IMAGE_BASE}/api:${TAG}${NC}"

# Step 3: Build Agency portal image
echo -e "${YELLOW}[Step 3] Building Agency portal image...${NC}"
docker build \
  --tag "${IMAGE_BASE}/agency:${TAG}" \
  --tag "${IMAGE_BASE}/agency:latest" \
  --build-arg NODE_ENV=production \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -f apps/agency/Dockerfile \
  "$PROJECT_ROOT"
echo -e "${GREEN}✓ Agency portal image built: ${IMAGE_BASE}/agency:${TAG}${NC}"

# Step 4: Build Customer portal image
echo -e "${YELLOW}[Step 4] Building Customer portal image...${NC}"
docker build \
  --tag "${IMAGE_BASE}/customer:${TAG}" \
  --tag "${IMAGE_BASE}/customer:latest" \
  --build-arg NODE_ENV=production \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -f apps/customer/Dockerfile \
  "$PROJECT_ROOT"
echo -e "${GREEN}✓ Customer portal image built: ${IMAGE_BASE}/customer:${TAG}${NC}"

# Step 5: Scan images for vulnerabilities (optional, requires gcloud)
echo -e "${YELLOW}[Step 5] Scanning images for vulnerabilities...${NC}"
docker scan --severity high "${IMAGE_BASE}/api:${TAG}" || echo -e "${YELLOW}⚠ Vulnerability scan not available${NC}"

# Step 6: Push API image
echo -e "${YELLOW}[Step 6] Pushing API image...${NC}"
docker push "${IMAGE_BASE}/api:${TAG}"
docker push "${IMAGE_BASE}/api:latest"
echo -e "${GREEN}✓ API image pushed${NC}"

# Step 7: Push Agency portal image
echo -e "${YELLOW}[Step 7] Pushing Agency portal image...${NC}"
docker push "${IMAGE_BASE}/agency:${TAG}"
docker push "${IMAGE_BASE}/agency:latest"
echo -e "${GREEN}✓ Agency portal image pushed${NC}"

# Step 8: Push Customer portal image
echo -e "${YELLOW}[Step 8] Pushing Customer portal image...${NC}"
docker push "${IMAGE_BASE}/customer:${TAG}"
docker push "${IMAGE_BASE}/customer:latest"
echo -e "${GREEN}✓ Customer portal image pushed${NC}"

# Step 9: Verify images in registry
echo -e "${YELLOW}[Step 9] Verifying images in Artifact Registry...${NC}"
echo "Images available in Artifact Registry:"
gcloud artifacts docker images list "${REGISTRY}/${REPOSITORY}" --project=$PROJECT_ID

echo ""
echo -e "${GREEN}✓ All images successfully built and pushed!${NC}"
echo ""
echo "Image references:"
echo "  API:     ${IMAGE_BASE}/api:${TAG}"
echo "  Agency:  ${IMAGE_BASE}/agency:${TAG}"
echo "  Customer: ${IMAGE_BASE}/customer:${TAG}"
echo ""
echo "Next steps:"
echo "1. Update Terraform tfvars with image URLs"
echo "2. Deploy to Cloud Run: terraform apply"
