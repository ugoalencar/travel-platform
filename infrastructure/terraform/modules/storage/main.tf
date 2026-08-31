# Production Documents Bucket
resource "google_storage_bucket" "documents_prod" {
  name                        = "${var.app_name}-documents-prod"
  location                    = var.region
  project                     = var.project_id
  force_destroy               = false
  uniform_bucket_level_access = true

  public_access_prevention = "enforced"

  encryption {
    default_kms_key_name = ""
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  labels = merge(
    var.labels,
    {
      environment = "prod"
      app         = var.app_name
    }
  )
}

# Staging Documents Bucket
resource "google_storage_bucket" "documents_staging" {
  name                        = "${var.app_name}-documents-staging"
  location                    = var.region
  project                     = var.project_id
  force_destroy               = true
  uniform_bucket_level_access = true

  public_access_prevention = "enforced"

  encryption {
    default_kms_key_name = ""
  }

  versioning {
    enabled = false
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  labels = merge(
    var.labels,
    {
      environment = "staging"
      app         = var.app_name
    }
  )
}

# Block public access to prod bucket
resource "google_storage_bucket_iam_member" "documents_prod_public_access" {
  bucket = google_storage_bucket.documents_prod.name
  role   = "roles/storage.objectViewer"
  member = "projectEditor:${var.project_id}"
}

# Block public access to staging bucket
resource "google_storage_bucket_iam_member" "documents_staging_public_access" {
  bucket = google_storage_bucket.documents_staging.name
  role   = "roles/storage.objectViewer"
  member = "projectEditor:${var.project_id}"
}
