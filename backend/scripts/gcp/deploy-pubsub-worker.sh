#!/usr/bin/env bash
set -euo pipefail

# Deprecated wrapper for the hardened worker deploy.
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/deploy-all.sh"
