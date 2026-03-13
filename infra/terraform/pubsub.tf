resource "google_pubsub_topic" "extract" {
  name = "${local.prefix}-doc-extract"
}

resource "google_pubsub_topic" "extract_fanout" {
  name = "${local.prefix}-doc-extract-fanout"
}

resource "google_pubsub_topic" "embed" {
  name = "${local.prefix}-doc-embed"
}

resource "google_pubsub_topic" "preview" {
  name = "${local.prefix}-doc-preview"
}

resource "google_pubsub_topic" "ocr" {
  name = "${local.prefix}-doc-ocr"
}
