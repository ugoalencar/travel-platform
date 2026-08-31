variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "travel-platform"
}

variable "environment" {
  description = "Environment"
  type        = string
}
