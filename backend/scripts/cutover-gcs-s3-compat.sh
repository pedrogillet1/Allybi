#!/usr/bin/env bash
set -euo pipefail

# Cut over Koda storage from AWS S3 to Google Cloud Storage via S3-compatible XML API.
# This keeps current S3-based code paths while moving data path fully into GCP.

usage() {
  cat <<'EOF'
Usage:
  ./scripts/cutover-gcs-s3-compat.sh \
    --project-id <gcp-project-id> \
    --backend-service <cloud-run-backend-service> \
    --runtime-sa <runtime-service-account-email> \
    [--region us-central1] \
    [--bucket koda-user-file-gcs] \
    [--workers koda-extract-worker,koda-embed-worker,koda-preview-worker,koda-ocr-worker] \
    [--origins https://app.example.com,http://localhost:3000] \
    [--secret-access-id-name koda-s3-access-id] \
    [--secret-access-key-name koda-s3-secret] \
    [--skip-build-workers]

Notes:
  - If --origins is omitted, CORS step is skipped.
  - Script creates HMAC keys for --runtime-sa and stores them in Secret Manager.
  - If secrets already exist, a new secret version is added.
EOF
}

PROJECT_ID=""
REGION="us-central1"
BUCKET="koda-user-file-gcs"
BACKEND_SERVICE=""
RUNTIME_SA=""
WORKERS="koda-extract-worker,koda-embed-worker,koda-preview-worker,koda-ocr-worker"
ORIGINS=""
ACCESS_ID_SECRET_NAME="koda-s3-access-id"
ACCESS_KEY_SECRET_NAME="koda-s3-secret"
SKIP_BUILD_WORKERS="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id) PROJECT_ID="${2:-}"; shift 2 ;;
    --region) REGION="${2:-}"; shift 2 ;;
    --bucket) BUCKET="${2:-}"; shift 2 ;;
    --backend-service) BACKEND_SERVICE="${2:-}"; shift 2 ;;
    --runtime-sa) RUNTIME_SA="${2:-}"; shift 2 ;;
    --workers) WORKERS="${2:-}"; shift 2 ;;
    --origins) ORIGINS="${2:-}"; shift 2 ;;
    --secret-access-id-name) ACCESS_ID_SECRET_NAME="${2:-}"; shift 2 ;;
    --secret-access-key-name) ACCESS_KEY_SECRET_NAME="${2:-}"; shift 2 ;;
    --skip-build-workers) SKIP_BUILD_WORKERS="true"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PROJECT_ID" || -z "$BACKEND_SERVICE" || -z "$RUNTIME_SA" ]]; then
  echo "Missing required arguments." >&2
  usage
  exit 1
fi

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required."; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Config"
echo "PROJECT_ID=$PROJECT_ID"
echo "REGION=$REGION"
echo "BUCKET=$BUCKET"
echo "BACKEND_SERVICE=$BACKEND_SERVICE"
echo "RUNTIME_SA=$RUNTIME_SA"
echo "WORKERS=$WORKERS"
echo "ACCESS_ID_SECRET_NAME=$ACCESS_ID_SECRET_NAME"
echo "ACCESS_KEY_SECRET_NAME=$ACCESS_KEY_SECRET_NAME"

echo "==> Enable required APIs"
gcloud services enable \
  storage.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  --project "$PROJECT_ID"

echo "==> Ensure bucket exists (gs://$BUCKET)"
if gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Bucket already exists."
else
  gcloud storage buckets create "gs://$BUCKET" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --uniform-bucket-level-access
fi

if [[ -n "$ORIGINS" ]]; then
  echo "==> Apply CORS"
  CORS_FILE="$(mktemp)"
  IFS=',' read -r -a ORIGIN_ARRAY <<< "$ORIGINS"

  {
    echo '['
    echo '  {'
    echo '    "origin": ['
    for i in "${!ORIGIN_ARRAY[@]}"; do
      suffix=","
      if [[ "$i" -eq "$((${#ORIGIN_ARRAY[@]} - 1))" ]]; then suffix=""; fi
      printf '      "%s"%s\n' "${ORIGIN_ARRAY[$i]}" "$suffix"
    done
    echo '    ],'
    echo '    "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],'
    echo '    "responseHeader": ["Content-Type", "ETag"],'
    echo '    "maxAgeSeconds": 3600'
    echo '  }'
    echo ']'
  } > "$CORS_FILE"

  gcloud storage buckets update "gs://$BUCKET" --project "$PROJECT_ID" --cors-file="$CORS_FILE"
  rm -f "$CORS_FILE"
else
  echo "==> Skipping CORS (no --origins provided)"
fi

echo "==> Create HMAC key for service account"
HMAC_JSON="$(gcloud storage hmac create "$RUNTIME_SA" --project "$PROJECT_ID" --format=json)"
ACCESS_ID="$(printf '%s' "$HMAC_JSON" | sed -n 's/.*"accessId":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
ACCESS_KEY="$(printf '%s' "$HMAC_JSON" | sed -n 's/.*"secret":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"

if [[ -z "$ACCESS_ID" || -z "$ACCESS_KEY" ]]; then
  echo "Failed to parse HMAC accessId/secret from gcloud output." >&2
  exit 1
fi

upsert_secret() {
  local secret_name="$1"
  local value="$2"
  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$secret_name" --data-file=- --project "$PROJECT_ID" >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$secret_name" --data-file=- --replication-policy="automatic" --project "$PROJECT_ID" >/dev/null
  fi
}

echo "==> Store HMAC credentials in Secret Manager"
upsert_secret "$ACCESS_ID_SECRET_NAME" "$ACCESS_ID"
upsert_secret "$ACCESS_KEY_SECRET_NAME" "$ACCESS_KEY"

COMMON_ENV="STORAGE_PROVIDER=s3,AWS_REGION=auto,AWS_S3_BUCKET=$BUCKET,AWS_S3_ENDPOINT=https://storage.googleapis.com,AWS_S3_FORCE_PATH_STYLE=true,GCS_BUCKET_NAME=$BUCKET,GCS_PROJECT_ID=$PROJECT_ID,GCS_KEY_FILE=unused"
SECRET_BINDINGS="AWS_ACCESS_KEY_ID=${ACCESS_ID_SECRET_NAME}:latest,AWS_SECRET_ACCESS_KEY=${ACCESS_KEY_SECRET_NAME}:latest"

echo "==> Update backend service env/secrets"
gcloud run services update "$BACKEND_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "$COMMON_ENV" \
  --set-secrets "$SECRET_BINDINGS"

if [[ "$SKIP_BUILD_WORKERS" != "true" ]]; then
  echo "==> Build/push worker images"
  (
    cd "$BACKEND_DIR"
    gcloud builds submit --project "$PROJECT_ID" --config workers_gcp/cloudbuild.yaml .
  )
else
  echo "==> Skipping worker image build"
fi

echo "==> Update worker services env/secrets"
IFS=',' read -r -a WORKER_ARRAY <<< "$WORKERS"
for worker_svc in "${WORKER_ARRAY[@]}"; do
  trimmed="$(echo "$worker_svc" | xargs)"
  [[ -z "$trimmed" ]] && continue
  echo "Updating $trimmed"
  gcloud run services update "$trimmed" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --update-env-vars "AWS_REGION=auto,AWS_S3_BUCKET=$BUCKET,AWS_S3_ENDPOINT=https://storage.googleapis.com,AWS_S3_FORCE_PATH_STYLE=true" \
    --set-secrets "$SECRET_BINDINGS"
done

echo "==> Done"
echo "Next checks:"
echo "1) Upload a small and large file from UI."
echo "2) Confirm objects appear under gs://$BUCKET/users/"
echo "3) Confirm worker logs show successful storage read/write."
