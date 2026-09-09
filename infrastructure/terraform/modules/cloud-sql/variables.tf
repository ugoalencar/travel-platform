variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
}

variable "environment" {
  description = "Environment"
  type        = string
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "travel-platform"
}

variable "network_id" {
  description = "VPC Network ID"
  type        = string
}

variable "vpc_peering_connection" {
  description = "VPC Peering Connection"
  type        = string
}

variable "database_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-2-8192"
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15"
}

variable "backup_retention_days" {
  description = "Backup retention days"
  type        = number
  default     = 30
}

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

variable "runtime_secret_id" {
  description = "Runtime database secret ID"
  type        = string
}

variable "migrations_secret_id" {
  description = "Migrations database secret ID"
  type        = string
}

variable "service_account_email" {
  description = "API Service Account Email"
  type        = string
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
