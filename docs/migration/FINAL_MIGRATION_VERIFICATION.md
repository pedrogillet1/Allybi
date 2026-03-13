# Final Migration Verification

## Repo-Side Changes Completed
- Added Terraform under `infra/terraform` for the target GCP-managed stack:
  - VPC, PSA, serverless VPC access, NAT
  - Artifact Registry
  - Cloud Run web/api/admin/worker services
  - Cloud SQL
  - Memorystore Redis
  - GCS
  - Pub/Sub
  - Secret Manager
  - KMS
  - load balancer/serverless NEGs
  - Cloud Armor
  - monitoring
- Added production container packaging for:
  - backend
  - frontend
  - dashboard
- Added Cloud Run runtime-role support and explicit worker entrypoints.
- Added IAP-aware admin gate and demoted legacy shared-header admin auth.
- Added Redis-backed Socket.IO adapter support.
- Updated GCP worker deploy scripts to use authenticated Cloud Run workers and real entrypoints.
- Added migration audit, architecture, plan, cutover, rollback, and security runbooks.

## Validation Results
- Backend `npm run typecheck`: passed.
- Frontend `npm run build`: passed.
- Dashboard `npm run check`: passed after installing dashboard dependencies with `--legacy-peer-deps`.
- Dashboard `npm run build`: passed after installing dashboard dependencies with `--legacy-peer-deps`.
- Terraform `fmt/validate`: not run because `terraform` binary is not installed in this environment.
- Backend full `npm run build`: blocked before TypeScript compile by Prisma config loading failures in the current dependency tree. Errors encountered while iterating:
  - missing `exsolve/dist/index.mjs`
  - missing `destr/dist/index.mjs`
  - missing `defu/dist/defu.mjs`
  - missing `pkg-types/dist/index.mjs`
  - missing `perfect-debounce/dist/index.mjs`

## Manual Work Still Required
- Apply Terraform in staging and production.
- Populate Secret Manager secret values.
- Create or confirm IAP OAuth client credentials and backend audience values.
- Push Cloud Run images to Artifact Registry.
- Apply Hostinger DNS cutover.
- Execute Cloud SQL data migration/cutover.
- Validate Cloud Armor and IAP policies in staging before production.

## Security Blockers Remaining
- Backend full build is still blocked by the existing Prisma transitive package tree. That must be corrected before production image builds are considered healthy.
- KMS is now wired as a supported runtime path, but staging verification must confirm all encryption-sensitive paths behave correctly when `KODA_USE_GCP_KMS=true`.
- Admin legacy-header mode still exists as a compatibility path. Production must keep `KODA_ADMIN_IDENTITY_PROVIDER=iap` and `KODA_ENABLE_LEGACY_ADMIN_KEY=false`.
- The local repo worktree contains substantial unrelated changes outside this migration. Cutover should happen from a reviewed branch or clean release candidate, not from the current mixed state.

## Cutover-Day Checklist
1. Confirm Terraform plan for prod is reviewed and approved.
2. Confirm Cloud Run images are built from a clean commit and pushed.
3. Confirm Secret Manager secrets and IAM bindings are present.
4. Confirm Cloud SQL backups and PITR are enabled.
5. Confirm Memorystore is reachable from Cloud Run staging.
6. Confirm `allybi-web`, `allybi-api`, `allybi-admin`, and worker services are healthy.
7. Confirm admin access requires IAP and no longer depends on shared headers.
8. Confirm signed upload, Pub/Sub delivery, and worker processing in staging.
9. Lower Hostinger TTL if not already done.
10. Change Hostinger DNS to the Google load balancer IP.
11. Run `POST_CUTOVER_VALIDATION.md`.
12. Keep VPS read-only fallback for 24-72 hours.
13. Decommission VPS only after the stability window closes cleanly.
