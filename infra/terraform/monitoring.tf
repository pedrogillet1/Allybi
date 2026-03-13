resource "google_monitoring_uptime_check_config" "public_web" {
  display_name = "${local.prefix} public web"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path = "/"
    port = 443
    use_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = "allybi.co"
      project_id = var.project_id
    }
  }
}

resource "google_monitoring_uptime_check_config" "api_ready" {
  display_name = "${local.prefix} api ready"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path    = "/ready"
    port    = 443
    use_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = "allybi.co"
      project_id = var.project_id
    }
  }
}
