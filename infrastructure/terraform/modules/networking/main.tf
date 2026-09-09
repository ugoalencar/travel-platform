resource "google_compute_network" "travel_platform" {
  name                    = "${var.app_name}-${var.environment}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "travel_platform" {
  name          = "${var.app_name}-${var.environment}-subnet"
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.travel_platform.id
  project       = var.project_id

  private_ip_google_access = true
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_logs_enabled    = true
    sampling_rate        = 0.5
  }
}

# Cloud NAT for outbound internet access
resource "google_compute_router" "travel_platform" {
  name    = "${var.app_name}-${var.environment}-router"
  region  = var.region
  network = google_compute_network.travel_platform.id
  project = var.project_id
}

resource "google_compute_router_nat" "travel_platform" {
  name                               = "${var.app_name}-${var.environment}-nat"
  router                             = google_compute_router.travel_platform.name
  region                             = google_compute_router.travel_platform.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  auto_network_tier                  = "PREMIUM"
}

# Firewall - Allow internal communication
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.app_name}-${var.environment}-allow-internal"
  network = google_compute_network.travel_platform.name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  source_ranges = [var.subnet_cidr]
}

# Firewall - Allow health checks from Google Cloud
resource "google_compute_firewall" "allow_health_checks" {
  name    = "${var.app_name}-${var.environment}-allow-health-checks"
  network = google_compute_network.travel_platform.name
  project = var.project_id

  allow {
    protocol = "tcp"
  }

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
}

# Private Service Connection for Cloud SQL and Redis
resource "google_compute_global_address" "private_ip_address" {
  name          = "${var.app_name}-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.travel_platform.id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.travel_platform.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}
