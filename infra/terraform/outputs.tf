output "load_balancer_ip" {
  value = google_compute_global_address.lb_ip.address
}

output "cloud_sql_private_ip" {
  value = google_sql_database_instance.postgres.private_ip_address
}

output "document_bucket" {
  value = google_storage_bucket.documents.name
}

output "api_service_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "admin_service_url" {
  value = google_cloud_run_v2_service.admin.uri
}
