# GCP Target Architecture

## Component Diagram
- Hostinger:
  - Registrar and DNS only.
- Google Cloud edge:
  - Global external Application Load Balancer.
  - Google-managed TLS certificates.
  - Cloud Armor policy.
  - IAP on admin frontend and admin API backends.
- Cloud Run services:
  - `allybi-web`
  - `allybi-api`
  - `allybi-admin`
  - `allybi-doc-worker`
  - `allybi-fanout-worker`
  - Optional BullMQ worker services for `worker-document`, `worker-connectors`, `worker-edit`, `scheduler`.
- Stateful services:
  - Cloud SQL for Postgres.
  - Memorystore Redis for BullMQ and Socket.IO pub/sub.
  - Cloud Storage bucket for documents/blobs.
  - Secret Manager for non-key secrets.
  - Cloud KMS for key wrapping/CMEK roots.
- Messaging:
  - Pub/Sub topics and authenticated push subscriptions.
- Networking:
  - VPC, private service access, serverless VPC access connector, Cloud NAT.
- Monitoring:
  - Uptime checks, alert policies, logs, metrics.

## Trust Boundaries
- Public boundary:
  - `allybi.co` and `www.allybi.co`.
- Admin boundary:
  - `admin.allybi.co` behind IAP and backend RBAC.
- Service boundary:
  - Cloud Run services authenticated by service accounts.
- Private state boundary:
  - Cloud SQL and Memorystore on private IP only.
- Secret boundary:
  - Secret Manager for credentials, KMS for key-wrapping roots.

## Path and Host Routing Design
- `allybi.co`:
  - `/` -> `allybi-web`
  - `/api/*` -> `allybi-api`
  - `/socket.io/*` -> `allybi-api`
- `www.allybi.co`:
  - same as `allybi.co`
- `admin.allybi.co`:
  - `/` -> `allybi-admin` with IAP
  - `/api/*` -> `allybi-api` through an IAP-enabled backend service
- `app.allybi.co`:
  - 301 redirect to `allybi.co`

## Security Controls
- Cloud Armor on public backends with baseline WAF and IP-based throttling.
- IAP on admin frontend and admin API backend service.
- No production dependency on Basic Auth or `X-KODA-ADMIN-KEY`.
- Secret Manager as the production secret source.
- KMS-backed envelope key hierarchy.
- Cloud SQL encrypted connections only.
- GCS bucket with uniform bucket-level access, public access prevention, versioning, and CMEK.
- Least-privilege service accounts for each Cloud Run service.

## Service-to-Service Auth Model
- Browser to public services:
  - LB + TLS + Cloud Armor.
- Browser to admin:
  - LB + TLS + Cloud Armor + IAP.
- Cloud Run to Cloud SQL:
  - service account + Cloud SQL client + private connectivity.
- Cloud Run to Secret Manager:
  - service account + `secretAccessor`.
- Cloud Run to KMS:
  - service account + encrypt/decrypt roles.
- Pub/Sub to workers:
  - authenticated push with OIDC audience bound to worker endpoint.

## Sensitive Document Data Flow
1. Browser requests signed upload URL from `allybi-api`.
2. Browser uploads document directly to GCS.
3. API writes metadata to Cloud SQL and publishes Pub/Sub message.
4. Worker retrieves blob from GCS, processes extraction/chunking/encryption state, and writes results back to Cloud SQL and vector storage.
5. API emits progress to clients via Socket.IO backed by Redis adapter.
6. Admin access to sensitive document telemetry remains behind IAP plus backend admin authorization.
