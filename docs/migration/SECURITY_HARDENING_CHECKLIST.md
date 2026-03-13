# Security Hardening Checklist

## Identity and Access
- Separate service accounts for web, api, admin, worker, and Pub/Sub push.
- No broad `Editor` role on runtime service accounts.
- IAP enabled for `admin.allybi.co` frontend and admin API backend.
- Legacy admin header key disabled in production.

## Secrets and Keys
- Secret Manager is the production source of truth.
- No production secret depends on VPS filesystem or `.env` only.
- KMS key ring and crypto keys created and access-limited.
- Rotation procedures documented for secrets and KMS keys.

## Data Services
- Cloud SQL private IP only.
- Cloud SQL backups and PITR enabled.
- Memorystore private connectivity only.
- GCS public access prevention enabled.
- GCS uniform bucket-level access enabled.

## Network and Edge
- Cloud Armor attached to public and admin backends.
- HTTP redirected to HTTPS at the LB.
- TLS terminated at Google LB, not in-app.
- Cloud Run ingress restricted to internal-and-LB traffic where appropriate.

## Application Runtime
- API containers do not start embedded background workers in production.
- Socket.IO uses Redis adapter for correctness across multiple instances.
- Health and readiness endpoints exposed.
- Admin access requires IAP when production identity provider is `iap`.

## Auditability
- Cloud audit logs enabled.
- Secret access logging reviewed.
- Cloud Armor logs enabled if cost budget allows.
- Production rollback path preserved until stability window completes.
