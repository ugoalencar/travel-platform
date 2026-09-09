output "dashboard_id" {
  description = "Monitoring Dashboard ID"
  value       = google_monitoring_dashboard.travel_platform.dashboard_json
}

output "error_rate_alert_id" {
  description = "Error Rate Alert Policy ID"
  value       = google_monitoring_alert_policy.high_error_rate.id
}

output "latency_alert_id" {
  description = "Latency Alert Policy ID"
  value       = google_monitoring_alert_policy.high_latency.id
}

output "audit_log_sink_id" {
  description = "Audit Log Sink ID"
  value       = google_logging_project_sink.audit_logs.id
}

output "uptime_check_id" {
  description = "Uptime Check ID"
  value       = google_monitoring_uptime_check_config.api_health.id
}
