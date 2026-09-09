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

variable "memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 5
}

variable "tier" {
  description = "Redis tier (standard, premium)"
  type        = string
  default     = "standard"
}

variable "redis_password" {
  description = "Redis password"
  type        = string
  sensitive   = true
}

variable "redis_secret_id" {
  description = "Redis secret ID"
  type        = string
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
