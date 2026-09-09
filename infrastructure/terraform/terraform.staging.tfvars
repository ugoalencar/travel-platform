# Staging Environment Configuration
# IMPORTANT: Do not commit secrets. Use environment variables for sensitive values.

gcp_project_id = "YOUR_GCP_PROJECT_ID"
gcp_region     = "us-central1"
environment    = "staging"
app_name       = "travel-platform"

# Database Configuration
database_tier                = "db-custom-2-8192"
database_version             = "15"
database_backup_retention_days = 7

# Redis Configuration
redis_memory_size_gb = 2
redis_tier           = "standard"

# Cloud Run Configuration
cloud_run_memory     = "1Gi"
cloud_run_cpu        = "1"
cloud_run_timeout    = 60
cloud_run_min_instances = 1
cloud_run_max_instances = 5

# Container Images (push images to Artifact Registry first)
api_image     = "us-central1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/travel_platform_registry/api:v1.0.0-rc1"
agency_image  = "us-central1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/travel_platform_registry/agency:v1.0.0-rc1"
customer_image = "us-central1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/travel_platform_registry/customer:v1.0.0-rc1"

# Domains
domains = {
  api      = "api-stage.travel-platform.com"
  agency   = "agencies-stage.travel-platform.com"
  customer = "travel-stage.travel-platform.com"
}

# Secrets (inject via environment variables, not in tfvars)
# jwt_secret = "" # Use TF_VAR_jwt_secret environment variable
# mfa_encryption_key = "" # Use TF_VAR_mfa_encryption_key environment variable
# db_password_runtime = "" # Use TF_VAR_db_password_runtime environment variable
# db_password_migrations = "" # Use TF_VAR_db_password_migrations environment variable
# redis_password = "" # Use TF_VAR_redis_password environment variable

# Labels
labels = {
  managed_by  = "terraform"
  project     = "travel-platform"
  environment = "staging"
}
