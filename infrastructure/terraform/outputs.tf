output "project_id" {
  description = "GCP Project ID"
  value       = var.gcp_project_id
}

output "region" {
  description = "GCP Region"
  value       = var.gcp_region
}

# Network Outputs
output "network_id" {
  description = "VPC Network ID"
  value       = module.networking.network_id
}

output "subnet_id" {
  description = "VPC Subnet ID"
  value       = module.networking.subnet_id
}

# Cloud SQL Outputs
output "database_instance_name" {
  description = "Cloud SQL Instance Name"
  value       = module.cloud_sql.instance_name
}

output "database_private_ip" {
  description = "Cloud SQL Private IP"
  value       = module.cloud_sql.private_ip
}

output "database_connection_name" {
  description = "Cloud SQL Connection Name"
  value       = module.cloud_sql.connection_name
}

# Redis Outputs
output "redis_host" {
  description = "Redis Host"
  value       = module.redis.host
}

output "redis_port" {
  description = "Redis Port"
  value       = module.redis.port
}

# Cloud Storage Outputs
output "documents_bucket_name" {
  description = "Documents Bucket Name (Prod)"
  value       = module.storage.prod_bucket_name
}

output "documents_bucket_staging_name" {
  description = "Documents Bucket Name (Staging)"
  value       = module.storage.staging_bucket_name
}

# Cloud Run Outputs
output "api_service_url" {
  description = "API Cloud Run Service URL"
  value       = module.cloud_run.api_service_url
}

output "agency_service_url" {
  description = "Agency Portal Cloud Run Service URL"
  value       = module.cloud_run.agency_service_url
}

output "customer_service_url" {
  description = "Customer Portal Cloud Run Service URL"
  value       = module.cloud_run.customer_service_url
}

# Artifact Registry Outputs
output "artifact_registry_repository" {
  description = "Artifact Registry Repository Name"
  value       = google_artifact_registry_repository.travel_platform.repository_id
}

output "artifact_registry_url" {
  description = "Artifact Registry Repository URL"
  value       = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.travel_platform.repository_id}"
}

# IAM Outputs
output "api_service_account_email" {
  description = "API Service Account Email"
  value       = module.iam.api_service_account_email
}

output "ci_service_account_email" {
  description = "CI Service Account Email"
  value       = module.iam.ci_service_account_email
}

# Secret Manager Outputs
output "secrets" {
  description = "Secret Manager Secret IDs"
  value = {
    database_url                  = module.secrets.database_url_secret_id
    database_migration_url        = module.secrets.database_migration_url_secret_id
    redis_url                     = module.secrets.redis_url_secret_id
    jwt_secret                    = module.secrets.jwt_secret_id
    mfa_encryption_key            = module.secrets.mfa_encryption_key_secret_id
    document_storage_url          = module.secrets.document_storage_url_secret_id
  }
  sensitive = true
}
