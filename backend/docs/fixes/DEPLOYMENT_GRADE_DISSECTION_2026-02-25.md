# Deployment Grade Dissection (Strict) - 2026-02-25

## Executive Summary
This repository currently **passes the existing strict pipeline** (`predeploy:grade`, cert gates, and `npm test`), but it is **not at 100/100 deployment-grade quality** under the target rubric you defined (ChatGPT-level reliability with no dead runtime paths, no shallow certs, and no weak gates).

### Current computed status
- P0 Gates: **PASS** (4/4)
- Certification Gates: **PASS** (10/10)
- Runtime coverage: **80.13%**
- Runtime unreachable files: **91**
- Unreachable triage backlog: **219 files** (`WIRE=15`, `MOVE=152`, `DELETE=52`)

Evidence:
- `reports/cert/p0-gates-summary.json` lines 4-5, 7-42
- `reports/cert/certification-summary.json` lines 3-7, 8-190
- `reports/cert/reachability-budget.json` lines 4-6
- `docs/audit/reachability-triage.json` lines 4-10

## Final Grade (for 100-point deployment bar)
Overall: **76/100** (Not enough for production if the target is 100/100 reliability)

| Rubric | Grade | Why it is not 10/10 |
|---|---:|---|
| R1 Centralization | 8/10 | Significant legacy surface still exists in runtime tree and triage backlog. |
| R2 Wiring/Reachability | 6/10 | Coverage is 80.13% with 91 unreachable runtime files. |
| R3 Persistence/Data Integrity | 7/10 | Cert emphasizes token-vault restart, not full chat/docs/edit persistence continuity. |
| R4 Security/Privacy | 7/10 | JWT + no header trust passes; cert depth is still shallow for full authz/privacy attack surface. |
| R5 Retrieval/Doc-lock | 8/10 | Wrong-doc is passing, but benchmark size is small for cert-level confidence. |
| R6 Evidence Fidelity | 8/10 | Map/hash checks exist, but certification depth remains narrow and synthetic. |
| R7 Truncation/Format | 7/10 | One compact cert case; not broad enough for production-long and multilingual heavy outputs. |
| R8 Editing Correctness | 7/10 | Bitwise roundtrip passes, but full operator golden matrix is not certified here. |
| R9 Observability | 7/10 | Integrity checks are largely static source assertions (regex), not runtime trace completeness audits. |
| R10 Tests/Certifiability | 7/10 | High pass count, but several cert gates are too permissive for 100-grade deployment confidence. |

---

## Evidence That Current Grade Is Not Enough For 100% Deployment Confidence

## 1) Reachability is below deployment-grade target
Current runtime coverage is **80.13%**, with **91 runtime files unreachable**.

Evidence:
- `reports/cert/reachability-budget.json` line 4 (`runtimeCoverage: 0.8013`)
- `reports/cert/reachability-budget.json` line 5 (`runtimeUnreachable: 91`)

Why this is a deployment blocker for 100/100:
- A 100-grade runtime should have near-total runtime reachability (>=95%) or formally exclude non-runtime code from `src/`.
- Current triage still has 219 unreachable files overall.

Evidence:
- `docs/audit/reachability-triage.json` lines 5-10 (`WIRE=15`, `MOVE=152`, `DELETE=52`)

## 2) Runtime-wiring gate threshold is too weak for a 100 claim
The runtime-wiring cert currently allows low minimum runtime coverage.

Evidence:
- `src/tests/certification/runtime-wiring.cert.test.ts` lines 57-59 (`runtimeCoverage < 0.59` fail condition)
- `src/tests/certification/runtime-wiring.cert.test.ts` lines 79-82 (`minRuntimeCoverage: 0.59` threshold)

Why this matters:
- A system can pass cert while still far below the 0.90-0.95 target trajectory.

Related config:
- `scripts/audit/reachability-budget.json` lines 2-4 (trajectory `0.7 -> 0.8 -> 0.9 -> 0.95`)

## 3) Wrong-doc certification coverage is currently small
Wrong-doc gate passes, but dataset size is small for enterprise confidence.

Evidence:
- `reports/cert/certification-summary.json` lines 14-21 (`totalCases: 24`, `multiDocsetCases: 6`)
- `src/tests/certification/wrong-doc.cert.test.ts` lines 208-209 (`slice(0, 2)` queries per language)

Why this is not enough for 100:
- 24 total synthetic/fixture-like cases are not sufficient for high confidence against regression in production variability.

## 4) Security certification is still narrow
Security auth cert currently verifies a minimal set of behaviors:
- missing token -> 401
- no `x-user-id`
- presence of JWT verify call

Evidence:
- `src/tests/certification/security-auth.cert.test.ts` lines 42-48

Why this is not 10/10:
- It does not certify forged signatures, revoked sessions, role escalation, cross-tenant document authorization matrix, or token replay paths.

## 5) Persistence cert does not cover full product persistence scope
Current persistence restart cert validates token vault durability and checks for Prisma noop fallback patterns.

Evidence:
- `src/tests/certification/persistence-restart.cert.test.ts` lines 15-57 (token vault restart scenario)
- `src/tests/certification/persistence-restart.cert.test.ts` lines 63-68 (noop fallback text scan)

Why this is not 10/10:
- It does not currently certify restart continuity for core state domains (chat message history, document metadata/content invariants, editing revisions across restart) in one integrated restart suite.

## 6) Observability integrity check is static-oriented
Current observability cert validates presence of step names and spans via source regex checks.

Evidence:
- `src/tests/certification/observability-integrity.cert.test.ts` lines 30-36 (regex checks in source code)

Why this is not 10/10:
- It does not assert end-to-end runtime trace correctness for real requests under failure/success variants with full payload completeness guarantees.

## 7) Truncation/evidence/editing cert gates pass but remain narrow
These gates are valuable and currently passing, but are still limited in breadth:
- Truncation cert uses one generated large-table case with a tight token cap.
- Evidence fidelity cert validates core map/hash invariants.
- Editing roundtrip cert validates DOCX/XLSX bitwise restoration in targeted flows.

Evidence:
- `src/tests/certification/truncation.cert.test.ts` lines 31-83
- `src/tests/certification/evidence-fidelity.cert.test.ts` lines 20-65
- `src/tests/certification/editing-roundtrip.cert.test.ts` lines 122-250

Why this is not 10/10:
- Production-grade 100 requires broader scenario matrices and stress coverage per subsystem.

---

## Why Current PASS != 100-grade Deploy-safe
The repo is currently in a **good/stable state** (all strict gates green) but it is still at a **milestone pass**, not final perfection.

Current pass conditions are permissive in places:
- runtime wiring cert threshold allows 0.59 coverage
- wrong-doc cert minimum multi-docset case threshold is very low (`minMultiDocsetCases: 1`)

Evidence:
- `reports/cert/certification-summary.json` lines 23-28, 90-97

This means a green pipeline confirms **non-regression against current gates**, not completion of your 100/100 target.

---

## Required Work To Reach 100/100

## A) R2 to 10/10 (largest gap)
1. Raise runtime coverage threshold in cert and budget to staged hard targets:
   - 0.85 -> 0.90 -> 0.95
2. Resolve `WIRE=15` runtime files by wiring through server/entrypoint call graph.
3. Execute triage for `MOVE=152` and `DELETE=52` to remove non-runtime from `src/`.

Evidence baseline:
- `docs/audit/reachability-triage.json` lines 5-10
- `reports/cert/reachability-budget.json` lines 4-15

## B) Expand cert depth for R4/R5/R10
1. Security authz matrix cert:
   - forged/expired/revoked tokens
   - role-based forbidden/allowed routes
   - cross-user doc access denials
2. Wrong-doc benchmark expansion:
   - increase to large mixed-doc suite (not 24-case size)
3. Full persistence restart cert:
   - chat/docs/edit revisions continuity across restart.

## C) Upgrade R9 observability cert from static to runtime-complete
1. Validate runtime turn packet completeness and consistency against emitted spans.
2. Assert trace integrity under failure modes (retrieval miss, enforcer fail-closed, provider errors).

## D) Broaden R7/R8 cert matrices
1. Truncation: multilingual, long-table, long-list, multi-section outputs under realistic limits.
2. Editing: full operator golden suites and roundtrip integrity across structural operators.

---

## Deployment Recommendation
**Recommendation: Do not treat current grade as final production-grade 100/100.**

What is true now:
- Stable enough for controlled staging and iterative hardening.
- Not yet at the strict 100-level quality bar you requested.

Decision basis:
- Significant reachability debt remains.
- Several cert gates are still too narrow/permissive for 100-level confidence.

---

## Reproduction Commands
Run from `backend/`:

```bash
npm run predeploy:grade -- --strict
npm test
node scripts/audit/src-centralization-eval.mjs --mode=strict
node scripts/audit/runtime-import-graph.mjs --strict-runtime --strict
```

These commands currently pass, but the evidence above explains why passing now is not equivalent to 100/100 deployment-grade readiness.
