# Rollback Plan

## Triggers
- Critical auth failure.
- Document upload or processing failure rate above threshold.
- Admin inaccessible through IAP.
- Severe Cloud SQL or Redis connectivity issues.
- Multi-instance realtime regressions.

## DNS Rollback
1. Restore Hostinger DNS snapshot.
2. Wait one TTL interval.
3. Confirm traffic returns to VPS fallback.

## Application Rollback
1. Roll back Cloud Run to prior healthy revisions.
2. If edge config is the issue, restore prior LB URL map/backend binding.
3. If IAP policy is the issue, restore prior access policy after logging the incident.

## Database Rollback
1. If schema-compatible, keep Cloud SQL and revert application traffic only.
2. If data integrity is at risk:
   - freeze writes,
   - restore from Cloud SQL backup/PITR,
   - validate row counts and key tables before reopening traffic.

## Storage Rollback
- Keep GCS as system of record during application rollback unless storage corruption is proven.
- Validate signed upload and object read paths before reopening traffic.

## Exit Criteria
- Public site healthy.
- Admin healthy.
- Upload/worker flow healthy.
- Realtime healthy.
- Error rate back within baseline.
