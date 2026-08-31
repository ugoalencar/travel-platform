output "network_id" {
  description = "VPC Network ID"
  value       = google_compute_network.travel_platform.id
}

output "network_name" {
  description = "VPC Network Name"
  value       = google_compute_network.travel_platform.name
}

output "subnet_id" {
  description = "Subnet ID"
  value       = google_compute_subnetwork.travel_platform.id
}

output "subnet_name" {
  description = "Subnet Name"
  value       = google_compute_subnetwork.travel_platform.name
}

output "private_vpc_connection" {
  description = "Private VPC Connection for Cloud SQL/Redis"
  value       = google_service_networking_connection.private_vpc_connection.id
}
