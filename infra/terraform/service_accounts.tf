resource "google_service_account" "web" {
  account_id   = "${replace(local.prefix, "-", "")}web"
  display_name = "Allybi web runtime"
}

resource "google_service_account" "api" {
  account_id   = "${replace(local.prefix, "-", "")}api"
  display_name = "Allybi api runtime"
}

resource "google_service_account" "admin" {
  account_id   = "${replace(local.prefix, "-", "")}admin"
  display_name = "Allybi admin runtime"
}

resource "google_service_account" "worker" {
  account_id   = "${replace(local.prefix, "-", "")}worker"
  display_name = "Allybi worker runtime"
}

resource "google_service_account" "pubsub_push" {
  account_id   = "${replace(local.prefix, "-", "")}pubsubpush"
  display_name = "Pub/Sub push invoker"
}

locals {
  api_sa_roles = [
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectAdmin",
    "roles/pubsub.publisher",
    "roles/cloudkms.cryptoKeyDecrypter",
    "roles/cloudkms.cryptoKeyEncrypterDecrypter",
  ]

  worker_sa_roles = [
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectAdmin",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
    "roles/cloudkms.cryptoKeyEncrypterDecrypter",
  ]
}

resource "google_project_iam_member" "api_roles" {
  for_each = toset(local.api_sa_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "admin_secret_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.admin.email}"
}

resource "google_project_iam_member" "worker_roles" {
  for_each = toset(local.worker_sa_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.worker.email}"
}
