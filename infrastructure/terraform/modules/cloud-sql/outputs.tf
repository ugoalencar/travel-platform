output "instance_name" {
  description = "Cloud SQL Instance Name"
  value       = google_sql_database_instance.travel_platform.name
}

output "instance_connection_name" {
  description = "Cloud SQL Instance Connection Name"
  value       = google_sql_database_instance.travel_platform.connection_name
}

output "private_ip" {
  description = "Cloud SQL Private IP"
  value       = google_sql_database_instance.travel_platform.private_ip_address
}

output "public_ip" {
  description = "Cloud SQL Public IP (if enabled)"
  value       = try(google_sql_database_instance.travel_platform.public_ip_address, "N/A")
}

output "connection_name" {
  description = "Cloud SQL Connection Name for Cloud SQL Proxy"
  value       = google_sql_database_instance.travel_platform.connection_name
}

output "database_name" {
  description = "Database Name"
  value       = google_sql_database.travel_platform.name
}
