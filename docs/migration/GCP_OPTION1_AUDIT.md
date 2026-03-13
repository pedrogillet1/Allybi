# GCP Option 1 Audit

## Executive Summary
Allybi is not currently a GCP-first managed production stack. The repo shows a hybrid topology:
- Public web and admin are still VPS/nginx-hosted.
- The backend still assumes a reverse-proxy-to-localhost deployment model.
- GCS and Pub/Sub are real integrations.
- Cloud Run exists only for document workers.
- Cloud SQL, Secret Manager, and KMS are partially wired in code, but not fully proven end to end.
- Cloud Armor, global load balancing, IAP-backed admin, and reproducible full-stack IaC are absent.

## Current Architecture Map
- Hostinger:
  - Domain registration and DNS.
  - Current runtime still points at VPS-hosted nginx.
- VPS:
  - `allybi.co` serves static frontend and proxies `/api` and `/socket.io` to `127.0.0.1:5000` in `deploy/nginx/allybi.co.conf`.
  - `admin.allybi.co` serves static admin, applies Basic Auth, injects `X-KODA-ADMIN-KEY`, and proxies to `127.0.0.1:5000` in `deploy/nginx/admin.allybi.co.conf`.
  - Manual root SSH deployment remains active in `deploy/deploy-admin.sh`.
- Google Cloud:
  - GCS is the active document/blob storage layer through `backend/src/config/storage.ts` and `backend/src/services/retrieval/gcsStorage.service.ts`.
  - Pub/Sub publishing is active via `backend/src/services/jobs/pubsubPublisher.service.ts`.
  - Cloud Run worker deployment exists in `backend/scripts/gcp/deploy-all.sh`.
  - Secret Manager bootstrap exists in `backend/src/bootstrap/secrets.ts`.
  - KMS-backed tenant key wrapping exists in `backend/src/services/security/keyManager.service.ts`.

## Scorecard
- Overall: `43/100`
- Security: `38/100`
- Deploy reproducibility: `25/100`
- Cloud alignment: `52/100`

Scoring basis:
- Strong points: GCS, Pub/Sub, production health endpoints, container-aware backend, existing Secret Manager/KMS code paths.
- Weak points: VPS is still the primary edge/runtime, no full IaC, weak admin edge controls, mixed Redis models, missing worker build targets, Cloud SQL only implied, no Cloud Armor/IAP/LB config.

## Top 15 Blockers
1. VPS/nginx is still the primary production entrypoint.
   - Evidence: `deploy/nginx/allybi.co.conf`, `deploy/nginx/admin.allybi.co.conf`.
2. Root-SSH deployment is still an active production flow.
   - Evidence: `deploy/deploy-admin.sh`.
3. Admin is protected by Basic Auth plus injected shared secret instead of strong identity.
   - Evidence: `deploy/nginx/admin.allybi.co.conf`, `frontend/src/services/adminApi.js`, `backend/src/middleware/adminKey.middleware.ts`.
4. Backend still assumes in-app TLS/certbot in production.
   - Evidence: `backend/src/config/ssl.config.ts`.
5. Cloud Run worker deploy references missing worker entrypoints.
   - Evidence: `backend/Dockerfile.gcp-pubsub-worker`, `backend/scripts/gcp/deploy-all.sh`, missing files under `backend/src/workers`.
6. API process still embeds workers and schedulers.
   - Evidence: `backend/src/server.ts`.
7. Socket.IO is single-process and not safe for multi-instance Cloud Run scaling.
   - Evidence: `backend/src/services/realtime/socketGateway.service.ts`, `backend/src/server.ts`.
8. Redis usage is split between BullMQ-style `REDIS_URL` and Upstash REST.
   - Evidence: `backend/src/queues/queueConfig.ts`, `backend/src/config/redis.ts`.
9. Cloud SQL is not explicitly wired; only `DATABASE_URL` is.
   - Evidence: `backend/src/config/env.ts`.
10. Secret Manager package dependency is missing.
    - Evidence: `backend/src/services/security/secretManager.service.ts`, `backend/package.json`.
11. KMS package dependency is missing.
    - Evidence: `backend/src/services/security/keyManager.service.ts`, `backend/package.json`.
12. Cloud Armor and global ALB are not represented in repo infrastructure.
    - Evidence: no Terraform or load balancer resources before this migration.
13. Compute Engine is not needed, but the repo was still behaving like a VM-first deployment.
    - Evidence: nginx configs, certbot assumptions, root SSH scripts.
14. `app.allybi.co` and legacy domains are handled at nginx, not at the managed edge.
    - Evidence: `deploy/nginx/allybi.co.conf`.
15. Production config defaults still assume same-host reverse proxy and non-managed edge routing.
    - Evidence: `frontend/src/services/runtimeConfig.js`, `backend/src/app.ts`.

## Exact Evidence
- VPS reverse proxy:
  - `deploy/nginx/allybi.co.conf`
  - `deploy/nginx/admin.allybi.co.conf`
- Manual deployment:
  - `deploy/deploy-admin.sh`
- Backend runtime coupling:
  - `backend/src/server.ts`
- Health/readiness surfaces:
  - `backend/src/entrypoints/http/routes/health.routes.ts`
- GCS integration:
  - `backend/src/config/storage.ts`
  - `backend/src/services/retrieval/gcsStorage.service.ts`
- Pub/Sub integration:
  - `backend/src/services/jobs/pubsubPublisher.service.ts`
  - `backend/scripts/gcp/deploy-all.sh`
- Secret bootstrap:
  - `backend/src/bootstrap/secrets.ts`
  - `backend/src/services/security/secretManager.service.ts`
- KMS path:
  - `backend/src/services/security/keyManager.service.ts`
- Redis mismatch:
  - `backend/src/config/redis.ts`
  - `backend/src/queues/queueConfig.ts`

## What Remains on Hostinger
- Registrar.
- DNS management.
- Temporary rollback DNS records during cutover.

## What Must Move to GCP
- Public web runtime.
- Public API runtime.
- Admin runtime.
- Worker runtime.
- Edge routing and TLS.
- WAF/rate protection.
- Admin perimeter identity control.
- Postgres hosting.
- Redis hosting.
- Secret storage.
- KMS root keys.
- Monitoring and alerting.

## Security Risks in the Current Hybrid Topology
- Shared admin secret propagation from nginx to backend.
- Public admin attack surface without IAP or equivalent strong identity.
- Manual VPS secret sprawl and certbot/file-path TLS assumptions.
- No reproducible environment parity for prod rebuilds.
- No managed edge WAF/rate control.
- Single-instance websocket correctness.
- Queue/realtime transport split across incompatible Redis modes.
