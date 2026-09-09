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

variable "vpc_network_id" {
  description = "VPC Network ID"
  type        = string
}

variable "vpc_subnet_id" {
  description = "VPC Subnet ID"
  type        = string
}

variable "service_account_email" {
  description = "Service Account Email"
  type        = string
}

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

variable "memory" {
  description = "Cloud Run memory allocation"
  type        = string
  default     = "2Gi"
}

variable "cpu" {
  description = "Cloud Run CPU allocation"
  type        = string
  default     = "2"
}

variable "timeout" {
  description = "Cloud Run timeout in seconds"
  type        = number
  default     = 60
}

variable "min_instances" {
  description = "Minimum instances"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum instances"
  type        = number
  default     = 10
}

variable "database_url_secret_id" {
  description = "Database URL secret ID"
  type        = string
}

variable "redis_url_secret_id" {
  description = "Redis URL secret ID"
  type        = string
}

variable "jwt_secret_id" {
  description = "JWT secret ID"
  type        = string
}

variable "mfa_encryption_key_secret_id" {
  description = "MFA encryption key secret ID"
  type        = string
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
