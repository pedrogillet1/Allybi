resource "google_compute_region_network_endpoint_group" "web" {
  name                  = "${local.prefix}-web-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.web.name
  }
}

resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "${local.prefix}-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_region_network_endpoint_group" "admin" {
  name                  = "${local.prefix}-admin-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.admin.name
  }
}

resource "google_compute_security_policy" "armor" {
  name = "${local.prefix}-armor"

  rule {
    action   = "allow"
    priority = "1000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  rule {
    action   = "throttle"
    priority = "2000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      rate_limit_threshold {
        count        = 300
        interval_sec = 60
      }
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
    }
  }
}

resource "google_compute_backend_service" "web" {
  name                  = "${local.prefix}-web-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.armor.id

  backend {
    group = google_compute_region_network_endpoint_group.web.id
  }
}

resource "google_compute_backend_service" "api_public" {
  name                  = "${local.prefix}-api-public-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.armor.id

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }
}

resource "google_compute_backend_service" "api_admin" {
  name                  = "${local.prefix}-api-admin-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.armor.id

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }

  iap {
    oauth2_client_id     = var.iap_oauth_client_id
    oauth2_client_secret = var.iap_oauth_client_secret
  }
}

resource "google_compute_backend_service" "admin_frontend" {
  name                  = "${local.prefix}-admin-frontend-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.armor.id

  backend {
    group = google_compute_region_network_endpoint_group.admin.id
  }

  iap {
    oauth2_client_id     = var.iap_oauth_client_id
    oauth2_client_secret = var.iap_oauth_client_secret
  }
}

resource "google_compute_managed_ssl_certificate" "main" {
  name = "${local.prefix}-cert"

  managed {
    domains = var.public_domains
  }
}

resource "google_compute_url_map" "https" {
  name            = "${local.prefix}-https-map"
  default_service = google_compute_backend_service.web.id

  host_rule {
    hosts        = ["allybi.co", "www.allybi.co"]
    path_matcher = "public-web"
  }

  host_rule {
    hosts        = ["admin.allybi.co"]
    path_matcher = "admin"
  }

  host_rule {
    hosts        = ["app.allybi.co"]
    path_matcher = "app-redirect"
  }

  path_matcher {
    name            = "public-web"
    default_service = google_compute_backend_service.web.id

    path_rule {
      paths   = ["/api", "/api/*", "/socket.io", "/socket.io/*"]
      service = google_compute_backend_service.api_public.id
    }
  }

  path_matcher {
    name            = "admin"
    default_service = google_compute_backend_service.admin_frontend.id

    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.api_admin.id
    }
  }

  path_matcher {
    name = "app-redirect"

    default_url_redirect {
      host_redirect          = "allybi.co"
      https_redirect         = true
      redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
      strip_query            = false
    }
  }
}

resource "google_compute_url_map" "http_redirect" {
  name = "${local.prefix}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_https_proxy" "https" {
  name             = "${local.prefix}-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.main.id]
}

resource "google_compute_target_http_proxy" "http" {
  name    = "${local.prefix}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_address" "lb_ip" {
  name = "${local.prefix}-lb-ip"
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${local.prefix}-https-forwarding"
  target                = google_compute_target_https_proxy.https.id
  port_range            = "443"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb_ip.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${local.prefix}-http-forwarding"
  target                = google_compute_target_http_proxy.http.id
  port_range            = "80"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb_ip.id
}
