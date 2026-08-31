output "api_service_account_email" {
  description = "API Service Account Email"
  value       = google_service_account.api.email
}

output "api_service_account_id" {
  description = "API Service Account ID"
  value       = google_service_account.api.unique_id
}

output "ci_service_account_email" {
  description = "CI Service Account Email"
  value       = google_service_account.ci.email
}

output "ci_service_account_id" {
  description = "CI Service Account ID"
  value       = google_service_account.ci.unique_id
}
