# Rollback Procedures

## Cloud Run Revision Rollback

```bash
# List recent revisions
gcloud run revisions list --service=koda-backend --region=us-central1

# Rollback to specific revision
gcloud run services update-traffic koda-backend \
  --to-revisions=REVISION_NAME=100 \
  --region=us-central1
```

## Database Migration Rollback

### Prisma Migration
```bash
# Revert last migration
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Reset to specific state (DESTRUCTIVE)
npx prisma migrate reset
```

### RLS Policy Rollback
```sql
-- Disable RLS (emergency)
ALTER TABLE "Document" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentMetadata" DISABLE ROW LEVEL SECURITY;
-- ... repeat for each table
```

## Key Rotation Rollback

1. Set `KODA_KEY_VERSION` back to previous version
2. Set `KODA_MASTER_KEY_BASE64` to previous key
3. Deploy updated config
4. Records encrypted with new key will need re-encryption back

## Feature Flag Rollback

```bash
# Disable field encryption
KODA_ENCRYPT_FIELDS=false

# Disable GCS encryption
KODA_ENCRYPT_GCS=false
```

## Emergency: Full Service Stop

```bash
# Scale to 0 instances
gcloud run services update koda-backend --max-instances=0 --region=us-central1

# Re-enable
gcloud run services update koda-backend --max-instances=10 --region=us-central1
```
