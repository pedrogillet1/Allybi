locals {
  api_env = merge(var.api_plain_env, {
    GCS_BUCKET_NAME               = google_storage_bucket.documents.name
    GCP_PROJECT_ID                = var.project_id
    REDIS_URL                     = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
    DATABASE_URL                  = "postgresql://${var.db_user}:${var.db_password}@/${var.db_name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
    DIRECT_DATABASE_URL           = "postgresql://${var.db_user}:${var.db_password}@${google_sql_database_instance.postgres.private_ip_address}:5432/${var.db_name}"
    PUBSUB_EXTRACT_TOPIC          = google_pubsub_topic.extract.name
    PUBSUB_EXTRACT_FANOUT_TOPIC   = google_pubsub_topic.extract_fanout.name
    PUBSUB_EMBED_TOPIC            = google_pubsub_topic.embed.name
    PUBSUB_PREVIEW_TOPIC          = google_pubsub_topic.preview.name
    PUBSUB_OCR_TOPIC              = google_pubsub_topic.ocr.name
    KODA_IAP_AUDIENCE             = "/projects/${data.google_project.current.number}/global/backendServices/${google_compute_backend_service.admin_frontend.id}"
  })

  worker_env = merge(var.worker_plain_env, {
    GCS_BUCKET_NAME               = google_storage_bucket.documents.name
    GCP_PROJECT_ID                = var.project_id
    REDIS_URL                     = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
    DATABASE_URL                  = "postgresql://${var.db_user}:${var.db_password}@/${var.db_name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}&connection_limit=3"
    DIRECT_DATABASE_URL           = "postgresql://${var.db_user}:${var.db_password}@${google_sql_database_instance.postgres.private_ip_address}:5432/${var.db_name}?connection_limit=3"
    PUBSUB_EXTRACT_TOPIC          = google_pubsub_topic.extract.name
    PUBSUB_EXTRACT_FANOUT_TOPIC   = google_pubsub_topic.extract_fanout.name
    PUBSUB_EMBED_TOPIC            = google_pubsub_topic.embed.name
    PUBSUB_PREVIEW_TOPIC          = google_pubsub_topic.preview.name
    PUBSUB_OCR_TOPIC              = google_pubsub_topic.ocr.name
  })
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_cloud_run_v2_service" "web" {
  name     = "allybi-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.web.email
    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }
    containers {
      image = var.web_image
    }
  }
}

resource "google_cloud_run_v2_service" "api" {
  name     = "allybi-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.api.email
    scaling {
      min_instance_count = 1
      max_instance_count = 20
    }
    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
    containers {
      image = var.api_image
      ports {
        container_port = 8080
      }
      dynamic "env" {
        for_each = local.api_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env_map
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "admin" {
  name     = "allybi-admin"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.admin.email
    scaling {
      min_instance_count = 1
      max_instance_count = 5
    }
    containers {
      image = var.admin_image
      dynamic "env" {
        for_each = var.admin_plain_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "doc_worker" {
  name     = "allybi-doc-worker"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.worker.email
    scaling {
      min_instance_count = 1
      max_instance_count = 50
    }
    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
    containers {
      image = var.worker_image
      command = ["node"]
      args    = ["dist/workers/gcp-pubsub-worker.js"]
      ports {
        container_port = 8080
      }
      dynamic "env" {
        for_each = local.worker_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env_map
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "fanout_worker" {
  name     = "allybi-fanout-worker"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.worker.email
    scaling {
      min_instance_count = 1
      max_instance_count = 20
    }
    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
    containers {
      image = var.worker_image
      command = ["node"]
      args    = ["dist/workers/gcp-pubsub-fanout-worker.js"]
      ports {
        container_port = 8080
      }
      dynamic "env" {
        for_each = local.worker_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env_map
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_service_iam_member" "doc_worker_invoker" {
  location = google_cloud_run_v2_service.doc_worker.location
  project  = var.project_id
  service  = google_cloud_run_v2_service.doc_worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_push.email}"
}

resource "google_cloud_run_service_iam_member" "fanout_worker_invoker" {
  location = google_cloud_run_v2_service.fanout_worker.location
  project  = var.project_id
  service  = google_cloud_run_v2_service.fanout_worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_push.email}"
}

resource "google_pubsub_subscription" "extract_push" {
  name  = "${local.prefix}-extract-push"
  topic = google_pubsub_topic.extract.name

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.doc_worker.uri}/pubsub/extract"
    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
      audience              = "${google_cloud_run_v2_service.doc_worker.uri}/pubsub/extract"
    }
  }

  ack_deadline_seconds = 600
}

resource "google_pubsub_subscription" "extract_fanout_push" {
  name  = "${local.prefix}-extract-fanout-push"
  topic = google_pubsub_topic.extract_fanout.name

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.fanout_worker.uri}/pubsub/extract-fanout"
    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
      audience              = "${google_cloud_run_v2_service.fanout_worker.uri}/pubsub/extract-fanout"
    }
  }

  ack_deadline_seconds = 60
}
