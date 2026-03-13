resource "google_storage_bucket" "documents" {
  name                        = "${local.prefix}-documents"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  default_kms_key_name        = google_kms_crypto_key.storage.id

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 90
    }
  }
}
