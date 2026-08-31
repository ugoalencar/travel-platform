variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (prod, staging)"
  type        = string
  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "Environment must be 'prod' or 'staging'."
  }
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "travel-platform"
}

# Database Configuration
variable "database_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-2-8192" # 2 vCPU, 8GB RAM
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15"
}

variable "database_backup_retention_days" {
  description = "Database backup retention days"
  type        = number
  default     = 30
}

# Redis Configuration
variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 5
}

variable "redis_tier" {
  description = "Redis tier (standard, premium)"
  type        = string
  default     = "standard"
}

# Cloud Run Configuration
variable "cloud_run_memory" {
  description = "Cloud Run memory allocation"
  type        = string
  default     = "2Gi"
}

variable "cloud_run_cpu" {
  description = "Cloud Run CPU allocation"
  type        = string
  default     = "2"
}

variable "cloud_run_timeout" {
  description = "Cloud Run timeout in seconds"
  type        = number
  default     = 60
}

variable "cloud_run_min_instances" {
  description = "Cloud Run minimum instances"
  type        = number
  default     = 1
}

variable "cloud_run_max_instances" {
  description = "Cloud Run maximum instances"
  type        = number
  default     = 10
}

# Secrets Configuration
variable "jwt_secret" {
  description = "JWT Secret"
  type        = string
  sensitive   = true
}

variable "mfa_encryption_key" {
  description = "MFA Encryption Key"
  type        = string
  sensitive   = true
}

# Database Passwords
variable "db_password_runtime" {
  description = "Database password for runtime user"
  type        = string
  sensitive   = true
}

variable "db_password_migrations" {
  description = "Database password for migrations user"
  type        = string
  sensitive   = true
}

# Redis Password
variable "redis_password" {
  description = "Redis password"
  type        = string
  sensitive   = true
}

# Domain Configuration
variable "domains" {
  description = "Domain configuration"
  type = object({
    api      = string
    agency   = string
    customer = string
  })
}

# Container Images
variable "api_image" {
  description = "API container image"
  type        = string
}

variable "agency_image" {
  description = "Agency portal container image"
  type        = string
}

variable "customer_image" {
  description = "Customer portal container image"
  type        = string
}

# Tags
variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default = {
    managed_by = "terraform"
    project    = "travel-platform"
  }
}
