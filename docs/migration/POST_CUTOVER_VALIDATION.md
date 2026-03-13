# Post-Cutover Validation

## Public Paths
- `allybi.co` loads frontend.
- `www.allybi.co` behaves identically.
- `app.allybi.co` redirects to `allybi.co`.
- `allybi.co/api/health` and `/ready` respond as expected.

## Admin Paths
- `admin.allybi.co` requires IAP.
- Admin login and token refresh work.
- Admin telemetry and analytics endpoints work without `X-KODA-ADMIN-KEY`.

## Document Flow
- Signed upload URL generation works.
- Browser direct upload to GCS works.
- Metadata persists in Cloud SQL.
- Pub/Sub delivery succeeds.
- Worker processing completes.
- Resulting document state is visible in app.

## Realtime
- Socket.IO connects via `/socket.io`.
- User room joins succeed.
- Cross-instance event delivery works with Redis adapter.

## Security
- Cloud Armor returns expected rate-limit behavior.
- Public admin access without IAP is blocked.
- Secret Manager bootstrap succeeds at runtime.
- KMS-backed paths operate without falling back unexpectedly.

## Observability
- Uptime checks green.
- Cloud Run error rates within baseline.
- Cloud SQL connections stable.
- Worker logs show successful authenticated Pub/Sub delivery.
