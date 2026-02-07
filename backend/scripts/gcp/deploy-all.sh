#!/usr/bin/env bash
set -euo pipefail

# Deploy "everything" needed for GCP document processing:
# - Enable required APIs
# - Create Pub/Sub topics (extract/embed/preview/ocr)
# - Deploy Cloud Run Pub/Sub push worker (extract consumer)
# - Create/refresh a push subscription for extract topic -> worker endpoint
#
# This script is safe to re-run.
#
# Required env vars:
# - GCP_PROJECT_ID
# - GCP_REGION (e.g. us-central1)
#
# Optional:
# - WORKER_SERVICE_NAME (default: koda-doc-worker)
# - PUBSUB_EXTRACT_TOPIC (default: koda-doc-extract)
# - PUBSUB_EXTRACT_SUBSCRIPTION (default: koda-doc-extract-push)
# - PUBSUB_EMBED_TOPIC (default: koda-doc-embed)
# - PUBSUB_PREVIEW_TOPIC (default: koda-doc-preview)
# - PUBSUB_OCR_TOPIC (default: koda-doc-ocr)
# - WORKER_ENV_VARS_FILE (path to a Cloud Run --env-vars-file YAML for the worker)
# - CLOUD_RUN_TIMEOUT (e.g. 900s)
# - CLOUD_RUN_SERVICE_ACCOUNT (service account for the Cloud Run worker runtime)
#
# Security (recommended):
# - PUSH_AUTH_SA_EMAIL (service account email used by Pub/Sub push to call Cloud Run with OIDC)
#   If set, Cloud Run will be deployed with --no-allow-unauthenticated and IAM will grant invoker to that SA.
# - If PUSH_AUTH_SA_EMAIL is unset, this script will default to creating/using:
#   pubsub-push@${GCP_PROJECT_ID}.iam.gserviceaccount.com

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${WORKER_SERVICE_NAME:-koda-doc-worker}"
AR_REPO="${AR_REPO:-koda}"
CLOUD_BUILD_MACHINE_TYPE="${CLOUD_BUILD_MACHINE_TYPE:-e2-highcpu-8}"
CLOUD_BUILD_SKIP="${CLOUD_BUILD_SKIP:-false}"
CLOUD_RUN_TIMEOUT="${CLOUD_RUN_TIMEOUT:-900s}"
CLOUD_RUN_SERVICE_ACCOUNT="${CLOUD_RUN_SERVICE_ACCOUNT:-}"
WORKER_ENV_VARS_FILE="${WORKER_ENV_VARS_FILE:-}"

TOPIC_EXTRACT="${PUBSUB_EXTRACT_TOPIC:-koda-doc-extract}"
TOPIC_EMBED="${PUBSUB_EMBED_TOPIC:-koda-doc-embed}"
TOPIC_PREVIEW="${PUBSUB_PREVIEW_TOPIC:-koda-doc-preview}"
TOPIC_OCR="${PUBSUB_OCR_TOPIC:-koda-doc-ocr}"

SUB_EXTRACT="${PUBSUB_EXTRACT_SUBSCRIPTION:-koda-doc-extract-push}"

PUSH_AUTH_SA_EMAIL="${PUSH_AUTH_SA_EMAIL:-pubsub-push@${PROJECT_ID}.iam.gserviceaccount.com}"

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

echo "[2/6] Ensuring topics exist..."
for TOPIC in "${TOPIC_EXTRACT}" "${TOPIC_EMBED}" "${TOPIC_PREVIEW}" "${TOPIC_OCR}"; do
  if ! gcloud pubsub topics describe "${TOPIC}" >/dev/null 2>&1; then
    gcloud pubsub topics create "${TOPIC}" >/dev/null
  fi
done

echo "[3/6] Deploying Cloud Run worker (${SERVICE_NAME})..."
ALLOW_FLAG="--no-allow-unauthenticated"

echo "Ensuring Pub/Sub push service account exists (${PUSH_AUTH_SA_EMAIL})..."
if ! gcloud iam service-accounts describe "${PUSH_AUTH_SA_EMAIL}" >/dev/null 2>&1; then
  SA_NAME="pubsub-push"
  gcloud iam service-accounts create "${SA_NAME}" --display-name="Pub/Sub push invoker" >/dev/null
fi

if [[ -z "${WORKER_ENV_VARS_FILE}" ]]; then
  # Generate a minimal env-vars file from backend/.env for the worker to boot.
  # Cloud Run workers run the same codebase and currently require the same core env vars
  # as the API config loader (even if some aren't used by document processing).
  if [[ ! -f ".env" ]]; then
    echo "Missing backend/.env and WORKER_ENV_VARS_FILE not set. Aborting."
    exit 1
  fi

  WORKER_ENV_VARS_FILE="$(mktemp -t koda-worker-env.XXXXXX.yaml)"
  trap 'rm -f "${WORKER_ENV_VARS_FILE}"' EXIT

  # Allowed keys: keep to boot-critical + doc-processing + worker routing.
  awk -F= '
    function ltrim(s){sub(/^[ \t\r\n]+/, "", s); return s}
    function rtrim(s){sub(/[ \t\r\n]+$/, "", s); return s}
    function trim(s){return rtrim(ltrim(s))}
    function strip_quotes(s){
      s=trim(s);
      if ((substr(s,1,1)=="\"" && substr(s,length(s),1)=="\"") || (substr(s,1,1)=="\x27" && substr(s,length(s),1)=="\x27")) {
        return substr(s,2,length(s)-2);
      }
      return s;
    }
    function yaml_escape_single(s){gsub(/\x27/, "\x27\x27", s); return s}
    function allowed(k){
      # NOTE: Cloud Run reserves PORT. Do not set it.
      return (k ~ /^(NODE_ENV|DATABASE_URL|DIRECT_DATABASE_URL|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_CALLBACK_URL|GOOGLE_AUTH_CALLBACK_URL|GOOGLE_GMAIL_CALLBACK_URL|FRONTEND_URL|ENCRYPTION_KEY|KODA_KEY_PROVIDER|KODA_MASTER_KEY_BASE64|KODA_KMS_KEY_ID|GCS_BUCKET_NAME|GCS_PROJECT_ID|GCS_KEY_FILE|GOOGLE_APPLICATION_CREDENTIALS|OPENAI_API_KEY|GEMINI_API_KEY|MISTRAL_API_KEY|CLAUDE_API_KEY|PINECONE_API_KEY|PINECONE_INDEX_NAME|CLOUDCONVERT_API_KEY|REDIS_URL|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|WORKER_CONCURRENCY|USE_GCP_WORKERS|GCP_PROJECT_ID|PUBSUB_EXTRACT_TOPIC|PUBSUB_EMBED_TOPIC|PUBSUB_PREVIEW_TOPIC|PUBSUB_OCR_TOPIC|STORAGE_PROVIDER|LOCAL_STORAGE_PATH|AWS_REGION|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_S3_BUCKET|AWS_S3_ENDPOINT|AWS_S3_FORCE_PATH_STYLE|S3_ENDPOINT|S3_FORCE_PATH_STYLE|S3_MAX_SOCKETS|S3_CONNECTION_TIMEOUT_MS|S3_SOCKET_TIMEOUT_MS|S3_PRESIGN_EXPIRES)$/);
    }
    /^[ \t]*#/ { next }
    /^[ \t]*$/ { next }
    NF < 2 { next }
    {
      key=trim($1);
      val=substr($0, index($0, "=")+1);
      if (!allowed(key)) next;
      val=strip_quotes(val);
      # Skip multiline/private keys (not supported in this simple parser).
      if (val ~ /\\n/ || val ~ /\r/ || val ~ /\n/) next;
      val=yaml_escape_single(val);
      if (val == "") {
        printf("%s: \"\"\n", key);
      } else {
        printf("%s: \x27%s\x27\n", key, val);
      }
    }
  ' .env > "${WORKER_ENV_VARS_FILE}"

  # NOTE: Do not append additional keys here; keep file deterministic and avoid duplicates.
fi

echo "Ensuring Artifact Registry repo exists (${AR_REPO})..."
if ! gcloud artifacts repositories describe "${AR_REPO}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPO}" --repository-format=docker --location "${REGION}" >/dev/null
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:latest"

echo "Building image with Cloud Build..."
if [[ "${CLOUD_BUILD_SKIP}" == "true" ]]; then
  echo "Skipping Cloud Build (CLOUD_BUILD_SKIP=true)."
else
  gcloud builds submit . \
    --region "${REGION}" \
    --machine-type "${CLOUD_BUILD_MACHINE_TYPE}" \
    --config cloudbuild.gcp-pubsub-worker.yaml \
    --substitutions "_IMAGE=${IMAGE}" >/dev/null
fi

echo "Deploying Cloud Run service..."
gcloud run deploy "${SERVICE_NAME}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  ${ALLOW_FLAG} \
  ${CLOUD_RUN_SERVICE_ACCOUNT:+--service-account "${CLOUD_RUN_SERVICE_ACCOUNT}"} \
  --env-vars-file "${WORKER_ENV_VARS_FILE}" \
  --timeout "${CLOUD_RUN_TIMEOUT}" \
  --port 8080 >/dev/null

WORKER_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')"
PUSH_ENDPOINT="${WORKER_URL}/pubsub/extract"
echo "Worker URL: ${WORKER_URL}"
echo "Push endpoint: ${PUSH_ENDPOINT}"

echo "[4/6] Granting Cloud Run invoker to ${PUSH_AUTH_SA_EMAIL}..."
gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --region "${REGION}" \
  --member "serviceAccount:${PUSH_AUTH_SA_EMAIL}" \
  --role "roles/run.invoker" >/dev/null

echo "[5/6] Creating/updating push subscription (${SUB_EXTRACT})..."
if gcloud pubsub subscriptions describe "${SUB_EXTRACT}" >/dev/null 2>&1; then
  gcloud pubsub subscriptions delete "${SUB_EXTRACT}" >/dev/null
fi

# Secure default: Pub/Sub uses OIDC token for Cloud Run.
gcloud pubsub subscriptions create "${SUB_EXTRACT}" \
  --topic "${TOPIC_EXTRACT}" \
  --push-endpoint "${PUSH_ENDPOINT}" \
  --push-auth-service-account "${PUSH_AUTH_SA_EMAIL}" \
  --push-auth-token-audience "${PUSH_ENDPOINT}" \
  --ack-deadline 600 >/dev/null

echo "[6/6] Output: backend env vars to set on your API server (VPS/Cloud Run API)..."
cat <<EOF

USE_GCP_WORKERS=true
GCP_PROJECT_ID=${PROJECT_ID}
PUBSUB_EXTRACT_TOPIC=${TOPIC_EXTRACT}
PUBSUB_EMBED_TOPIC=${TOPIC_EMBED}
PUBSUB_PREVIEW_TOPIC=${TOPIC_PREVIEW}
PUBSUB_OCR_TOPIC=${TOPIC_OCR}

EOF

echo "Done."
