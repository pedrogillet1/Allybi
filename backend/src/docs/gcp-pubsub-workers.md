## GCP Pub/Sub Workers (Production Setup)

### Why This Exists
When `USE_GCP_WORKERS=true`, the backend publishes document processing jobs to Pub/Sub.
You must also run a Pub/Sub consumer service (Cloud Run) to actually process those jobs.

This repo provides a Cloud Run push worker:
- `src/workers/gcp-pubsub-worker.ts`

It consumes `koda-doc-extract` messages and runs the same pipeline as the local BullMQ worker
(download -> extract -> chunk -> embed -> index -> preview -> ready).

### Architecture
1. Backend API receives upload completion.
2. Backend publishes an `extract` job to Pub/Sub topic `PUBSUB_EXTRACT_TOPIC` (default `koda-doc-extract`).
3. Pub/Sub push subscription delivers the message to Cloud Run worker `POST /pubsub/extract`.
4. Worker processes the document and updates Postgres status/stages.

### Required Services
- Pub/Sub topic: `koda-doc-extract` (or `PUBSUB_EXTRACT_TOPIC`)
- Pub/Sub push subscription -> Cloud Run URL `/pubsub/extract`
- Cloud Run worker service built from `Dockerfile.gcp-pubsub-worker`

### Required Environment Variables (Worker Service)
The worker must be able to access:
- Postgres (`DATABASE_URL`)
- Storage (recommended: GCS: `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_KEY_FILE` and/or `GOOGLE_APPLICATION_CREDENTIALS`)
- Legacy/optional: S3-compatible storage (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `S3_ENDPOINT`, `AWS_S3_FORCE_PATH_STYLE`)
- Embeddings + vector store (whatever your `vectorEmbeddingService` uses: `OPENAI_API_KEY` / `GEMINI_API_KEY` / `PINECONE_API_KEY` etc)
- Optional: Vision OCR (`GOOGLE_APPLICATION_CREDENTIALS` or other supported config)

At minimum, mirror the backend runtime env variables required for document processing.

### Backend Settings (VPS / API service)
Set:
- `USE_GCP_WORKERS=true`
- `GCP_PROJECT_ID=<your project>`
- `PUBSUB_EXTRACT_TOPIC=koda-doc-extract` (or your custom name)

If `GCP_WORKERS_STRICT` is not set to `false`, publishing errors will mark documents `failed`
instead of silently hanging.

### Deploy
From `backend/`:

```bash
export GCP_PROJECT_ID="your-project"
export GCP_REGION="us-central1"

# Optional (recommended for prod): Pub/Sub push uses OIDC to call Cloud Run.
# export PUSH_AUTH_SA_EMAIL="pubsub-push@your-project.iam.gserviceaccount.com"

./scripts/gcp/deploy-all.sh
```

Alternatively, just deploy the worker without wiring all topics:
- `scripts/gcp/deploy-pubsub-worker.sh`
