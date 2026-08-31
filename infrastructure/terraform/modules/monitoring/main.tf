# Monitoring Dashboard
resource "google_monitoring_dashboard" "travel_platform" {
  dashboard_json = jsonencode({
    displayName = "Travel Platform ${var.environment} Dashboard"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width  = 6
          height = 4
          widget = {
            title = "API Error Rate"
            xyChart = {
              dataSources = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.app_name}-api-${var.environment}\""
                    }
                  }
                }
              ]
            }
          }
        },
        {
          xPos   = 6
          width  = 6
          height = 4
          widget = {
            title = "API Latency (p99)"
            xyChart = {
              dataSources = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.app_name}-api-${var.environment}\""
                    }
                  }
                }
              ]
            }
          }
        },
        {
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Database Connections"
            xyChart = {
              dataSources = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"cloudsql.googleapis.com/database/network/connections\""
                    }
                  }
                }
              ]
            }
          }
        },
        {
          xPos   = 6
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Redis Memory Usage"
            xyChart = {
              dataSources = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"redis.googleapis.com/stats/memory/maxmemory\""
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    }
  })
}

# Alert Policy - High Error Rate
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "Travel Platform ${var.environment} - High Error Rate"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "API Error Rate > 5%"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.app_name}-api-${var.environment}\" metric.label.response_code_class=\"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 50

      aggregations {
        alignment_period  = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = []

  documentation {
    content   = "API service is returning high error rate. Check logs for details."
    mime_type = "text/markdown"
  }
}

# Alert Policy - High Latency
resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "Travel Platform ${var.environment} - High Latency"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "API Latency p99 > 1s"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.app_name}-api-${var.environment}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1000

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = []

  documentation {
    content   = "API service latency is high. Check database and Redis connectivity."
    mime_type = "text/markdown"
  }
}

# Log Sink for Audit Trail
resource "google_logging_project_sink" "audit_logs" {
  name        = "travel-platform-audit-logs-${var.environment}"
  destination = "logging.googleapis.com/projects/${var.project_id}/logs/audit-trail"

  filter = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=has_substring(\"${var.app_name}\")"

  unique_writer_identity = true
}

# Uptime Check - API Health
resource "google_monitoring_uptime_check_config" "api_health" {
  display_name = "Travel Platform ${var.environment} - API Health Check"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/health"
    port           = 443
    request_method = "GET"
    use_ssl        = true
  }

  monitored_resource {
    type = "uptime-url"
    labels = {
      host = replace(var.api_service_url, "https://", "")
    }
  }

  selected_regions = ["USA"]
}
