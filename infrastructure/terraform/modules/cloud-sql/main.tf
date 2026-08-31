resource "google_sql_database_instance" "travel_platform" {
  name                = "${var.app_name}-db-${var.environment}"
  database_version    = "POSTGRES_${var.database_version}"
  region              = var.region
  deletion_protection = var.environment == "prod" ? true : false

  settings {
    tier              = var.database_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.backup_retention_days
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.network_id
      enable_private_path_for_cloudsql_cloud_sql    = true
      require_ssl                                   = true
      authorized_networks                          = []
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }

    database_flags {
      name  = "log_statement"
      value = "all"
    }

    database_flags {
      name  = "log_duration"
      value = "on"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    maintenance_window {
      day             = 3
      hour            = 3
      update_track    = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }

  depends_on = [var.vpc_peering_connection]
}

# Database
resource "google_sql_database" "travel_platform" {
  name      = "travel_platform_${var.environment}"
  instance  = google_sql_database_instance.travel_platform.name
  charset   = "UTF8"
  collation = "en_US.UTF8"
}

# Runtime User
resource "google_sql_user" "travel_app_runtime" {
  name       = "travel_app_runtime"
  instance   = google_sql_database_instance.travel_platform.name
  password   = var.db_password_runtime
  type       = "BUILT_IN"
}

# Migrations User
resource "google_sql_user" "travel_migrations" {
  name       = "travel_migrations"
  instance   = google_sql_database_instance.travel_platform.name
  password   = var.db_password_migrations
  type       = "BUILT_IN"
}

# Grant permissions for runtime user
resource "google_sql_database_instance_iam_member" "runtime_cloudsql_client" {
  instance = google_sql_database_instance.travel_platform.name
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${var.service_account_email}"
}
