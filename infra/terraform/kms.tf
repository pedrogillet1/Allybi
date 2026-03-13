resource "google_kms_key_ring" "main" {
  name     = "${local.prefix}-ring"
  location = var.region
}

resource "google_kms_crypto_key" "storage" {
  name            = "${local.prefix}-storage"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = "7776000s"
}

resource "google_kms_crypto_key" "app" {
  name            = "${local.prefix}-app"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = "7776000s"
}
