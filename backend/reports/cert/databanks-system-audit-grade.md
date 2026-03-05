# Data Banks System Audit — Full Grade Report

**Auditor:** Claude Opus 4.6 | **Date:** 2026-03-05 | **Strictness:** ChatGPT-level (harsh)
**Branch:** `feat/doc-identity-structure-a-plus`

---

## 1) Overall Score

### **80 / 100 — Grade B-**

---

## 2) Sub-Score Table

| # | Dimension | Max | Score | Grade | Verdict |
|---|-----------|-----|-------|-------|---------|
| 1 | Registry Integrity | 10 | **9** | A | 1470 banks, unique IDs, checksums, 32 orphans only |
| 2 | Loader Correctness | 10 | **6** | C+ | AJV graceful degradation = silent schema bypass |
| 3 | Schema Coverage | 10 | **4** | D | 1 generic schema for 1470 banks. No per-family validation. |
| 4 | Consumer Wiring Proof | 15 | **10** | B | 72 required banks + 30 consumer files. 990 semantics consumed via DI system. |
| 5 | Retrieval Interpreter Fidelity | 15 | **14** | A | Conditions, weights, multi-rule, section priority, cross-doc all real |
| 6 | Routing & Operator Execution | 10 | **8** | B+ | Playbooks execute. Nav/answer split is downstream, not bank-driven. |
| 7 | Quality Gate Enforcement | 10 | **9** | A | Fail-closed at retrieval, routing, composition. Hard blocks proven. |
| 8 | Determinism & Safety | 10 | **7** | B- | Determinism gates exist. No ReDoS validation. No acronym guardrails. |
| 9 | Tests Quality | 10 | **7** | B- | 35 behavioral + 43 structural. Missing conflict resolution & hot-reload. |
| 10 | Observability & Eval Loop | 10 | **6** | C+ | Rule hit logged. No per-rule scoring deltas. No rule ablation eval. |

---

## 3) Executive Summary

**Paragraph 1 — What works:**
The Data Banks system is genuinely the brain of Allybi, not decorative config. The retrieval interpreter (`ruleInterpreter.ts`) evaluates conditions, applies numeric weights with normalization and clamping, supports multi-rule application with diminishing returns, and enforces cross-doc policy fail-closed. The routing layer reads bank playbooks and applies `when/then` rules to produce real routing decisions. Quality gates (doc-lock hard block, minFinalScore threshold, scope violation drop) are fail-closed — bad evidence never reaches the composer. The registry infrastructure (1470 banks, SHA256 checksums, dependency graph with cycle detection, alias system) is enterprise-grade. CI gates in `bank-quality-gates.yml` block merges on integrity drift.

**Paragraph 2 — What's broken:**
Schema validation is a facade. All 1470 banks map to ONE generic `bank_schema` that checks `_meta` and `config.enabled` — nothing else. A retrieval bank could declare `"weight": "banana"` and pass schema validation; only `normalizeWeight()` at runtime prevents a crash (fallback to 1). AJV validation gracefully degrades to "warning only" if the library is unavailable, meaning production could silently run with zero schema enforcement. Per-rule observability is half-built: we know WHICH rule fired but not the scoring delta it caused — making rule ROI measurement impossible. The test suite is 55% structural (count assertions, file existence) rather than behavioral (config change → behavior change).

**Paragraph 3 — Risk assessment:**
No P0 blockers are triggered — the core promise (banks drive behavior, gates fail-closed, cross-doc enforced) is real. The system earns a B- because the infrastructure is strong but the "prove it works" layer (schemas, observability, behavioral tests) has gaps that would compound under scale. Adding 100 more banks without per-family schemas is risky. Debugging retrieval quality without scoring deltas is flying blind. The 32 orphaned legal files and the AJV degradation path are latent production risks. Fix schema coverage and observability deltas to reach A.

---

## 4) P0 Blockers Assessment

| P0 Criterion | Status | Evidence |
|---|---|---|
| Banks contain fields runtime does not execute | **CLEAR** | `ruleInterpreter.ts:451-587` evaluates conditions, weights, priorities |
| Required bank not loaded/validated at startup | **CLEAR (conditional)** | Strict mode fail-fast confirmed. BUT: AJV unavailable → warning only, schema skipped |
| Wrong-doc lock is advisory only | **CLEAR** | `retrieval_negatives.any.json:90` → `"action": "hard_block_candidate"` enforced at `retrievalEngine.service.ts:2909` |
| Acronym rewrites applied globally without guardrails | **CLEAR** | Rewrite rules are conditional (`ruleInterpreter.ts:818-885` evaluates docLock, intent, docType gates) |
| Cross-doc policy not enforced | **CLEAR** | `ruleInterpreter.ts:1188-1263` enforces `minExplicitResolvedDocs=2`, returns `allow: false` |
| Checksum/manifest drift blocks predeploy | **CLEAR** | `generate-bank-checksums.mjs --check` + `bank-quality-gates.yml` blocks on drift |

**No P0 blockers triggered. No instant-fail.**

---

## 5) What's Decorative vs Executed

### Executed (proven by code trace)

| Bank / Family | Consumer | Proof Location |
|---|---|---|
| `retrieval_ranker_config` | RetrievalEngine | `retrievalEngine.service.ts:3538-3594` — 8 numeric weights in scoring formula |
| `retrieval_negatives` | RetrievalEngine | `retrievalEngine.service.ts:625` — hard_block_candidate enforced |
| `evidence_packaging` | RetrievalEngine | `retrievalEngine.service.ts:4345-4425` — 6 threshold constraints |
| `snippet_compression_policy` | RetrievalEngine | `retrievalEngine.service.ts:4203-4231` — maxSnippetChars, negationLexicon |
| `crossdoc_alignment_rules` | RuleInterpreter | `ruleInterpreter.ts:1112-1324` — cross-doc fail-closed |
| `openers / closers / followup_suggestions` | ComposeMicrocopy | `composeMicrocopy.service.ts:241-451` — language/intent conditions, deterministic selection |
| `anti_robotic_style_rules` | ComposeMicrocopy | `composeMicrocopy.service.ts:266-389` — suppress logic |
| `llm_builder_policy` | LlmRequestBuilder | `llmRequestBuilder.service.ts:399-434` — 4 config fields normalized and cached |
| `connectors_routing / email_routing` | TurnRoutePolicy | `turnRoutePolicy.service.ts:228-285` — regex `when.any` → `then` decision |
| 72 banks in `RUNTIME_REQUIRED_BANKS` | RuntimeWiringIntegrity | `runtimeWiringIntegrity.service.ts:46-117` — existence + consumer verified |
| 990 semantics banks | DocumentIntelligenceBanks → RuleInterpreter | `documentIntelligenceBanks.service.ts` → boost/section/rewrite rules |
| `citation_policy`, `format_guardrails`, `tone_profiles`, `verbosity_ladder`, `table_render_policy` | ComposeMicrocopy | `composeMicrocopy.service.ts:468-512` — config values extracted and applied |

### Decorative / Test-Only

| Bank | Status | Evidence |
|---|---|---|
| `legacy_doc_type_aliases` | Test-only | Only in `docint-eval-pack.test.ts:21`. No runtime import. |
| 32 orphaned legal files | Dead | Not in registry, not loaded, not consumed |
| `ingestion_slo_baseline_summary` | Generated metadata | Not consumed by runtime code |

### Uncertain (loaded, execution depth unclear)

| Bank | Status | Risk |
|---|---|---|
| ~400 remaining banks not in RUNTIME_REQUIRED_BANKS | Loaded by dataBankLoader but consumer proof not traced | May be consumed by DI domain-specific paths or truly dormant |

---

## 6) Top 15 Fixes

### Fix 1: Per-Family JSON Schemas (CRITICAL)
- **Files:** `backend/src/data_banks/manifest/bank_schema.any.json` (only generic schema)
- **Problem:** 1 schema validates 1470 banks. Fields like `weight`, `conditions`, `priority` have no type enforcement.
- **Change:** Create per-family schemas: `retrieval_config.schema.json`, `routing_rule.schema.json`, `compose_microcopy.schema.json`, etc. Register in `bank_registry.any.json` schemaMap.
- **Test:** Add cert test: mutate a `weight` to string → loader must throw `DataBankError`.

### Fix 2: Enforce AJV Non-Optional (CRITICAL)
- **File:** `backend/src/services/core/banks/dataBankLoader.service.ts:306-310`
- **Problem:** AJV unavailable → warning logged, schema validation silently disabled.
- **Change:** In strict/prod mode, throw if AJV is not available. Remove graceful degradation.
- **Test:** Unit test: mock AJV unavailable + strict mode → expect throw.

### Fix 3: Per-Rule Scoring Delta Telemetry (HIGH)
- **File:** `backend/src/services/retrieval/document_intelligence/ruleInterpreter.ts:546-606`
- **Problem:** `applyBoostScoring()` applies boosts but doesn't record `scoreBeforeBoost` vs `scoreAfterBoost`.
- **Change:** Emit `{ ruleId, scoreBefore, scoreAfter, delta }` for each applied rule. Pipe to traceWriter.
- **Test:** `retrievalEngine.telemetry.test.ts`: assert `boost_rule_applied` event contains `delta` field.

### Fix 4: Register Orphaned Legal Banks (HIGH)
- **Files:** 30 files in `backend/src/data_banks/document_intelligence/domains/legal/doc_types/`
- **Problem:** Files exist on disk but not in `bank_registry.any.json`. CI orphan detection should catch this.
- **Change:** Register all 30 files OR delete them if WIP. Run `scripts/audit-databanks.mjs` to verify.
- **Test:** `verify-docint-banks.mjs --strict` must pass with 0 orphans.

### Fix 5: ReDoS Regex Validation Gate (HIGH)
- **Files:** `backend/scripts/document-intelligence/verify-docint-banks.mjs`, `backend/scripts/audit/docint-bank-registry-validator.mjs`
- **Problem:** Regex patterns in banks validated for syntax but not catastrophic backtracking.
- **Change:** Add `safe-regex` or `recheck` library check for all regex fields in bank rules.
- **Test:** Add bank with `(a+)+$` pattern → gate must reject.

### Fix 6: Behavioral Test for Rule Priority Conflicts (HIGH)
- **File:** New test: `backend/src/tests/certification/retrieval-rule-conflict.cert.test.ts`
- **Problem:** No test verifies behavior when 2+ boost rules match same chunk with different priorities.
- **Change:** Create test: 2 rules match, assert higher-priority rule wins. Test diminishing returns.
- **Test:** Golden seed with 2 matching rules, assert final score matches priority order.

### Fix 7: Nav vs Answer Bank-Level Enforcement (MEDIUM)
- **File:** `backend/src/services/chat/turnRoutePolicy.service.ts`
- **Problem:** Nav/answer distinction resolves downstream in composer, not from routing bank config.
- **Change:** Add `answerMode` field to routing bank `then` clause. Router propagates to composer.
- **Test:** Routing cert test: bank rule with `answerMode: "nav"` → assert answer mode propagated.

### Fix 8: Schema Validation for Optional Banks (MEDIUM)
- **File:** `backend/src/services/core/banks/dataBankLoader.service.ts:495-513`
- **Problem:** Optional bank validation failure → warning, bank silently excluded. No manifest of skipped banks.
- **Change:** Collect `skippedBanks[]` and expose via health-check endpoint. Fail-closed if >N skipped.
- **Test:** Integration test: corrupt optional bank → assert it appears in skipped list + health check.

### Fix 9: Offline Precision@k by Domain (MEDIUM)
- **File:** `backend/src/tests/certification/retrieval-golden-eval.cert.test.ts`
- **Problem:** Precision@5 is global. No per-domain breakdown enforced as gate.
- **Change:** Add per-domain thresholds: `accounting >= 0.75`, `legal >= 0.65`, etc. Fail if any domain below.
- **Test:** Golden eval seeds must include >=5 queries per domain. Report per-domain precision.

### Fix 10: Rule Ablation Eval Pack (MEDIUM)
- **File:** New script: `backend/scripts/eval/rule-ablation-eval.mjs`
- **Problem:** No way to measure "what happens if we disable rule X?"
- **Change:** Script runs golden eval with each boost rule disabled one-at-a-time, reports precision delta.
- **Test:** CI can run weekly. Flagged rules with zero impact are pruning candidates.

### Fix 11: Bank Hot-Reload Safety Test (MEDIUM)
- **File:** New test: `backend/src/services/core/banks/bankLoader.hotReload.test.ts`
- **Problem:** No test for bank update during active query.
- **Change:** Test: start retrieval → reload banks mid-flight → assert consistent scoring (no mixed state).
- **Test:** Unit test with mock timer + concurrent reload.

### Fix 12: Acronym Expansion Ambiguity Gate (LOW)
- **File:** `backend/scripts/audit/docint-bank-registry-validator.mjs`
- **Problem:** No check for conflicting acronym expansions across locales.
- **Change:** Scan all query rewrite rules. Flag acronyms with >1 expansion in same locale.
- **Test:** Add gate to `bank-quality-gates.yml`. Fail on ambiguous acronyms.

### Fix 13: JSON Ordering Determinism Contract (LOW)
- **File:** `backend/scripts/lint/generate-bank-checksums.mjs`
- **Problem:** Checksum stability assumes JSON key ordering is consistent across Node versions.
- **Change:** Sort keys explicitly before SHA256 (`JSON.stringify(obj, Object.keys(obj).sort())`).
- **Test:** Verify checksum is identical with sorted vs unsorted keys.

### Fix 14: Dormant Bank Detection in CI (LOW)
- **File:** `backend/scripts/audit-databanks.mjs`
- **Problem:** Scans for bank ID references in source but doesn't distinguish "loaded" from "executed."
- **Change:** Cross-reference `RUNTIME_REQUIRED_BANKS` + actual `getOptionalBank`/`getRequiredBank` call sites. Flag banks loaded but never called.
- **Test:** Report dormant banks as warnings. Threshold: <5% dormant.

### Fix 15: Missing MIME Type Extraction Coverage Gate (LOW)
- **File:** `backend/scripts/integrations/run-integration-runtime-grade.mjs`
- **Problem:** Connector MIME type extraction validated but not all extraction dispatch paths covered.
- **Change:** Cross-reference `ingestionMimeRegistry` against actual extractor implementations. Flag gaps.
- **Test:** Gate: every MIME type in registry has a non-null extractor function.

---

## 7) Top 10 Banks to Prune/Merge

| # | Bank(s) | Action | Reason |
|---|---------|--------|--------|
| 1 | `legacy_doc_type_aliases.any.json` | **DELETE** | Test-only, no runtime consumer, "legacy" in name |
| 2 | `ingestion_slo_baseline_summary.any.json` | **DELETE or register** | Generated metadata, not in registry, not consumed |
| 3 | 30 orphaned legal doc_type files | **Register or DELETE** | On disk but not in registry — dead code |
| 4 | `unused_bank_lifecycle.any.json` | **Review** | Name implies tracking unused banks; verify if consumed |
| 5 | `fallback_router` + `fallback_processing` + `fallback_scope_empty` + `fallback_not_found_scope` + `fallback_extraction_recovery` | **Merge into `fallback_policy`** | 5 fallback banks could be 1 bank with sections |
| 6 | `{connect,search,send,sync,nav}_intents_{en,pt,es}` (11 banks) | **Merge per-locale** | 5 families x 2-3 locales = 11 banks. Could be 5 banks with locale keys. |
| 7 | `bullet_rules` + `table_rules` + `list_styles` + `table_styles` + `quote_styles` + `citation_styles` | **Merge into `formatting_policy`** | 6 granular formatting banks could be 1 |
| 8 | `pii_field_labels` + `privacy_minimal_rules` | **Merge into `privacy_policy`** | 2 banks covering same privacy concern |
| 9 | `banned_phrases` + `bolding_rules` | **Review** | Small banks that may fit into composition policy |
| 10 | Banks with `config.enabled: false` | **Audit** | Any disabled bank is dead weight in the registry |

---

## 8) Definition of Done — Reaching Grade A

### Must-Have (B- → A-)
- [ ] Per-family JSON schemas for: retrieval, routing, compose, policies, quality, operators (Fix #1)
- [ ] AJV non-optional in strict/prod mode (Fix #2)
- [ ] Per-rule scoring delta telemetry emitted and stored (Fix #3)
- [ ] 0 orphaned bank files (Fix #4)
- [ ] ReDoS regex validation gate in CI (Fix #5)
- [ ] Behavioral test for rule priority conflict resolution (Fix #6)
- [ ] All certification tests are behavioral (>70% behavioral ratio vs current 45%)
- [ ] Optional bank skip manifest exposed via health-check (Fix #8)

### Should-Have (A- → A)
- [ ] Nav/answer mode propagated from routing bank config (Fix #7)
- [ ] Offline precision@k by domain with per-domain thresholds (Fix #9)
- [ ] Rule ablation eval pack (weekly CI) (Fix #10)
- [ ] Bank hot-reload safety test (Fix #11)
- [ ] Dormant bank detection gate (Fix #14)

### Nice-to-Have (A → A+)
- [ ] Acronym expansion ambiguity gate (Fix #12)
- [ ] JSON ordering determinism contract (Fix #13)
- [ ] MIME extraction coverage gate (Fix #15)
- [ ] Per-rule ROI dashboard (rule X improved precision by Y%)
- [ ] Automated rule pruning recommendations from ablation data

---

## 9) 7-Day Prioritized Plan

### Day 1 — P0: Schema + AJV (Fixes #1, #2)
- Create per-family schemas for retrieval, routing, compose families
- Remove AJV graceful degradation in strict mode
- Add cert test: mutated weight → throw
- **Exit criterion:** `npm run predeploy:grade` passes with new schemas

### Day 2 — P0: Orphans + Registry (Fixes #4, #14)
- Register or delete 32 orphaned legal files
- Register or delete `ingestion_slo_baseline_summary`
- Run `verify-docint-banks.mjs --strict` → 0 orphans
- Run `audit-databanks.mjs` → 0 dormant warnings
- **Exit criterion:** `bank-quality-gates.yml` green

### Day 3 — P0: Observability (Fix #3)
- Add `scoreBefore`/`scoreAfter`/`delta` to `boost_rule_applied` telemetry
- Update `retrievalEngine.telemetry.test.ts` to assert delta field
- Verify traceWriter persists delta to spans
- **Exit criterion:** Telemetry cert test passes with delta assertions

### Day 4 — P1: Safety Gates (Fixes #5, #12)
- Add `safe-regex` check to `docint-bank-registry-validator.mjs`
- Add acronym ambiguity scan to bank quality gate
- Add CI step to `bank-quality-gates.yml`
- **Exit criterion:** Bank with `(a+)+$` → gate rejects

### Day 5 — P1: Behavioral Tests (Fixes #6, #11)
- Write rule-priority conflict cert test (2 rules, different priorities)
- Write bank hot-reload safety test (concurrent reload + query)
- **Exit criterion:** `npm run test:cert:strict` includes both new tests

### Day 6 — P2: Eval Depth (Fixes #9, #10)
- Add per-domain thresholds to golden eval
- Create rule ablation eval script (disable rule one-at-a-time)
- Run first ablation pass, identify zero-impact rules
- **Exit criterion:** Golden eval reports per-domain precision

### Day 7 — P2: Consolidation + Prune (Fixes #7, #13)
- Merge 5 fallback banks into `fallback_policy`
- Add `answerMode` to routing bank schema
- Add explicit JSON key sort to checksum generator
- Run full `predeploy:grade` → verify A- or higher
- **Exit criterion:** `npm run predeploy:grade` passes, bank count reduced by >= 5

---

## 10) File Reference Index

| Purpose | File Path |
|---|---|
| Bank registry (1470 entries) | `backend/src/data_banks/manifest/bank_registry.any.json` |
| Checksum store | `backend/src/data_banks/manifest/bank_checksums.any.json` |
| Dependency graph | `backend/src/data_banks/manifest/bank_dependencies.any.json` |
| Alias system | `backend/src/data_banks/manifest/bank_aliases.any.json` |
| Core loader | `backend/src/services/core/banks/dataBankLoader.service.ts` |
| Public bank API | `backend/src/services/core/banks/bankLoader.service.ts` |
| Wiring integrity checker | `backend/src/services/core/banks/runtimeWiringIntegrity.service.ts` |
| Retrieval rule interpreter | `backend/src/services/retrieval/document_intelligence/ruleInterpreter.ts` |
| Retrieval engine (scoring) | `backend/src/services/core/retrieval/retrievalEngine.service.ts` |
| Compose microcopy consumer | `backend/src/services/core/enforcement/composeMicrocopy.service.ts` |
| Routing policy consumer | `backend/src/services/chat/turnRoutePolicy.service.ts` |
| LLM builder policy consumer | `backend/src/services/llm/core/llmRequestBuilder.service.ts` |
| Checksum generator | `backend/scripts/lint/generate-bank-checksums.mjs` |
| Manifest integrity validator | `backend/scripts/lint/verify-manifest-integrity.mjs` |
| DI bank validator | `backend/scripts/document-intelligence/verify-docint-banks.mjs` |
| CI quality gate workflow | `.github/workflows/bank-quality-gates.yml` |
| Routing grade gate | `backend/scripts/audit/routing-grade.mjs` |
| Composition A+ gate | `backend/scripts/policy/assert-composition-a-plus.ts` |
| Telemetry cert test | `backend/src/tests/certification/telemetry-completeness.cert.test.ts` |
| Retrieval golden eval | `backend/src/tests/certification/retrieval-golden-eval.cert.test.ts` |

---

*Generated by Claude Opus 4.6 — harsh audit mode. Grade reflects evidence, not effort.*
