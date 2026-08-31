# API Cloud Run Service
resource "google_cloud_run_service" "api" {
  name     = "${var.app_name}-api-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = var.service_account_email
      timeout_seconds      = var.timeout
      container_concurrency = 50
      max_retries          = 1

      containers {
        image = var.api_image
        ports {
          container_port = 3000
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "APP_ENV"
          value = var.environment
        }

        env {
          name  = "DATABASE_URL"
          value_from {
            secret_key_ref {
              name = var.database_url_secret_id
              key  = "latest"
            }
          }
        }

        env {
          name  = "REDIS_URL"
          value_from {
            secret_key_ref {
              name = var.redis_url_secret_id
              key  = "latest"
            }
          }
        }

        env {
          name  = "JWT_SECRET"
          value_from {
            secret_key_ref {
              name = var.jwt_secret_id
              key  = "latest"
            }
          }
        }

        env {
          name  = "MFA_ENCRYPTION_KEY"
          value_from {
            secret_key_ref {
              name = var.mfa_encryption_key_secret_id
              key  = "latest"
            }
          }
        }

        env {
          name  = "LOG_LEVEL"
          value = "info"
        }

        env {
          name  = "LOG_FORMAT"
          value = "json"
        }

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        startup_probe {
          timeout_seconds   = 30
          period_seconds    = 10
          failure_threshold = 5
          http_get {
            path = "/health"
            port = 3000
          }
        }

        liveness_probe {
          timeout_seconds   = 30
          period_seconds    = 30
          failure_threshold = 3
          http_get {
            path = "/health"
            port = 3000
          }
        }
      }

      vpc_access {
        connector = var.vpc_network_id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = var.min_instances
        "autoscaling.knative.dev/maxScale" = var.max_instances
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_cloud_run_iam_binding.api_noauth]
}

# Agency Portal Cloud Run Service
resource "google_cloud_run_service" "agency" {
  name     = "${var.app_name}-agency-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = var.service_account_email
      timeout_seconds      = var.timeout
      container_concurrency = 50
      max_retries          = 1

      containers {
        image = var.agency_image
        ports {
          container_port = 3001
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "APP_ENV"
          value = var.environment
        }

        env {
          name  = "API_URL"
          value = "https://${google_cloud_run_service.api.status[0].url}"
        }

        env {
          name  = "LOG_LEVEL"
          value = "info"
        }

        env {
          name  = "LOG_FORMAT"
          value = "json"
        }

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        startup_probe {
          timeout_seconds   = 30
          period_seconds    = 10
          failure_threshold = 5
          http_get {
            path = "/health"
            port = 3001
          }
        }

        liveness_probe {
          timeout_seconds   = 30
          period_seconds    = 30
          failure_threshold = 3
          http_get {
            path = "/health"
            port = 3001
          }
        }
      }

      vpc_access {
        connector = var.vpc_network_id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = var.min_instances
        "autoscaling.knative.dev/maxScale" = var.max_instances
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_cloud_run_iam_binding.agency_noauth]
}

# Customer Portal Cloud Run Service
resource "google_cloud_run_service" "customer" {
  name     = "${var.app_name}-customer-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = var.service_account_email
      timeout_seconds      = var.timeout
      container_concurrency = 50
      max_retries          = 1

      containers {
        image = var.customer_image
        ports {
          container_port = 3002
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "APP_ENV"
          value = var.environment
        }

        env {
          name  = "API_URL"
          value = "https://${google_cloud_run_service.api.status[0].url}"
        }

        env {
          name  = "LOG_LEVEL"
          value = "info"
        }

        env {
          name  = "LOG_FORMAT"
          value = "json"
        }

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        startup_probe {
          timeout_seconds   = 30
          period_seconds    = 10
          failure_threshold = 5
          http_get {
            path = "/health"
            port = 3002
          }
        }

        liveness_probe {
          timeout_seconds   = 30
          period_seconds    = 30
          failure_threshold = 3
          http_get {
            path = "/health"
            port = 3002
          }
        }
      }

      vpc_access {
        connector = var.vpc_network_id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = var.min_instances
        "autoscaling.knative.dev/maxScale" = var.max_instances
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_cloud_run_iam_binding.customer_noauth]
}

# Remove IAM restriction - allow unauthenticated access for now
resource "google_cloud_run_iam_binding" "api_noauth" {
  location = google_cloud_run_service.api.location
  service  = google_cloud_run_service.api.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}

resource "google_cloud_run_iam_binding" "agency_noauth" {
  location = google_cloud_run_service.agency.location
  service  = google_cloud_run_service.agency.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}

resource "google_cloud_run_iam_binding" "customer_noauth" {
  location = google_cloud_run_service.customer.location
  service  = google_cloud_run_service.customer.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}
