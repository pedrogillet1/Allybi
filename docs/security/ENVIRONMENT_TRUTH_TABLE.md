# Environment Truth Table — Allybi Security Assurance Pack

**Generated**: 2026-03-09
**Method**: Config file inspection. Production environment values marked UNKNOWN where they could not be verified from the codebase alone.

---

## Security Features: Code Support vs Deployment Reality

| Feature | Code Support | Dev Enabled | Prod Enabled | Verification Command |
|---------|-------------|-------------|-------------|---------------------|
| **AES-256-GCM encryption** | YES — `encryption.service.ts` | YES | YES (assumed, core code path) | `grep "aes-256-gcm" backend/src/services/security/encryption.service.ts` |
| **GCP KMS key wrapping** | YES — `keyManager.service.ts` GcpKmsKeyManager | NO (`KODA_USE_GCP_KMS` not set in dev .env) | **UNKNOWN** — code exists but deployment config not in repo | `grep "KODA_USE_GCP_KMS" backend/.env*` |
| **Database SSL** | YES — Prisma supports `sslmode` in URL | NO — dev .env has no `sslmode` | **UNKNOWN** — production DATABASE_URL not in repo | `grep "sslmode" backend/.env*` |
| **Admin IP allowlist** | YES — `requireAdmin.guard.ts` | NO — `KODA_ADMIN_IP_ALLOWLIST` not set in dev .env | **UNKNOWN** | `grep "KODA_ADMIN_IP_ALLOWLIST" backend/.env*` |
| **Rate limiting (Redis-backed)** | YES — `rateLimit.middleware.ts` with Upstash | NO — in-memory fallback in dev | **UNKNOWN** — requires `UPSTASH_REDIS_REST_URL` | `grep "UPSTASH" backend/.env*` |
| **CSRF protection** | YES — `csrf.middleware.ts` | YES — active in app.ts | YES (assumed, wired in app.ts) | `grep "csrf" backend/src/app.ts` |
| **Helmet security headers** | **NO** — not found in codebase | N/A | N/A | `grep -r "helmet" backend/src/ backend/package.json` |
| **CSP (Content Security Policy)** | **NO** — not found | N/A | N/A | `grep -r "content-security-policy\|csp" backend/src/` |
| **Cloud Armor / WAF** | **NO** — no config found | N/A | N/A | `find . -name "*armor*" -o -name "*waf*" 2>/dev/null` |
| **Terraform / IaC** | **NO** — no IaC files found | N/A | N/A | `find . -name "*.tf" -o -name "*.tfvars" 2>/dev/null` |
| **CORS configuration** | YES — `gcsStorage.service.ts:306-337` + `app.ts` | YES — allows `localhost:3000` | **UNKNOWN** — depends on env `FRONTEND_URL` | `grep "cors\|CORS" backend/src/app.ts` |
| **Secret detection CI** | YES — `.github/workflows/secret-detection.yml` | YES (CI runs on push) | YES (same workflow) | `cat .github/workflows/secret-detection.yml` |
| **Security scan CI** | YES — `.github/workflows/security-scan.yml` | YES but `continue-on-error: true` | YES but **non-blocking** (F-012) | `grep "continue-on-error" .github/workflows/security-scan.yml` |
| **npm audit in CI** | **NO** | N/A | N/A | `grep "npm audit" .github/workflows/*` |
| **SBOM generation** | **NO** | N/A | N/A | `grep -r "sbom\|cyclonedx\|spdx" .github/ Dockerfile*` |
| **Container image scanning** | **NO** | N/A | N/A | `grep -r "trivy\|snyk\|grype" .github/ cloudbuild*` |
| **Backup automation** | **NO** — no application-level backup | N/A | **UNKNOWN** — may rely on Supabase managed backups | `grep -rn "backup\|pg_dump" backend/src/` |
| **Log aggregation / SIEM** | Sentry configured — `sentry.config.ts` | UNKNOWN | Sentry active (if DSN set) | `grep "SENTRY_DSN" backend/.env*` |
| **Alerting (PagerDuty/OpsGenie)** | **NO** | N/A | N/A | `grep -r "pagerduty\|opsgenie\|alerting" backend/src/` |
| **mTLS between services** | **NO** | N/A | N/A | `grep -r "mtls\|mutual.tls\|client.cert" backend/src/` |
| **Redis TLS** | YES — supports `rediss://` scheme | NO (dev uses local Redis) | **UNKNOWN** — depends on `REDIS_URL` scheme | `grep "REDIS_URL" backend/.env*` |
| **Encrypted-only mode** | YES — nulls plaintext fields | Configurable per deployment | **UNKNOWN** — depends on config | Feature exists but opt-in |

---

## Environment-Specific Risks

### Development (`NODE_ENV=development`)

| Risk | Status | Evidence |
|------|--------|----------|
| Master key in plaintext .env | PRESENT | `backend/.env` line 111 |
| Commented-out prod credentials | PRESENT | `backend/.env` lines 14-18 |
| Verification codes logged to console | YES (email codes guarded, SMS NOT guarded) | `auth.service.ts:286` |
| Local file storage fallback | ACTIVE | `STORAGE_PROVIDER=local` path exists |
| In-memory rate limiting | ACTIVE (no Upstash in dev) | `rateLimit.middleware.ts` fallback |
| Database SSL | NOT ENFORCED | No `sslmode` in dev DATABASE_URL |

### Production (inferred — cannot verify directly)

| Risk | Status | Evidence |
|------|--------|----------|
| GCP KMS enabled | **UNKNOWN** — code ready, deployment config not in repo | `KODA_USE_GCP_KMS` env var |
| Database SSL | **UNKNOWN** — depends on production DATABASE_URL | Not verifiable from codebase |
| Cloud Armor WAF | **UNKNOWN** — no IaC in repo, may be configured manually | No evidence either way |
| Redis TLS | **UNKNOWN** — depends on REDIS_URL scheme in prod | Not verifiable from codebase |
| Admin IP allowlist | **UNKNOWN** — code supports it, not verifiable if set | `KODA_ADMIN_IP_ALLOWLIST` env var |
| Backup automation | **UNKNOWN** — likely Supabase managed, not verifiable | No application-level backup code |

---

## What "UNKNOWN" Means For Auditors

Items marked UNKNOWN are features that **exist in code** but whose **deployment configuration cannot be verified** from the repository alone. An auditor would need:

1. Access to the production Cloud Run service's environment variables
2. Access to the GCP project's Cloud Armor / networking configuration
3. Access to the Supabase project's backup configuration
4. Access to the Redis provider's TLS configuration

**Recommendation**: Create a `PROD_CONFIG_ATTESTATION.md` that the operator fills in after verifying each UNKNOWN item against actual production settings. This converts UNKNOWNs to CONFIRMED/DENIED with a date and operator signature.

---

*This truth table should be re-verified before any security audit by checking actual deployment configurations.*
