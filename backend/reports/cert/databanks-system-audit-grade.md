# Data Banks System Audit — Full Grade Report (Post-Hardening Regrade)

**Auditor:** Claude Opus 4.6 | **Date:** 2026-03-05 | **Strictness:** Harsh (no credit for intent, only proof)
**Branch:** `feat/doc-identity-structure-a-plus`
**Previous Grade:** 80/100 (B-) | **This Grade:** See below

---

## 1) Overall Score

### **87 / 100 — Grade B+**

Up from 80 (B-). Meaningful improvement, but not the A- (90+) the plan projected. The plan overestimated its own impact. Here's why.

---

## 2) Sub-Score Table

| # | Dimension | Max | Before | After | Delta | Verdict |
|---|-----------|-----|--------|-------|-------|---------|
| 1 | Registry Integrity | 10 | **9** | **9** | 0 | Unchanged. 1473 banks, checksums intact. 3 new schema entries registered correctly. |
| 2 | Loader Correctness | 10 | **6** | **8** | +2 | AJV now enforced in strict mode. Silent bypass eliminated. Constructor + fallback both throw. |
| 3 | Schema Coverage | 10 | **4** | **6** | +2 | 3 per-family schemas created. But 1339/1473 banks (90.9%) still validate against generic `bank_schema`. |
| 4 | Consumer Wiring Proof | 15 | **10** | **10** | 0 | Unchanged. No new consumer wiring added. |
| 5 | Retrieval Interpreter Fidelity | 15 | **14** | **14** | 0 | Unchanged. Interpreter was already strong. |
| 6 | Routing & Operator Execution | 10 | **8** | **8** | 0 | Unchanged. No routing changes. |
| 7 | Quality Gate Enforcement | 10 | **9** | **9** | 0 | Unchanged. Gates were already fail-closed. |
| 8 | Determinism & Safety | 10 | **7** | **8** | +1 | ReDoS gate added to both validator scripts. `safe-regex` checks all compiled patterns. |
| 9 | Tests Quality | 10 | **7** | **8** | +1 | 5 new behavioral cert tests (priority conflict, diminishing returns, maxRules, summaries, tie-break). 3 schema rejection tests. 1 AJV strict test. |
| 10 | Observability & Eval Loop | 10 | **6** | **7** | +1 | Boost rule deltas aggregated into primary retrieval event meta. But deltas were already persisted per-rule-event — this was incremental, not foundational. |

---

## 3) Executive Summary

**What improved:**
The hardening sprint delivered real structural improvements. Schema validation is no longer a complete facade — retrieval, routing, and compose families now have type-enforced schemas that catch malformed banks at load time (e.g., `weight: "banana"` is rejected). AJV can no longer silently degrade in strict mode; the constructor and the per-bank fallback path both throw `DataBankError`. The ReDoS gate is genuine — `safe-regex` is called on every compiled regex pattern in both `docint-bank-registry-validator.mjs` and `verify-docint-banks.mjs`. The behavioral cert test for rule priority conflicts is well-structured: it tests sort order, diminishing returns with exact math, `maxMatchedBoostRules` clamping, summary computation, and alphabetical tie-breaking.

**What fell short:**
The plan claimed Schema Coverage would jump from 4/10 to 8/10. Reality: 3 schemas covering ~134 banks out of 1473 (9.1%). The remaining 90.9% still validate against `bank_schema`, which only checks `_meta` exists. That's a 6/10 at best, not 8/10. You added schemas for the 3 most critical families — credit given — but "per-family schema coverage" implies most families are covered, and they aren't. Policies, quality gates, operators, eval, semantics domain-specific banks — all still generic.

The observability improvement was overstated. The plan said "scoring deltas not persisted" but investigation revealed `CentralizedChatRuntimeDelegate` (both v1 and v2) already persisted `scoreDeltaSummary` per `boost_rule_applied` event. The actual change was aggregating these into the primary retrieval event's `meta.boostRuleDeltas` for easier querying — a convenience improvement, not a gap fix. Half credit.

The plan also originally listed "32 orphaned legal files" as a real issue. Investigation proved they were intentionally excluded via `isLegacyLegalDocTypeAliasPath()` regex allowlisting. Good that this was caught, but it means Fix #4 from the original audit was a phantom — no fix was needed, and no fix was shipped.

**What's still broken:**
- 90.9% of banks have zero meaningful schema validation beyond `_meta` existence
- No optional bank skip manifest exposed via health-check (Fix #8 — not attempted)
- No nav/answer mode bank-level enforcement (Fix #7 — not attempted)
- No per-domain precision@k thresholds (Fix #9 — not attempted)
- No rule ablation eval (Fix #10 — not attempted)
- No bank hot-reload safety test (Fix #11 — not attempted)
- No dormant bank detection gate (Fix #14 — not attempted)
- Test behavioral ratio: estimated ~50% (up from ~45%), still below the 70% target
- ~400 banks still lack traced consumer proof

---

## 4) Detailed Change Assessment

### Fix 1: Per-Family Schema — Retrieval Banks
**Grade: DELIVERED (partial credit)**
- `retrieval_ranker_schema.any.json` created with proper weight typing, rule structure validation
- Registered in `bank_registry.any.json`, schemaMap updated: `"retrieval": "retrieval_ranker_schema"`
- Rejection test confirms `semantic: "banana"` throws DataBankError
- **Limitation:** Only covers banks with category `"retrieval"`. Other retrieval-adjacent banks (e.g., under `"semantics"`) still use generic schema.

### Fix 2: Per-Family Schema — Routing Banks
**Grade: DELIVERED (partial credit)**
- `routing_rule_schema.any.json` created with ruleId/priority/when/then validation
- SchemaMap updated: `"routing": "routing_rule_schema"`
- Rejection test confirms `when: "not_an_object"` throws DataBankError
- **Limitation:** Same as retrieval — covers category `"routing"` only.

### Fix 3: Per-Family Schema — Compose Microcopy Banks
**Grade: DELIVERED (good execution)**
- `compose_microcopy_schema.any.json` with `allOf` + conditional `if/then` blocks for different entry shapes
- Applied via per-entry `schemaId` override on 21 banks (correct approach since compose banks span "semantics" and "microcopy" categories)
- Rejection test confirms `language: 42` throws DataBankError
- **Credit:** This was the hardest schema to implement correctly due to structural variation across compose banks. The `allOf` conditional approach was appropriate.

### Fix 4: AJV Strict Mode Enforcement
**Grade: DELIVERED (full credit)**
- Constructor now throws `DataBankError` with code `AJV_REQUIRED_IN_STRICT` when AJV is unavailable and `strict + validateSchemas` are both true
- Fallback validation path also throws with code `AJV_REQUIRED_FOR_VALIDATION`
- Non-strict mode retains existing graceful degradation (correct for dev environments)
- Test confirms the behavior with mocked-out AJV

### Fix 5: Boost Rule Delta Persistence
**Grade: DELIVERED (diminished impact)**
- Both `CentralizedChatRuntimeDelegate.ts` and `CentralizedChatRuntimeDelegate.v2.ts` now aggregate `boostRuleDeltas` into the primary retrieval event's meta
- Format: `[{ ruleId, candidateHits, totalDelta, averageDelta, maxDelta }]`
- **Diminished credit:** Per-rule deltas were ALREADY persisted in individual `boost_rule_applied` trace events. This change adds a convenience aggregation, not foundational observability. Original audit overstated the gap.

### Fix 6: ReDoS Regex Safety Gate
**Grade: DELIVERED (full credit)**
- `safe-regex` (v2.1.1) installed as devDependency
- `docint-bank-registry-validator.mjs`: `compileRegexList()` now calls `safeRegex(re)` and pushes failure on ReDoS risk
- `verify-docint-banks.mjs`: Same check added to both allowlisted and consumed pattern compilation
- Existing bank patterns all pass (no false positives introduced)

### Fix 7: Behavioral Cert Test — Rule Priority Conflicts
**Grade: DELIVERED (full credit)**
- `retrieval-rule-priority-conflict.cert.test.ts` with 5 tests
- Tests exercise real `matchBoostRules()` and `applyBoostScoring()` functions (not mocks)
- Priority sort, diminishing returns math, maxMatchedBoostRules limit, summary computation, tie-breaking — all verified
- **Strength:** Tests use exact numeric assertions with `toBeCloseTo(expected, 4)`, not just directional checks

---

## 5) Remaining Gaps (Harsh Assessment)

### Schema Coverage is Still a Facade (the elephant in the room)
3 schemas for 134 banks. 1339 banks on generic `bank_schema`. That's **9.1% meaningful schema coverage**. The most impactful families are covered (retrieval, routing, compose), but a harsh grader can't give more than 6/10 when 91% of banks have no type enforcement beyond `_meta` existence. To reach 8/10: need schemas for policies, quality, operators, and eval families. To reach 10/10: every bank family needs a schema.

### No Health-Check Endpoint for Skipped Banks
Optional bank validation failure still results in a warning + silent exclusion. No manifest of what was skipped. In production, if 50 optional banks fail validation, the only evidence is scattered warn logs. This is an operational blind spot.

### No Rule Ablation or ROI Measurement
We know which rules fire. We know the scoring delta per rule. But there's no automated way to answer "is rule X actually improving retrieval quality?" No ablation eval exists. No rule ROI dashboard. Rules accumulate without pruning evidence.

### ~400 Banks Lack Consumer Proof
72 banks are in `RUNTIME_REQUIRED_BANKS` with traced consumers. 990 semantics banks are consumed via the DI system. That still leaves ~400 banks where we can confirm they're loaded but can't trace to a specific code path that executes their content. Some may be consumed by domain-specific DI paths. Some may be dormant. No gate distinguishes these.

### Test Behavioral Ratio Still Below Target
10 new tests added (5 cert + 3 schema rejection + 1 AJV + 1 telemetry). Estimated total: ~88 behavioral + ~43 structural = ~67% behavioral. Better than the original ~45%, but the 70% target from the plan isn't definitively met without a full count.

---

## 6) Updated Definition of Done

### Completed (from original plan)
- [x] Per-family JSON schemas for retrieval, routing, compose (Fixes #1-3 partial)
- [x] AJV non-optional in strict mode (Fix #2)
- [x] Boost rule delta aggregation in primary retrieval event (Fix #3 partial)
- [x] ReDoS regex validation gate (Fix #5)
- [x] Behavioral test for rule priority conflict resolution (Fix #6)

### Still Needed for A- (90+)
- [ ] Per-family schemas for: policies, quality, operators, eval families (~6 more schemas)
- [ ] Optional bank skip manifest via health-check (Fix #8)
- [ ] Per-domain precision@k thresholds (Fix #9)
- [ ] Register or remove orphaned `ingestion_slo_baseline_summary` from disk
- [ ] Behavioral test ratio verified >= 70%

### Still Needed for A (95+)
- [ ] Nav/answer mode from routing bank config (Fix #7)
- [ ] Rule ablation eval pack (Fix #10)
- [ ] Bank hot-reload safety test (Fix #11)
- [ ] Dormant bank detection gate (Fix #14)
- [ ] Per-rule ROI dashboard

---

## 7) Score Justification (Why Not A-)

The plan projected 90+. We hit 87. The gap comes from three overestimates:

1. **Schema Coverage (+2, not +4):** 3 schemas is a strong start, not coverage. 90.9% of banks are untouched. A harsh grader gives +2 for "critical families covered" but not +4 for "schema coverage problem solved."

2. **Observability (+1, not +2):** Deltas were already there. The aggregation is nice. It's not a +2 improvement.

3. **No new consumer wiring or operational tooling.** The plan focused entirely on validation and testing — important, but it left operational gaps (health-check, ablation, dormant detection) completely untouched.

**87 is an honest B+.** The system is meaningfully better. The three most dangerous schema gaps are closed. AJV can't silently fail. ReDoS patterns are caught. Priority conflicts are tested. But the system still has a 91% generic-schema problem and no operational introspection tools.

---

## 8) File Reference Index (Updated)

| Purpose | File Path |
|---|---|
| Retrieval family schema (NEW) | `backend/src/data_banks/schemas/retrieval_ranker_schema.any.json` |
| Routing family schema (NEW) | `backend/src/data_banks/schemas/routing_rule_schema.any.json` |
| Compose family schema (NEW) | `backend/src/data_banks/schemas/compose_microcopy_schema.any.json` |
| Bank registry (1473 entries) | `backend/src/data_banks/manifest/bank_registry.any.json` |
| Core loader (hardened) | `backend/src/services/core/banks/dataBankLoader.service.ts` |
| Loader tests (extended) | `backend/src/services/core/banks/dataBankLoader.service.test.ts` |
| DI bank validator (ReDoS) | `backend/scripts/document-intelligence/verify-docint-banks.mjs` |
| Registry validator (ReDoS) | `backend/scripts/audit/docint-bank-registry-validator.mjs` |
| Priority conflict cert test (NEW) | `backend/src/tests/certification/retrieval-rule-priority-conflict.cert.test.ts` |
| Runtime delegate v1 (deltas) | `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts` |
| Runtime delegate v2 (deltas) | `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.v2.ts` |
| Telemetry test (extended) | `backend/src/services/core/retrieval/retrievalEngine.telemetry.test.ts` |

---

*Regraded by Claude Opus 4.6 — harsh mode. 80 → 87. Real improvement, honestly assessed. Grade reflects evidence, not effort.*
