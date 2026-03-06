# Prisma Governance Runbook

## Scope

This runbook documents operational safeguards for Prisma schema/migrations and
the expected write boundaries for HTTP routes.

## CI Safety Controls

1. `npm run prisma:ci:policy:check` blocks forbidden CI commands:
   - `prisma db push`
   - `--accept-data-loss`
   - `prisma migrate reset`
   - `prisma migrate dev`
   - `prisma db execute`
   - including commands hidden inside workflow-invoked shell scripts (`.sh`/`.ps1`)
2. `npm run prisma:replay:check` enforces env preflight before migration replay.
3. `npm run prisma:deps:check` enforces version parity between `prisma` and
   `@prisma/client`.
4. `npm run prisma:env:check` fails fast when `DATABASE_URL` /
   `DIRECT_DATABASE_URL` still contain placeholder tokens.
5. `npm run prisma:hygiene:check` blocks tracked DB artifacts and deprecated
   Prisma SQLite dependency drift.
6. `npm run prisma:migrations:lint` blocks new migration folders (post-baseline)
   that contain sqlite-only tokens or destructive SQL unless explicitly waived.
7. `npm run prisma:behavioral:cert` executes runtime fail-closed checks against a
   real Postgres instance (missing table, RLS disabled, strict telemetry ambiguity).
8. `npm run prisma:replay:cert` is the canonical end-to-end replay certification
   gate and emits `reports/prisma/replay-cert.json`.
9. `npm run prisma:rls:verify` validates RLS posture for the active environment
   profile (`PRISMA_RLS_PROFILE`; CI uses `ci`, prod/staging should use `prod`).
10. `npm run prisma:telemetry:repair:audit` reports remaining ambiguous telemetry
   cohorts after compensation and can fail with
   `PRISMA_TELEMETRY_AUDIT_FAIL_ON_AMBIGUOUS=1`.
11. `npm run prisma:rls:seed-service-role` should run before replay in CI/local
   environments where RLS migrations depend on role presence.
12. `.github/workflows/prisma-migration-replay.yml` is the canonical replay gate
   and now runs on PR/push plus nightly schedule + `workflow_dispatch`.
13. CI exports replay and telemetry artifacts:
   - `prisma-replay-cert`
   - `prisma-telemetry-audit`
   - `prisma-telemetry-audit-behavioral`
14. `npm run prisma:governance:gate` is the canonical reusable CI guard script
   for non-replay workflows that still execute Prisma migrations/deploys:
   - run `--phase pre-migrate` before `prisma migrate deploy`
   - run `--phase post-migrate` after migration replay/deploy

## Local Bootstrap

1. `npm run prisma:dev:bootstrap` starts local Postgres via
   `docker-compose.dev.yml`, provisions `.env.local`, and applies migrations.
2. `npm run prisma:check` should pass after bootstrap with a real local DB URL.

## Canonical Table Source

1. `scripts/prisma/schema-table-manifest.cjs` is the canonical parser for
   schema-mapped table names (`model` + optional `@@map`).
2. `scripts/prisma/verify-rls.mjs` defaults to this manifest (unless
   `PRISMA_RLS_TABLES` override is explicitly set).

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
