# Security Fix Plan — Allybi Security Assurance Pack

**Generated**: 2026-03-09
**Owner**: Solo founder/operator
**Approach**: Phased, ROI-prioritized, each phase independently shippable

---

## Findings → Fix Mapping

| Finding | Fix Task(s) | Phase |
|---------|------------|-------|
| F-001 DocumentEmbedding plaintext | T-1.1 | 1 |
| F-002 Pinecone plaintext metadata | T-1.2 | 1 |
| F-003 Cache stores plaintext | T-1.3 | 1 |
| F-004 GCS no client-side encryption | T-1.4 | 1 |
| F-005 Verification codes plaintext | T-0.1 | 0 |
| F-006 SMS code logged in prod | T-0.2 | 0 |
| F-007 No key rotation | T-2.1, T-2.2, T-2.3 | 2 |
| F-008 HKDF empty salt | T-0.3 | 0 |
| F-009 Dual plaintext/encrypted fields | T-1.5 | 1 |
| F-010 BullMQ plaintext in Redis | T-1.6 | 1 |
| F-011 RLS decorative | T-3.1 | 3 |
| F-012 CI scans non-blocking | T-0.4 | 0 |
| F-013 Master key in .env | T-2.4 | 2 |
| F-014 Commented-out credentials | T-0.5 | 0 |
| F-015 DB SSL not enforced | T-0.6 | 0 |
| F-016 Audit logs deletable | T-3.2 | 3 |
| F-017 No session cleanup | T-3.3 | 3 |
| F-018 Audit PII unencrypted | T-3.4 | 3 |
| F-019 No backup mechanism | T-3.5 | 3 |
| F-020 No incident response | T-4.1 | 4 |
| F-021 Dual password hashing | T-3.6 | 3 |
| F-022 AAD optional | T-0.7 | 0 |
| F-023 No npm audit/SBOM/scanning | T-3.7 | 3 |
| F-024 Metadata fields no encrypted counterpart | T-1.7 | 1 |

---

## Phase 0: Stop the Bleeding (1-2 days)

**Objective**: Close P0 findings that can be fixed with minimal code changes and zero architectural risk.

| Task | Findings | Files Touched | Effort | Rollback | Acceptance Criteria |
|------|----------|--------------|--------|----------|-------------------|
| **T-0.1** Hash verification codes before storage | F-005 | `auth.service.ts`, `authBridge.ts` | 2h | Revert commit | `grep -n "SHA-256\|createHash" auth.service.ts` shows hashing before DB write; existing tests pass |
| **T-0.2** Guard SMS code logging | F-006 | `auth.service.ts:286` | 5min | Revert commit | `grep -n "SMS Verification" auth.service.ts` shows NODE_ENV guard; no code in production logs |
| **T-0.3** Add random salt to HKDF | F-008 | `hkdf.service.ts`, `tenantKey.service.ts` | 1h | Revert + maintain backward compat for existing keys | New keys use random salt; migration reads both formats; `hkdf.service.test.ts` passes |
| **T-0.4** Make CI scans blocking | F-012 | `.github/workflows/security-scan.yml` | 5min | Revert commit | `grep "continue-on-error" .github/workflows/security-scan.yml` returns empty |
| **T-0.5** Remove commented-out credentials | F-014 | `backend/.env` | 5min | N/A (deletion) | `grep "34.172" backend/.env` returns empty |
| **T-0.6** Add sslmode=require to DATABASE_URL | F-015 | `backend/.env`, production config | 10min | Remove `sslmode` parameter | Connection succeeds with `sslmode=require`; `grep "sslmode" backend/.env` shows `require` |
| **T-0.7** Make AAD required in encrypt signature | F-022 | `encryption.service.ts` | 30min | Revert commit | TypeScript compile fails if AAD omitted; existing callers all pass AAD |

**Phase 0 total effort**: ~4 hours
**Dependencies**: None
**Risk**: Low — all changes are additive or tightening
**Test to add**: `security-phase0.test.ts` — verifies codes are hashed, HKDF uses salt, AAD required

---

## Phase 1: Eliminate Plaintext Copies (1-2 weeks)

**Objective**: Every piece of document content exists in exactly ONE form — encrypted. Zero plaintext copies in any persistent or semi-persistent store.

| Task | Findings | Files Touched | Effort | Rollback | Acceptance Criteria |
|------|----------|--------------|--------|----------|-------------------|
| **T-1.1** Encrypt DocumentEmbedding content fields | F-001 | `schema.prisma`, `vectorEmbedding.service.ts`, migration | 2d | Revert migration + code | `SELECT content FROM document_embeddings LIMIT 1` returns null; `contentEncrypted` populated |
| **T-1.2** Remove content from Pinecone metadata (use vector IDs + DB lookup) | F-002 | `pinecone.mappers.ts`, `pinecone.service.ts`, retrieval code | 2d | Revert to old mapper | Pinecone metadata contains only `documentId`, `chunkId`, `userId` — no content/filename |
| **T-1.3** Encrypt cache entries with document DEK | F-003 | `cache.service.ts` | 1d | Revert to plaintext cache | Cache get/set wraps content with encryption; memory dump shows ciphertext |
| **T-1.4** Client-side encrypt before GCS upload | F-004 | `gcsStorage.service.ts`, ingestion pipeline | 2d | Revert to plaintext upload | `file.save()` receives encrypted buffer; download decrypts with document DEK |
| **T-1.5** Null plaintext fields when encrypted counterpart populated | F-009 | `encryptionStep.service.ts`, migration | 1d | Revert migration | `SELECT extractedText FROM document_metadata WHERE extractedTextEncrypted IS NOT NULL` returns all null |
| **T-1.6** Encrypt sensitive BullMQ job fields | F-010 | `queueConfig.ts`, `jobHelpers.service.ts`, workers | 1d | Revert to plaintext payloads | `plaintextForEmbeddings` field removed or encrypted before queueing |
| **T-1.7** Add encrypted counterparts for summary/markdownContent/slidesData | F-024 | `schema.prisma`, `fieldEncryption.service.ts`, ingestion | 1d | Revert migration | Schema has `summaryEncrypted`, `markdownContentEncrypted` fields; plaintext nulled |

**Phase 1 total effort**: ~10 days
**Dependencies**: Phase 0 (HKDF salt needed for new encrypted fields)
**Risk**: Medium — changes data storage format, requires careful migration of existing data
**Test to add**: `no-plaintext-sensitive-fields.test.ts` — queries DB for non-null plaintext in encrypted-counterpart fields, fails if any found
**Migration strategy**: Write migration that reads plaintext → encrypts → writes encrypted → nulls plaintext. Run as background job. Verify with count query.

---

## Phase 2: Key Management Hardening (1-2 weeks)

**Objective**: Key rotation capability, versioned keys, master key in Secret Manager.

| Task | Findings | Files Touched | Effort | Rollback | Acceptance Criteria |
|------|----------|--------------|--------|----------|-------------------|
| **T-2.1** Add `keyVersion` to encrypted payloads | F-007 | `encryption.service.ts`, all encrypted field schemas | 2d | Backward-compat: old payloads read as v0 | All new encryptions include `v` field; old payloads still decrypt |
| **T-2.2** Build key rotation API + re-encryption worker | F-007 | New: `keyRotation.service.ts`, `keyRotation.worker.ts` | 3d | Disable rotation worker | API generates new key version; worker iterates and re-encrypts; progress tracked |
| **T-2.3** Implement 90-day rotation schedule with alerting | F-007 | New: cron job, alerting integration | 1d | Disable cron | Cron fires every 90 days; alert fires if last rotation > 95 days ago |
| **T-2.4** Move master key to GCP Secret Manager | F-013 | `keyManager.service.ts`, deployment config | 1d | Fallback to env var | `KODA_MASTER_KEY_BASE64` no longer in .env; loaded from Secret Manager at startup |
| **T-2.5** Make GCP KMS the production default | F-013 | `keyManager.service.ts`, config | 0.5d | Toggle env var | `KODA_USE_GCP_KMS=true` in production; LocalKeyManager only in dev |
| **T-2.6** Document key recovery ceremony | F-007 | New: `KEY_RECOVERY.md` | 0.5d | N/A (docs) | Document exists with split-knowledge procedure and tested recovery path |

**Phase 2 total effort**: ~8 days
**Dependencies**: Phase 1 (need encrypted payloads to version)
**Risk**: Medium-high — key rotation touches all data; must be thoroughly tested
**Test to add**: `key-rotation.integration.test.ts` — encrypts data with v1, rotates to v2, verifies old data still decrypts, new data uses v2

---

## Phase 3: Infrastructure Hardening (2-3 weeks)

**Objective**: Database isolation, immutable audit logs, backup encryption, CI gates.

| Task | Findings | Files Touched | Effort | Rollback | Acceptance Criteria |
|------|----------|--------------|--------|----------|-------------------|
| **T-3.1** Implement per-user RLS policies | F-011 | New migration, Prisma config | 3d | Revert migration | `SELECT * FROM documents` as non-service-role returns only own rows; cross-tenant test passes |
| **T-3.2** Move audit logs to append-only store | F-016 | `auditLog.middleware.ts`, BigQuery or GCS config | 2d | Revert to PG-only | Audit entries written to append-only GCS bucket with retention lock; PG as cache only |
| **T-3.3** Add session hard-deletion scheduler | F-017 | New cron job | 0.5d | Disable cron | Expired sessions older than 30 days hard-deleted daily; `SELECT COUNT(*) FROM sessions WHERE expiresAt < NOW() - interval '30 days'` = 0 |
| **T-3.4** Encrypt or pseudonymise audit PII | F-018 | `auditLog.middleware.ts` | 1d | Revert | IP addresses hashed or encrypted before storage |
| **T-3.5** Enable GCS bucket versioning + retention lock | F-019 | GCS bucket config (manual or Terraform) | 0.5d | Remove retention policy | `gsutil retention get gs://BUCKET` shows retention policy active |
| **T-3.6** Unify password hashing to standard bcrypt | F-021 | `password.ts`, `authBridge.ts`, migration | 1d | Revert to dual approach | Single hashing path; migration re-hashes on next login |
| **T-3.7** Add npm audit + SBOM + image scanning to CI | F-023 | `.github/workflows/`, `cloudbuild.yaml` | 1d | Revert workflow changes | `npm audit --audit-level=high` passes in CI; SBOM artifact generated; Trivy scan runs |

**Phase 3 total effort**: ~9 days
**Dependencies**: Phase 0 (CI gates must be blocking first)
**Risk**: Medium — RLS changes can break queries if not thoroughly tested
**Test to add**: `cross-tenant-access.test.ts` — creates User A doc, attempts access as User B, asserts denied at DB level

---

## Phase 4: Operational Readiness (1-2 weeks)

**Objective**: Incident response, monitoring, alerting, admin zero-trust.

| Task | Findings | Files Touched | Effort | Rollback | Acceptance Criteria |
|------|----------|--------------|--------|----------|-------------------|
| **T-4.1** Write incident response runbook | F-020 | New: `INCIDENT_RESPONSE.md` | 1d | N/A (docs) | Runbook covers detection, containment, eradication, recovery, lessons-learned |
| **T-4.2** Configure alerting | F-020 | GCP Cloud Monitoring or PagerDuty | 1d | Disable alerts | Alert fires on: 10+ auth failures in 5min, admin access, key usage anomaly |
| **T-4.3** Document rollback procedures | F-020 | New: `ROLLBACK.md` | 0.5d | N/A (docs) | Step-by-step rollback for each deploy type (Cloud Run revision, DB migration, key rotation) |
| **T-4.4** Deploy admin behind GCP IAP | — | Cloud Run config, IAP setup | 2d | Revert to public admin | Admin dashboard accessible only through IAP; public URL returns 403 |
| **T-4.5** Add FIDO2/passkeys for admin auth | — | Admin auth flow | 2d | Revert to TOTP | WebAuthn registration + authentication for admin; hardware key required |
| **T-4.6** Add Helmet.js security headers | — | `app.ts`, new dependency | 0.5d | Remove middleware | Response headers include `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security` |
| **T-4.7** Generate Security Assurance Pack artifacts | — | `docs/security/` | 2d | N/A (docs) | SECURITY.md, THREAT_MODEL.md, CRYPTO_SPEC.md, INCIDENT_RESPONSE.md all committed |

**Phase 4 total effort**: ~9 days
**Dependencies**: Phase 2 (key rotation must work before documenting it)
**Risk**: Low-medium — IAP and FIDO2 are additive
**Test to add**: `admin-access.integration.test.ts` — verifies admin routes reject requests without IAP/FIDO2

---

## Total Effort Summary

| Phase | Effort | Cumulative | Projected Score Impact |
|-------|--------|-----------|----------------------|
| Phase 0 | 4 hours | 4 hours | 49 → 55 |
| Phase 1 | 10 days | 10.5 days | 55 → 68 |
| Phase 2 | 8 days | 18.5 days | 68 → 75 |
| Phase 3 | 9 days | 27.5 days | 75 → 81 |
| Phase 4 | 9 days | 36.5 days | 81 → 88 |

**To reach 90+**: Add SOC 2 Type II audit, formal pentest, customer-facing CMEK portal, HIPAA BAA program.

---

## Do Not Break List

These runtime behaviors must remain functional throughout all phases:

1. Existing encrypted documents must remain decryptable (backward compatibility)
2. Chat pipeline latency must not increase by more than 200ms
3. File upload flow must continue to work for all 18+ supported file types
4. OAuth login (Google/Apple) must not break
5. Existing sessions must not be invalidated
6. Admin dashboard must remain accessible during migration
7. Pinecone retrieval must continue working (even if metadata format changes)
8. BullMQ workers must process jobs without interruption

---

## Prove It Now Checklist

After all phases complete, run these commands to generate auditor-ready evidence:

```bash
# 1. Verify no plaintext document content in DB
psql -c "SELECT COUNT(*) FROM document_embeddings WHERE content IS NOT NULL;" # expect: 0
psql -c "SELECT COUNT(*) FROM document_metadata WHERE extracted_text IS NOT NULL AND extracted_text_encrypted IS NOT NULL;" # expect: 0

# 2. Verify encryption coverage
grep -rn "PLAIN" docs/security/CRYPTO_COVERAGE_MATRIX.md | wc -l # track reduction over time

# 3. Verify CI gates are blocking
grep "continue-on-error" .github/workflows/security-scan.yml # expect: empty

# 4. Verify key rotation exists
grep -rn "keyVersion\|rotation" backend/src/services/security/ # expect: results

# 5. Verify RLS policies are real
psql -c "SELECT policyname, polpermissive, polcmd FROM pg_policies WHERE polname != 'service_role_all';" # expect: per-user policies

# 6. Verify no SMS code in prod logs
grep -n "SMS Verification Code" backend/src/services/auth.service.ts # expect: guarded by NODE_ENV

# 7. Verify audit log immutability
gsutil retention get gs://BUCKET_NAME # expect: retention policy set

# 8. Verify master key not in .env (production)
# Must check production environment directly

# 9. Run security scans
npm audit --audit-level=high # expect: 0 high/critical
npx trivy image IMAGE_NAME # expect: 0 critical

# 10. Run security tests
npm test -- --grep "security\|cross-tenant\|encryption\|plaintext" # expect: all pass
```

---

*This plan is designed for a solo operator. All phases are independently shippable. Phase 0 should be done today.*
