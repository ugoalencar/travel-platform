# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "compute.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "compute.googleapis.com",
    "serviceusage.googleapis.com",
  ])

  project            = var.gcp_project_id
  service            = each.value
  disable_on_destroy = false
}

# VPC Network
module "networking" {
  source = "./modules/networking"

  project_id = var.gcp_project_id
  region     = var.gcp_region
  environment = var.environment

  depends_on = [google_project_service.required_apis]
}

# Service Accounts
module "iam" {
  source = "./modules/iam"

  project_id  = var.gcp_project_id
  app_name    = var.app_name
  environment = var.environment

  depends_on = [google_project_service.required_apis]
}

# Secret Manager
module "secrets" {
  source = "./modules/secrets"

  project_id = var.gcp_project_id
  environment = var.environment
  app_name    = var.app_name

  jwt_secret           = var.jwt_secret
  mfa_encryption_key   = var.mfa_encryption_key
  db_password_runtime  = var.db_password_runtime
  db_password_migrations = var.db_password_migrations
  redis_password       = var.redis_password

  depends_on = [google_project_service.required_apis]
}

# Cloud SQL PostgreSQL
module "cloud_sql" {
  source = "./modules/cloud-sql"

  project_id  = var.gcp_project_id
  region      = var.gcp_region
  environment = var.environment
  app_name    = var.app_name

  network_id              = module.networking.network_id
  database_tier           = var.database_tier
  database_version        = var.database_version
  backup_retention_days   = var.database_backup_retention_days
  db_password_runtime     = var.db_password_runtime
  db_password_migrations  = var.db_password_migrations
  runtime_secret_id       = module.secrets.database_url_secret_id
  migrations_secret_id    = module.secrets.database_migration_url_secret_id
  labels                  = var.labels

  depends_on = [
    google_project_service.required_apis,
    module.networking,
    module.iam,
    module.secrets,
  ]
}

# Memorystore Redis
module "redis" {
  source = "./modules/redis"

  project_id  = var.gcp_project_id
  region      = var.gcp_region
  environment = var.environment
  app_name    = var.app_name

  network_id        = module.networking.network_id
  memory_size_gb    = var.redis_memory_size_gb
  tier              = var.redis_tier
  redis_password    = var.redis_password
  redis_secret_id   = module.secrets.redis_url_secret_id
  labels            = var.labels

  depends_on = [
    google_project_service.required_apis,
    module.networking,
    module.iam,
    module.secrets,
  ]
}

# Cloud Storage (Documents)
module "storage" {
  source = "./modules/storage"

  project_id  = var.gcp_project_id
  region      = var.gcp_region
  environment = var.environment
  app_name    = var.app_name

  storage_secret_id = module.secrets.document_storage_url_secret_id
  labels            = var.labels

  depends_on = [google_project_service.required_apis]
}

# Artifact Registry
resource "google_artifact_registry_repository" "travel_platform" {
  project      = var.gcp_project_id
  location     = var.gcp_region
  repository_id = "${replace(var.app_name, "-", "_")}_registry"
  format       = "DOCKER"
  description  = "Travel Platform Docker Container Registry"

  labels = var.labels

  depends_on = [google_project_service.required_apis]
}

# Cloud Run Services
module "cloud_run" {
  source = "./modules/cloud-run"

  project_id  = var.gcp_project_id
  region      = var.gcp_region
  environment = var.environment
  app_name    = var.app_name

  vpc_network_id       = module.networking.network_id
  vpc_subnet_id        = module.networking.subnet_id
  service_account_email = module.iam.api_service_account_email

  api_image    = var.api_image
  agency_image = var.agency_image
  customer_image = var.customer_image

  memory              = var.cloud_run_memory
  cpu                 = var.cloud_run_cpu
  timeout             = var.cloud_run_timeout
  min_instances       = var.cloud_run_min_instances
  max_instances       = var.cloud_run_max_instances

  database_url_secret_id = module.secrets.database_url_secret_id
  redis_url_secret_id    = module.secrets.redis_url_secret_id
  jwt_secret_id          = module.secrets.jwt_secret_id
  mfa_encryption_key_secret_id = module.secrets.mfa_encryption_key_secret_id

  labels = var.labels

  depends_on = [
    google_project_service.required_apis,
    module.networking,
    module.iam,
    module.secrets,
    module.cloud_sql,
    module.redis,
    google_artifact_registry_repository.travel_platform,
  ]
}

# Monitoring & Logging
module "monitoring" {
  source = "./modules/monitoring"

  project_id  = var.gcp_project_id
  region      = var.gcp_region
  environment = var.environment
  app_name    = var.app_name

  api_service_id    = module.cloud_run.api_service_id
  agency_service_id = module.cloud_run.agency_service_id
  customer_service_id = module.cloud_run.customer_service_id

  depends_on = [
    google_project_service.required_apis,
    module.cloud_run,
  ]
}
