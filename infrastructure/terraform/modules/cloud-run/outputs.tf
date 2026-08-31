output "api_service_id" {
  description = "API Cloud Run Service ID"
  value       = google_cloud_run_service.api.id
}

output "api_service_name" {
  description = "API Cloud Run Service Name"
  value       = google_cloud_run_service.api.name
}

output "api_service_url" {
  description = "API Cloud Run Service URL"
  value       = google_cloud_run_service.api.status[0].url
}

output "agency_service_id" {
  description = "Agency Cloud Run Service ID"
  value       = google_cloud_run_service.agency.id
}

output "agency_service_name" {
  description = "Agency Cloud Run Service Name"
  value       = google_cloud_run_service.agency.name
}

output "agency_service_url" {
  description = "Agency Cloud Run Service URL"
  value       = google_cloud_run_service.agency.status[0].url
}

output "customer_service_id" {
  description = "Customer Cloud Run Service ID"
  value       = google_cloud_run_service.customer.id
}

output "customer_service_name" {
  description = "Customer Cloud Run Service Name"
  value       = google_cloud_run_service.customer.name
}

output "customer_service_url" {
  description = "Customer Cloud Run Service URL"
  value       = google_cloud_run_service.customer.status[0].url
}
