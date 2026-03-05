# Prisma Governance Runbook

## Scope

This runbook documents operational safeguards for Prisma schema/migrations and
the expected write boundaries for HTTP routes.

## CI Safety Controls

1. `npm run prisma:ci:policy:check` blocks forbidden CI commands:
   - `prisma db push`
   - `--accept-data-loss`
2. `npm run prisma:replay:check` enforces env preflight before migration replay.
3. `npm run prisma:deps:check` enforces version parity between `prisma` and
   `@prisma/client`.
4. `npm run prisma:rls:verify` validates RLS posture for the active environment
   profile (`PRISMA_RLS_PROFILE`; CI uses `ci`, prod/staging should use `prod`).
5. `npm run prisma:telemetry:repair:audit` reports remaining ambiguous telemetry
   cohorts after compensation.
6. `.github/workflows/prisma-migration-replay.yml` is the canonical replay gate.

## Route Write Boundary

1. Upload and document status transitions must go through
   `src/services/documents/documentUploadWrite.service.ts`.
2. Route handlers should not directly call `prisma.document.create*` or
   `prisma.document.update*`.
3. Route handlers should not directly call `prisma.documentMetadata.upsert` or
   `prisma.documentMetadata.update`; use the write service methods instead.
4. Direct route-level Prisma writes are allowed only on explicit allowlist:
   - `auth.routes.ts`: `user.update`, `user.create`, `session.create`
   - `multipart-upload.routes.ts`: `ingestionEvent.create`
5. Raw SQL in routes is allowlisted to `admin-analytics.routes.ts` only.
6. Governance scans cover both route trees:
   - `src/entrypoints/http/routes/**`
   - `src/routes/**`

## Historical Migration Artifact

Two cloud integration migration folders exist:

1. `20251006005348_add_cloud_integrations` (empty historical artifact)
2. `20251006005424_add_cloud_integrations` (actual DDL migration)

The empty migration is retained as historical history and must not be edited.
Migration integrity tests assert this artifact is documented.

## Telemetry Repair Guardrail

Two historical migrations touched telemetry score repair:

1. `20260205_fix_evidence_strength`
2. `20260305113000_fix_telemetry_table_name_drift`

Compensation migration `20260306120000_compensate_double_telemetry_scaling`
reverses the safely-recoverable subset of duplicated low-score scaling and is
guarded on both historical migrations being applied.

`prisma:telemetry:repair:audit` must be used to quantify ambiguous rows at
score `1.0` that are not deterministically reversible.

## Prisma Import Conventions

1. Canonical Prisma client implementation is `src/config/database.ts`.
2. `src/platform/db/prismaClient.ts` is a pass-through alias and must remain a
   thin re-export.
