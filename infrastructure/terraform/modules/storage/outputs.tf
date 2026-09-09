output "prod_bucket_name" {
  description = "Production Documents Bucket Name"
  value       = google_storage_bucket.documents_prod.name
}

output "prod_bucket_url" {
  description = "Production Documents Bucket URL"
  value       = "gs://${google_storage_bucket.documents_prod.name}"
}

output "staging_bucket_name" {
  description = "Staging Documents Bucket Name"
  value       = google_storage_bucket.documents_staging.name
}

output "staging_bucket_url" {
  description = "Staging Documents Bucket URL"
  value       = "gs://${google_storage_bucket.documents_staging.name}"
}
