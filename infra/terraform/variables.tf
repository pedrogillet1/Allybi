variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "billing_account" {
  type    = string
  default = ""
}

variable "artifact_registry_repo" {
  type    = string
  default = "allybi"
}

variable "web_image" {
  type = string
}

variable "api_image" {
  type = string
}

variable "admin_image" {
  type = string
}

variable "worker_image" {
  type = string
}

variable "public_domains" {
  type = list(string)
  default = [
    "allybi.co",
    "www.allybi.co",
    "admin.allybi.co",
    "app.allybi.co",
  ]
}

variable "legacy_redirect_domains" {
  type    = list(string)
  default = []
}

variable "db_name" {
  type    = string
  default = "allybi"
}

variable "db_user" {
  type    = string
  default = "allybi_app"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "secret_names" {
  type = list(string)
  default = [
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_ADMIN_ACCESS_SECRET",
    "JWT_ADMIN_REFRESH_SECRET",
    "KODA_MASTER_KEY_BASE64",
    "KODA_REFRESH_PEPPER",
    "KODA_ADMIN_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "PINECONE_API_KEY",
    "CLOUDCONVERT_API_KEY",
    "GOOGLE_CLIENT_SECRET",
    "SENTRY_DSN",
  ]
}

variable "api_plain_env" {
  type = map(string)
  default = {
    NODE_ENV                      = "production"
    KODA_RUNTIME_ROLE            = "api"
    KODA_RUNTIME_ENV             = "cloudrun"
    KODA_SECRET_SOURCE           = "secret-manager"
    KODA_DB_MODE                 = "cloud-sql-private-ip"
    KODA_REDIS_MODE              = "redis-url"
    KODA_TLS_TERMINATION         = "external-lb"
    KODA_ADMIN_IDENTITY_PROVIDER = "iap"
    KODA_ENABLE_SOCKET_REDIS_ADAPTER = "true"
    USE_GCP_WORKERS              = "true"
    STORAGE_PROVIDER             = "gcs"
  }
}

variable "worker_plain_env" {
  type = map(string)
  default = {
    NODE_ENV              = "production"
    KODA_RUNTIME_ENV      = "cloudrun"
    KODA_SECRET_SOURCE    = "secret-manager"
    KODA_DB_MODE          = "cloud-sql-private-ip"
    KODA_REDIS_MODE       = "redis-url"
    KODA_TLS_TERMINATION  = "external-lb"
    USE_GCP_WORKERS       = "true"
    STORAGE_PROVIDER      = "gcs"
  }
}

variable "web_plain_env" {
  type    = map(string)
  default = {}
}

variable "admin_plain_env" {
  type = map(string)
  default = {
    NODE_ENV = "production"
  }
}

variable "iap_oauth_client_id" {
  type = string
}

variable "iap_oauth_client_secret" {
  type      = string
  sensitive = true
}
