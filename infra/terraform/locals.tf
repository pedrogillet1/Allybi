locals {
  prefix = "allybi-${var.environment}"

  required_services = [
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com",
    "iap.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "networkconnectivity.googleapis.com",
    "pubsub.googleapis.com",
    "redis.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "vpcaccess.googleapis.com",
    "cloudkms.googleapis.com",
    "storage.googleapis.com",
  ]

  secret_env_map = {
    JWT_ACCESS_SECRET       = "JWT_ACCESS_SECRET"
    JWT_REFRESH_SECRET      = "JWT_REFRESH_SECRET"
    JWT_ADMIN_ACCESS_SECRET = "JWT_ADMIN_ACCESS_SECRET"
    JWT_ADMIN_REFRESH_SECRET = "JWT_ADMIN_REFRESH_SECRET"
    KODA_MASTER_KEY_BASE64  = "KODA_MASTER_KEY_BASE64"
    KODA_REFRESH_PEPPER     = "KODA_REFRESH_PEPPER"
    OPENAI_API_KEY          = "OPENAI_API_KEY"
    GEMINI_API_KEY          = "GEMINI_API_KEY"
    PINECONE_API_KEY        = "PINECONE_API_KEY"
    CLOUDCONVERT_API_KEY    = "CLOUDCONVERT_API_KEY"
    GOOGLE_CLIENT_SECRET    = "GOOGLE_CLIENT_SECRET"
    SENTRY_DSN              = "SENTRY_DSN"
  }
}
