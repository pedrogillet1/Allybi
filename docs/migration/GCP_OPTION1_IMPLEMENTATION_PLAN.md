# GCP Option 1 Implementation Plan

## Phase Breakdown
1. Audit and freeze assumptions.
2. Add Terraform and runbooks.
3. Split runtime roles for Cloud Run.
4. Harden admin and secret handling.
5. Validate build/test/deploy wiring.
6. Execute manual cloud cutover.

## Exact Repo Changes
- Added Terraform under `infra/terraform` for:
  - networking
  - service accounts/IAM
  - Artifact Registry
  - Cloud Run services
  - Cloud SQL
  - Memorystore
  - GCS
  - Secret Manager
  - KMS
  - Pub/Sub
  - load balancer/serverless NEGs
  - Cloud Armor
  - monitoring
- Added container packaging:
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
  - `dashboard/Dockerfile`
- Added runtime-role and security code:
  - `backend/src/config/runtimeMode.ts`
  - `backend/src/middleware/iap.middleware.ts`
  - `backend/src/services/realtime/socketAdapter.service.ts`
  - `backend/src/runtime/backgroundHttp.ts`
  - `backend/src/workers/gcp-pubsub-worker.ts`
  - `backend/src/workers/gcp-pubsub-fanout-worker.ts`
- Updated existing runtime/config files:
  - `backend/src/server.ts`
  - `backend/src/config/env.ts`
  - `backend/src/config/redis.ts`
  - `backend/src/config/ssl.config.ts`
  - `backend/src/middleware/adminKey.middleware.ts`
  - `backend/src/admin/guards/requireAdmin.guard.ts`
  - `backend/src/entrypoints/http/routes/health.routes.ts`
  - `backend/src/app.ts`
  - `frontend/src/services/adminApi.js`
  - `frontend/src/services/runtimeConfig.js`
  - `backend/scripts/gcp/deploy-all.sh`
  - `backend/scripts/gcp/deploy-pubsub-worker.sh`
  - `backend/package.json`

## Dependencies Added
- `@google-cloud/secret-manager`
- `@google-cloud/kms`
- `@socket.io/redis-adapter`
- `google-auth-library`

## Risks
- Existing dirty worktree may contain unrelated runtime changes.
- IAP audience binding must match the final backend service IDs after Terraform apply.
- Cloud SQL and Redis private connectivity require correct VPC/PSA setup before runtime validation.
- Any remaining direct `KODA_MASTER_KEY_BASE64` call site still using local wrapping must be tracked during staging validation.

## Rollback
- Keep VPS read-only fallback for 24-72 hours.
- Roll back LB/DNS before changing Cloud SQL write ownership.
- Keep Cloud Run previous revisions available.
- Keep Terraform state separated by environment.

## Validation Commands
- `cd backend && npm install`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`
- `cd backend && npm test -- --runInBand`
- `cd frontend && npm run build`
- `cd dashboard && npm run check`
- `cd dashboard && npm run build`
- `cd infra/terraform && terraform fmt -check`

## Acceptance Criteria
- API can boot as `KODA_RUNTIME_ROLE=api` without embedded workers.
- Worker services boot from real files present in `dist/workers`.
- Production admin paths no longer require `X-KODA-ADMIN-KEY` when IAP mode is enabled.
- Socket.IO supports Redis adapter when `REDIS_URL` is set.
- Terraform defines the target production stack end to end.
- Hostinger is documented as DNS-only.
