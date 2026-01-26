# Prisma Migration Guide for Koda

## Current State (as of 2026-01-12)

The project was previously using `prisma db push` which caused drift between the local schema and the remote RDS database. This guide documents how to properly handle migrations going forward.

## Environment Configuration

### Local Development
```bash
# Use local Postgres + Redis via Docker
docker compose -f docker-compose.dev.yml up -d

# Point to local database
cp .env.local .env
# OR manually set DATABASE_URL to localhost:5432
```

### Production (AWS RDS)
```bash
# Production DATABASE_URL points to RDS:
# postgresql://postgres:***@database-1.cvawagayikay.us-east-2.rds.amazonaws.com:5432/postgres
```

## Reconciling RDS Drift (One-Time Setup)

Since `db push` was previously used on RDS, we need to baseline the migrations to match the current database state.

### Step 1: Mark baseline as applied to RDS

Run this command with the production DATABASE_URL set:

```bash
# This tells Prisma "the baseline migration is already applied to this database"
DATABASE_URL="postgresql://postgres:MARKBILLZOE@database-1.cvawagayikay.us-east-2.rds.amazonaws.com:5432/postgres" \
npx prisma migrate resolve --applied 20260112102917_baseline_existing_schema
```

### Step 2: Verify migration status

```bash
DATABASE_URL="<production-url>" npx prisma migrate status
```

You should see the baseline migration marked as "Applied".

## Going Forward: Proper Migration Workflow

### 1. Always develop locally first

```bash
# Start local database
docker compose -f docker-compose.dev.yml up -d

# Create migration
npx prisma migrate dev --name your_migration_name

# This creates a migration file in prisma/migrations/
```

### 2. Commit migration files

```bash
git add prisma/migrations/
git commit -m "Add migration: your_migration_name"
git push
```

### 3. Deploy to production

On the VPS or in your CI/CD pipeline:

```bash
# Apply pending migrations to RDS
DATABASE_URL="<production-url>" npx prisma migrate deploy
```

## Important Rules

1. **NEVER use `prisma db push` on production**
   - `db push` doesn't create migration files
   - It causes drift that's hard to track
   - Only use for rapid local prototyping

2. **ALWAYS use `prisma migrate dev` locally**
   - Creates versioned migration files
   - Can be committed to git
   - Reproducible across environments

3. **ALWAYS use `prisma migrate deploy` in production**
   - Applies only pending migrations
   - Safe for production
   - Won't reset data

## New Fields Added: Preview PDF

The following fields were added to `DocumentMetadata` model:

```prisma
// PDF Preview Generation (for DOCX, XLSX, PPTX -> PDF conversion)
previewPdfStatus         String?   @default("pending") // pending, processing, ready, failed, skipped
previewPdfKey            String?   // S3 key for the converted PDF
previewPdfError          String?   // Error message if conversion failed
```

These fields are already in the RDS database (applied via `db push`), so the baseline migration includes them.

## Commands Reference

```bash
# Create new migration (local dev)
npx prisma migrate dev --name <name>

# Apply migrations (production)
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Generate Prisma Client after schema changes
npx prisma generate

# View migration diff
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

# Mark migration as already applied (drift reconciliation)
npx prisma migrate resolve --applied <migration_name>
```

## Troubleshooting

### "Drift detected" error
This means the database schema doesn't match migration history. Options:
1. Create a new baseline migration
2. Use `prisma migrate resolve --rolled-back <migration>` to mark as rolled back
3. Manually reconcile with `prisma migrate diff`

### "Migration failed" error
Check the specific SQL that failed and manually fix the database if needed, then mark as applied:
```bash
npx prisma migrate resolve --applied <failed_migration>
```
