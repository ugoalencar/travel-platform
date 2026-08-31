output "instance_name" {
  description = "Redis Instance Name"
  value       = google_redis_instance.travel_platform.name
}

output "host" {
  description = "Redis Host"
  value       = google_redis_instance.travel_platform.host
}

output "port" {
  description = "Redis Port"
  value       = google_redis_instance.travel_platform.port
}

output "connection_string" {
  description = "Redis Connection String"
  value       = "redis://:${var.redis_password}@${google_redis_instance.travel_platform.host}:${google_redis_instance.travel_platform.port}/0"
  sensitive   = true
}

output "reserved_ip_range" {
  description = "Reserved IP Range for Redis"
  value       = "10.0.1.0/24"
}
