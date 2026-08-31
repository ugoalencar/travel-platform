resource "google_redis_instance" "travel_platform" {
  name               = "${var.app_name}-redis-${var.environment}"
  memory_size_gb     = var.memory_size_gb
  tier               = var.tier
  region             = var.region
  location_id        = var.environment == "prod" ? data.google_compute_zones.available.names[0] : data.google_compute_zones.available.names[0]
  redis_version      = "7.0"
  display_name       = "Travel Platform Redis (${var.environment})"
  auth_enabled       = true
  auth_string_update_strategy = "UPDATE_AUTH_STRING"

  server_ca_certs {
    cert = ""
  }

  client_output_buffer_limit_pubsub_hard_limit_mb     = 256
  client_output_buffer_limit_pubsub_soft_limit_mb     = 128
  client_output_buffer_limit_pubsub_soft_limit_seconds = 10

  client_output_buffer_limit_normal_hard_limit_mb     = 512
  client_output_buffer_limit_normal_soft_limit_mb     = 256
  client_output_buffer_limit_normal_soft_limit_seconds = 10

  timeout_action = "NOTIFY"
  timeout_value  = 30

  persistence_config {
    persistence_mode = "RDB"
    rdb_snapshot_period = var.environment == "prod" ? "ONE_HOUR" : "SIX_HOURS"
  }

  maintenance_policy {
    day           = "MONDAY"
    hour          = 3
    update_track  = "stable"
  }

  reserved_ip_range = "10.0.1.0/24"

  connect_mode = "PRIVATE_SERVICE_ACCESS"

  network    = var.network_id
  auth_string = var.redis_password

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
    }
  )
}

# Get available zones for the region
data "google_compute_zones" "available" {
  project = var.project_id
  region  = var.region
}
