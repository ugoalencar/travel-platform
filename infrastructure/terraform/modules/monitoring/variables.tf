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

variable "api_service_id" {
  description = "API Service ID"
  type        = string
}

variable "api_service_url" {
  description = "API Service URL"
  type        = string
}

variable "agency_service_id" {
  description = "Agency Service ID"
  type        = string
}

variable "customer_service_id" {
  description = "Customer Service ID"
  type        = string
}
