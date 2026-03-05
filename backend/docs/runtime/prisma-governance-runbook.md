# Prisma Governance Runbook

## Scope

This runbook documents operational safeguards for Prisma schema/migrations and
the expected write boundaries for HTTP routes.

## CI Safety Controls

1. `npm run prisma:ci:policy:check` blocks forbidden CI commands:
   - `prisma db push`
   - `--accept-data-loss`
2. `npm run prisma:replay:check` enforces env preflight before migration replay.
3. `.github/workflows/prisma-migration-replay.yml` is the canonical replay gate.

## Route Write Boundary

1. Upload and document status transitions must go through
   `src/services/documents/documentUploadWrite.service.ts`.
2. Route handlers should not directly call `prisma.document.create*` or
   `prisma.document.update*`.
3. Route handlers should not directly call `prisma.documentMetadata.upsert` or
   `prisma.documentMetadata.update`; use the write service methods instead.

## Historical Migration Artifact

Two cloud integration migration folders exist:

1. `20251006005348_add_cloud_integrations` (empty historical artifact)
2. `20251006005424_add_cloud_integrations` (actual DDL migration)

The empty migration is retained as historical history and must not be edited.
Migration integrity tests assert this artifact is documented.

## Prisma Import Conventions

1. Canonical Prisma client implementation is `src/config/database.ts`.
2. `src/platform/db/prismaClient.ts` is a pass-through alias and must remain a
   thin re-export.
