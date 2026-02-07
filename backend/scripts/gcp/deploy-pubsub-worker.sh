#!/usr/bin/env bash
set -euo pipefail

# Deploy the Pub/Sub push worker to Cloud Run and wire Pub/Sub.
#
# Required env vars:
# - GCP_PROJECT_ID
# - GCP_REGION (e.g. us-central1)
# - WORKER_SERVICE_NAME (e.g. koda-doc-worker)
# - PUBSUB_EXTRACT_TOPIC (default: koda-doc-extract)
# - PUBSUB_EXTRACT_SUBSCRIPTION (default: koda-doc-extract-push)
#
# Optional:
# - PUBSUB_PUSH_SECRET (if set, worker expects header x-koda-worker-secret)
#
# You must be logged into gcloud with permissions to:
# - run.admin, pubsub.admin, iam.serviceAccountUser

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${WORKER_SERVICE_NAME:-koda-doc-worker}"
TOPIC="${PUBSUB_EXTRACT_TOPIC:-koda-doc-extract}"
SUB="${PUBSUB_EXTRACT_SUBSCRIPTION:-koda-doc-extract-push}"
AR_REPO="${AR_REPO:-koda}"
CLOUD_BUILD_MACHINE_TYPE="${CLOUD_BUILD_MACHINE_TYPE:-e2-highcpu-8}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Missing GCP_PROJECT_ID"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${BACKEND_DIR}"

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "[1/6] Enabling APIs..."
gcloud services enable run.googleapis.com pubsub.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com >/dev/null

echo "[2/6] Ensuring Artifact Registry repo exists (${AR_REPO})..."
if ! gcloud artifacts repositories describe "${AR_REPO}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPO}" --repository-format=docker --location "${REGION}" >/dev/null
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:latest"

echo "[3/6] Building image with Cloud Build..."
gcloud builds submit . \
  --region "${REGION}" \
  --machine-type "${CLOUD_BUILD_MACHINE_TYPE}" \
  --config cloudbuild.gcp-pubsub-worker.yaml \
  --substitutions "_IMAGE=${IMAGE}" >/dev/null

echo "[4/6] Deploying Cloud Run service (${SERVICE_NAME})..."
gcloud run deploy "${SERVICE_NAME}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --allow-unauthenticated \
  --port 8080 >/dev/null

WORKER_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')"
PUSH_ENDPOINT="${WORKER_URL}/pubsub/extract"
echo "Worker URL: ${WORKER_URL}"
echo "Push endpoint: ${PUSH_ENDPOINT}"

echo "[5/6] Ensuring topic exists..."
if ! gcloud pubsub topics describe "${TOPIC}" >/dev/null 2>&1; then
  gcloud pubsub topics create "${TOPIC}" >/dev/null
fi

echo "[6/6] Creating/updating push subscription..."
if gcloud pubsub subscriptions describe "${SUB}" >/dev/null 2>&1; then
  gcloud pubsub subscriptions delete "${SUB}" >/dev/null
fi

if [[ -n "${PUBSUB_PUSH_SECRET:-}" ]]; then
  # Note: Pub/Sub doesn't support custom headers via gcloud flags in all versions.
  # If you need header-based auth, set PUBSUB_PUSH_SECRET and use a proxy / Cloud Run auth instead.
  echo "PUBSUB_PUSH_SECRET is set, but Pub/Sub push custom headers may not be supported via gcloud in your environment."
  echo "Recommended: keep --allow-unauthenticated and rely on Cloud Run IAM (OIDC) instead, or remove PUBSUB_PUSH_SECRET."
fi

gcloud pubsub subscriptions create "${SUB}" \
  --topic "${TOPIC}" \
  --push-endpoint "${PUSH_ENDPOINT}" \
  --ack-deadline 600 >/dev/null

echo "Done."
