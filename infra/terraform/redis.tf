resource "google_redis_instance" "cache" {
  name               = "${local.prefix}-redis"
  tier               = "STANDARD_HA"
  memory_size_gb     = 1
  region             = var.region
  redis_version      = "REDIS_7_2"
  authorized_network = google_compute_network.main.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
}
