#!/usr/bin/env bash
set -euo pipefail

# Deploy the document-processing worker tier for a GCP-first production stack:
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
EXTRACT_SERVICE_NAME="${WORKER_SERVICE_NAME:-koda-doc-worker}"
FANOUT_SERVICE_NAME="${WORKER_FANOUT_SERVICE_NAME:-${EXTRACT_SERVICE_NAME}-fanout}"
AR_REPO="${AR_REPO:-koda}"
CLOUD_BUILD_MACHINE_TYPE="${CLOUD_BUILD_MACHINE_TYPE:-e2-highcpu-8}"
CLOUD_BUILD_SKIP="${CLOUD_BUILD_SKIP:-false}"
CLOUD_RUN_TIMEOUT="${CLOUD_RUN_TIMEOUT:-900s}"
CLOUD_RUN_SERVICE_ACCOUNT="${CLOUD_RUN_SERVICE_ACCOUNT:-}"
WORKER_ENV_VARS_FILE="${WORKER_ENV_VARS_FILE:-}"

# Cloud SQL connection hygiene for serverless workers:
# The backend `.env` may be tuned for a long-running API process, but Cloud Run
# scales by instance count. Keep per-instance Prisma pools small to avoid
# exhausting Cloud SQL connections (which causes "slow" / stuck processing).
CLOUD_RUN_DB_CONNECTION_LIMIT="${CLOUD_RUN_DB_CONNECTION_LIMIT:-3}"

# Cloud Run performance tuning (defaults optimized for "instant start" + throughput).
# Heavy extract worker: keep concurrency low; scale-out via max instances.
CLOUD_RUN_MIN_INSTANCES_EXTRACT="${CLOUD_RUN_MIN_INSTANCES_EXTRACT:-1}"
CLOUD_RUN_MAX_INSTANCES_EXTRACT="${CLOUD_RUN_MAX_INSTANCES_EXTRACT:-100}"
CLOUD_RUN_CONCURRENCY_EXTRACT="${CLOUD_RUN_CONCURRENCY_EXTRACT:-1}"
CLOUD_RUN_CPU_EXTRACT="${CLOUD_RUN_CPU_EXTRACT:-2}"
CLOUD_RUN_MEMORY_EXTRACT="${CLOUD_RUN_MEMORY_EXTRACT:-4Gi}"
CLOUD_RUN_CPU_BOOST_EXTRACT="${CLOUD_RUN_CPU_BOOST_EXTRACT:-true}"

# Fanout worker: CPU-light; high concurrency for fast publish fanout.
CLOUD_RUN_MIN_INSTANCES_FANOUT="${CLOUD_RUN_MIN_INSTANCES_FANOUT:-1}"
CLOUD_RUN_MAX_INSTANCES_FANOUT="${CLOUD_RUN_MAX_INSTANCES_FANOUT:-20}"
CLOUD_RUN_CONCURRENCY_FANOUT="${CLOUD_RUN_CONCURRENCY_FANOUT:-80}"
CLOUD_RUN_CPU_FANOUT="${CLOUD_RUN_CPU_FANOUT:-1}"
CLOUD_RUN_MEMORY_FANOUT="${CLOUD_RUN_MEMORY_FANOUT:-512Mi}"
CLOUD_RUN_CPU_BOOST_FANOUT="${CLOUD_RUN_CPU_BOOST_FANOUT:-true}"

TOPIC_EXTRACT="${PUBSUB_EXTRACT_TOPIC:-koda-doc-extract}"
TOPIC_EXTRACT_FANOUT="${PUBSUB_EXTRACT_FANOUT_TOPIC:-koda-doc-extract-fanout}"
TOPIC_EMBED="${PUBSUB_EMBED_TOPIC:-koda-doc-embed}"
TOPIC_PREVIEW="${PUBSUB_PREVIEW_TOPIC:-koda-doc-preview}"
TOPIC_OCR="${PUBSUB_OCR_TOPIC:-koda-doc-ocr}"

SUB_EXTRACT="${PUBSUB_EXTRACT_SUBSCRIPTION:-koda-doc-extract-push}"
SUB_EXTRACT_FANOUT="${PUBSUB_EXTRACT_FANOUT_SUBSCRIPTION:-koda-doc-extract-fanout-push}"

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
for TOPIC in "${TOPIC_EXTRACT}" "${TOPIC_EXTRACT_FANOUT}" "${TOPIC_EMBED}" "${TOPIC_PREVIEW}" "${TOPIC_OCR}"; do
  if ! gcloud pubsub topics describe "${TOPIC}" >/dev/null 2>&1; then
    gcloud pubsub topics create "${TOPIC}" >/dev/null
  fi
done

echo "[3/6] Deploying Cloud Run workers (${EXTRACT_SERVICE_NAME} + ${FANOUT_SERVICE_NAME})..."
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
  awk -F= -v WORKER_CONN_LIMIT="${CLOUD_RUN_DB_CONNECTION_LIMIT}" '
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
	      # IMPORTANT: Do NOT include GOOGLE_APPLICATION_CREDENTIALS here for Cloud Run.
	      # Cloud Run should use the runtime service account (ADC via metadata server).
	      return (k ~ /^(NODE_ENV|DATABASE_URL|DIRECT_DATABASE_URL|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_CALLBACK_URL|GOOGLE_AUTH_CALLBACK_URL|GOOGLE_GMAIL_CALLBACK_URL|FRONTEND_URL|ENCRYPTION_KEY|KODA_KEY_PROVIDER|KODA_MASTER_KEY_BASE64|KODA_USE_GCP_KMS|KODA_KMS_PROJECT_ID|KODA_KMS_LOCATION|KODA_KMS_KEY_RING|KODA_KMS_KEY|KODA_RUNTIME_ENV|KODA_SECRET_SOURCE|KODA_DB_MODE|KODA_REDIS_MODE|KODA_TLS_TERMINATION|GCS_BUCKET_NAME|GCS_PROJECT_ID|GCS_KEY_FILE|OPENAI_API_KEY|OPENAI_EMBEDDING_MODEL|OPENAI_EMBEDDING_DIMENSIONS|OPENAI_EMBEDDING_MAX_CHARS|OPENAI_EMBEDDING_MAX_BATCH_ITEMS|OPENAI_EMBEDDING_MAX_RETRIES|OPENAI_EMBEDDING_BACKOFF_BASE_MS|OPENAI_EMBEDDING_BACKOFF_MAX_MS|OPENAI_EMBEDDING_CACHE_ENABLED|EMBEDDING_CONCURRENCY|GEMINI_API_KEY|MISTRAL_API_KEY|CLAUDE_API_KEY|PINECONE_API_KEY|PINECONE_INDEX_NAME|CLOUDCONVERT_API_KEY|REDIS_URL|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|WORKER_CONCURRENCY|STORAGE_DOWNLOAD_CONCURRENCY|USE_GCP_WORKERS|GCP_PROJECT_ID|PUBSUB_EXTRACT_TOPIC|PUBSUB_EXTRACT_FANOUT_TOPIC|PUBSUB_EMBED_TOPIC|PUBSUB_PREVIEW_TOPIC|PUBSUB_OCR_TOPIC|PUBSUB_BATCH_MAX_MESSAGES|PUBSUB_BATCH_MAX_MS|PUBSUB_BATCH_MAX_BYTES|PUBSUB_PUBLISH_CONCURRENCY|PUBSUB_FANOUT_BATCH_SIZE|PUBSUB_FANOUT_PUBLISH_CONCURRENCY|STORAGE_PROVIDER|LOCAL_STORAGE_PATH|PRISMA_TRANSACTION_TIMEOUT)$/);
	    }
    /^[ \t]*#/ { next }
    /^[ \t]*$/ { next }
    NF < 2 { next }
    {
      key=trim($1);
      val=substr($0, index($0, "=")+1);
      if (!allowed(key)) next;
      val=strip_quotes(val);
      # Override Prisma pool size for workers regardless of local `.env`.
      if (key == "DATABASE_URL" || key == "DIRECT_DATABASE_URL") {
        if (val ~ /connection_limit=/) {
          gsub(/connection_limit=[0-9]+/, "connection_limit=" WORKER_CONN_LIMIT, val);
        } else if (index(val, "?") > 0) {
          val = val "&connection_limit=" WORKER_CONN_LIMIT;
        } else {
          val = val "?connection_limit=" WORKER_CONN_LIMIT;
        }
      }
      # Cloud Run workers should not rely on a local key file path.
      if (key == "GCS_KEY_FILE") val = "unused";
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

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${EXTRACT_SERVICE_NAME}:latest"

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

echo "Deploying Cloud Run extract worker (${EXTRACT_SERVICE_NAME})..."
CPU_BOOST_EXTRACT_FLAG=""
if [[ "${CLOUD_RUN_CPU_BOOST_EXTRACT}" == "true" ]]; then CPU_BOOST_EXTRACT_FLAG="--cpu-boost"; fi

gcloud run deploy "${EXTRACT_SERVICE_NAME}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  ${ALLOW_FLAG} \
  ${CLOUD_RUN_SERVICE_ACCOUNT:+--service-account "${CLOUD_RUN_SERVICE_ACCOUNT}"} \
  --clear-env-vars \
  --env-vars-file "${WORKER_ENV_VARS_FILE}" \
  --set-env-vars "KODA_RUNTIME_ROLE=pubsub-worker" \
  --timeout "${CLOUD_RUN_TIMEOUT}" \
  --port 8080 \
  --min-instances "${CLOUD_RUN_MIN_INSTANCES_EXTRACT}" \
  --max-instances "${CLOUD_RUN_MAX_INSTANCES_EXTRACT}" \
  --concurrency "${CLOUD_RUN_CONCURRENCY_EXTRACT}" \
  --cpu "${CLOUD_RUN_CPU_EXTRACT}" \
  --memory "${CLOUD_RUN_MEMORY_EXTRACT}" \
  ${CPU_BOOST_EXTRACT_FLAG} \
  --no-cpu-throttling >/dev/null

EXTRACT_URL="$(gcloud run services describe "${EXTRACT_SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')"
PUSH_ENDPOINT_EXTRACT="${EXTRACT_URL}/pubsub/extract"
echo "Extract worker URL: ${EXTRACT_URL}"
echo "Extract push endpoint: ${PUSH_ENDPOINT_EXTRACT}"

echo "Deploying Cloud Run fanout worker (${FANOUT_SERVICE_NAME})..."
CPU_BOOST_FANOUT_FLAG=""
if [[ "${CLOUD_RUN_CPU_BOOST_FANOUT}" == "true" ]]; then CPU_BOOST_FANOUT_FLAG="--cpu-boost"; fi

gcloud run deploy "${FANOUT_SERVICE_NAME}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  ${ALLOW_FLAG} \
  ${CLOUD_RUN_SERVICE_ACCOUNT:+--service-account "${CLOUD_RUN_SERVICE_ACCOUNT}"} \
  --clear-env-vars \
  --env-vars-file "${WORKER_ENV_VARS_FILE}" \
  --set-env-vars "KODA_RUNTIME_ROLE=pubsub-fanout-worker" \
  --timeout "${CLOUD_RUN_TIMEOUT}" \
  --port 8080 \
  --min-instances "${CLOUD_RUN_MIN_INSTANCES_FANOUT}" \
  --max-instances "${CLOUD_RUN_MAX_INSTANCES_FANOUT}" \
  --concurrency "${CLOUD_RUN_CONCURRENCY_FANOUT}" \
  --cpu "${CLOUD_RUN_CPU_FANOUT}" \
  --memory "${CLOUD_RUN_MEMORY_FANOUT}" \
  ${CPU_BOOST_FANOUT_FLAG} \
  --no-cpu-throttling \
  --command "node" \
  --args "dist/workers/gcp-pubsub-fanout-worker.js" >/dev/null

FANOUT_URL="$(gcloud run services describe "${FANOUT_SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')"
PUSH_ENDPOINT_FANOUT="${FANOUT_URL}/pubsub/extract-fanout"
echo "Fanout worker URL: ${FANOUT_URL}"
echo "Fanout push endpoint: ${PUSH_ENDPOINT_FANOUT}"

echo "[4/6] Granting Cloud Run invoker to ${PUSH_AUTH_SA_EMAIL}..."
for SVC in "${EXTRACT_SERVICE_NAME}" "${FANOUT_SERVICE_NAME}"; do
  gcloud run services add-iam-policy-binding "${SVC}" \
    --region "${REGION}" \
    --member "serviceAccount:${PUSH_AUTH_SA_EMAIL}" \
    --role "roles/run.invoker" >/dev/null
done

echo "[5/6] Creating/updating push subscriptions (${SUB_EXTRACT}, ${SUB_EXTRACT_FANOUT})..."
for SUB in "${SUB_EXTRACT}" "${SUB_EXTRACT_FANOUT}"; do
  if gcloud pubsub subscriptions describe "${SUB}" >/dev/null 2>&1; then
    gcloud pubsub subscriptions delete "${SUB}" >/dev/null
  fi
done

# Secure default: Pub/Sub uses OIDC token for Cloud Run.
gcloud pubsub subscriptions create "${SUB_EXTRACT_FANOUT}" \
  --topic "${TOPIC_EXTRACT_FANOUT}" \
  --push-endpoint "${PUSH_ENDPOINT_FANOUT}" \
  --push-auth-service-account "${PUSH_AUTH_SA_EMAIL}" \
  --push-auth-token-audience "${PUSH_ENDPOINT_FANOUT}" \
  --ack-deadline 60 >/dev/null

gcloud pubsub subscriptions create "${SUB_EXTRACT}" \
  --topic "${TOPIC_EXTRACT}" \
  --push-endpoint "${PUSH_ENDPOINT_EXTRACT}" \
  --push-auth-service-account "${PUSH_AUTH_SA_EMAIL}" \
  --push-auth-token-audience "${PUSH_ENDPOINT_EXTRACT}" \
  --ack-deadline 600 >/dev/null

echo "[6/6] Output: backend env vars to set on your Cloud Run API service..."
cat <<EOF

USE_GCP_WORKERS=true
GCP_PROJECT_ID=${PROJECT_ID}
PUBSUB_EXTRACT_TOPIC=${TOPIC_EXTRACT}
PUBSUB_EXTRACT_FANOUT_TOPIC=${TOPIC_EXTRACT_FANOUT}
PUBSUB_EMBED_TOPIC=${TOPIC_EMBED}
PUBSUB_PREVIEW_TOPIC=${TOPIC_PREVIEW}
PUBSUB_OCR_TOPIC=${TOPIC_OCR}

EOF

echo "Done."
