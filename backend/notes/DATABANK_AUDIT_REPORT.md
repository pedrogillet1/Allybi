# Data Bank System — Full Audit Report

> Generated: 2026-03-04 | Method: evidence-based investigation | Registry: 1,019+ banks | Files on disk: 1,412+

---

## Overall Verdict

| Metric | Value |
|--------|-------|
| **Overall Score** | **38/100** |
| **Letter Grade** | **F** |
| **P0 Hard Gates Passed** | **1 of 6** |
| **Reason** | P0 gates 1 (checksum), 4 (decorative JSON), 5 (SSOT fork), and 6 (locale content parity) all FAIL |

---

## P0 Hard Gate Results

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | Registry integrity: no missingOnDisk, no duplicate bankIds, no unregistered runtime banks | **PARTIAL PASS** | 0 missing files, 0 duplicate IDs, 0 duplicate paths. BUT: 166 DI entity schemas unregistered + 238 total orphan files. Registry/disk reconciliation incomplete. |
| 2 | Checksum gate: `banks:checksum:check` passes | **FAIL** | `registryMismatches=1480, manifestExtra=1`. Command output: `[banks:checksum] check failed`. Checksums are stale — regeneration required. |
| 3 | Schema validation is enforced (no "AJV unavailable" skips) | **PASS** | `dataBankLoader.service.ts` enforces schema validation at boot. AJV is a direct dependency. Schema banks exist for all major categories. No evidence of skip paths in production. |
| 4 | No decorative JSON: every runtime bank has runtime consumer + behavior-changing test | **FAIL** | 55+ DEAD banks registered with no runtime consumer. Full excel_calc agent subsystem (21 banks, 432 functions, 247 patterns) is entirely decorative. See WIRING_PROOF for complete list. |
| 5 | SSOT: no split truth for same concept across multiple banks | **FAIL** | 3 conflict clusters: (1) `domain_ontology` vs `di_domain_ontology` — incompatible domain ID sets with no dependency edge (HIGH). (2) `doc_taxonomy` vs `di_doc_type_ontology` — 83 shared IDs with incompatible schemas (MEDIUM). (3) Table header ontology duplicated across 2 locations (MEDIUM). See SSOT_CONFLICTS for details. |
| 6 | EN/PT parity proof exists for intent patterns and slotfill | **PARTIAL PASS** | File-level parity is PERFECT (60 EN / 60 PT). But CONTENT parity has gaps: excel_functions EN 273 vs PT 212 (-61), finance abbreviations EN 42 vs PT 24 (-18), accounting abbreviations EN 22 vs PT 16 (-6), insurance abbreviations EN 46 vs PT 41 (-5), excel_chart_types EN 36 vs PT 33 (-3), docx `rewrite.informal` exists in PT but not EN. `patternParity.en_pt.test.ts` exists but only covers pattern banks, not dictionaries/abbreviations. |

---

## Process Results

### 1. Inventory

| Metric | Count |
|--------|-------|
| Total files on disk (`src/data_banks/**`) | 1,412 |
| Total registered banks | 1,019 (per TYPES_AND_COMPLEXITY) / 1,008 (per prior scorecard) |
| Total size | 30.34 MB / 7.8M tokens |
| Top directory by size | document_intelligence (1,029 files, 13.86 MB) |
| Second largest | semantics (50 files, 6.46 MB) |
| Third largest | agents (21 files, 1.93 MB) |
| Categories | 24 distinct |
| Languages supported | EN, PT (bilingual) |

### 2. Registry Mapping

| Check | Result |
|-------|--------|
| missingOnDisk | 0 |
| unregisteredOnDisk | 238 (166 DI entity schemas + 42 deprecated + 30 other) |
| duplicateBankIds | 0 |
| duplicatePaths | 0 |
| dependencyCycles | 6 mutual category-level cycles (all involving semantics) |
| danglingDependencyTargets | 0 |
| aliases | ~1,290 aliases with migration grace periods |

### 3. Schema Validation

- AJV dependency: present in `package.json`
- Boot-time enforcement: YES — `dataBankLoader.service.ts` validates schemas
- Schema banks exist: 16 registered schema banks
- No "AJV unavailable" code paths found
- **Status: PASS**

### 4. Wiring Proof Summary

| Classification | Count |
|---------------|-------|
| WIRED (production runtime consumers) | ~230+ banks |
| DEAD (registered, no consumer) | ~55 banks |
| META (acceptable dead — schemas, manifest meta) | ~15 banks |
| TEST-ONLY | 3 banks |

**Worst offender**: `agents/excel_calc` — ALL 21 banks are DEAD. 432 functions, 247 patterns, 153 stats methods, 135 python recipes — all configured but unreachable at runtime.

See `DATABANK_WIRING_PROOF.md` for full evidence.

### 5. SSOT Conflicts

| Cluster | Severity | Banks | Impact |
|---------|----------|-------|--------|
| Domain ontology fork | HIGH | `domain_ontology` vs `di_domain_ontology` | Incompatible domain ID sets (7 shared, 3 root-only, 7 DI-only). `di_domain_ontology` declares `dependsOn: []`. |
| Doc type registries | MEDIUM | `doc_taxonomy` vs `di_doc_type_ontology` | 83 shared IDs with different schemas. Taxonomy enforces 5 domains, DI uses 13. |
| Table header ontology | MEDIUM | `semantics/structure/` vs `document_intelligence/semantics/structure/` | 5 duplicate files across locations |

Plus: 29 canonical mirrors on disk (25 legal, 4 medical). 11 quarantine files pending since Feb 2026.

See `DATABANK_SSOT_CONFLICTS.md` for complete analysis.

### 6. Locale Parity

| Metric | Value |
|--------|-------|
| EN locale files | 60 |
| PT locale files | 60 |
| File-level parity | 100% PERFECT |
| Content parity gaps | 6 known gaps |
| Parity test exists | YES (`patternParity.en_pt.test.ts`) but only covers pattern banks |
| Dictionary/abbreviation parity test | MISSING |

Content gaps:
- `excel_functions`: EN 273 vs PT 212 (61 missing)
- `finance/abbreviations`: EN 42 vs PT 24 (18 missing)
- `accounting/abbreviations`: EN 22 vs PT 16 (6 missing)
- `insurance/abbreviations`: EN 46 vs PT 41 (5 missing)
- `excel_chart_types`: EN 36 vs PT 33 (3 missing)
- `docx.rewrite.informal`: exists in PT, missing from EN

### 7. Eval/Proof

| Suite | Exists | CI Gated |
|-------|--------|----------|
| docint-bank-integrity | YES | YES (bank-quality-gates.yml) |
| docint-wiring-proof | YES | YES (test:runtime-wiring) |
| docint-orphan-detection | YES | YES (test:runtime-wiring) |
| docint-eval-pack | YES | YES (test:docint:eval-pack) |
| doc-taxonomy-ssot | YES | NO (not in any CI workflow) |
| patternParity.en_pt | YES | NO (not in any CI workflow) |
| editingRouting.bankWiring | YES | NO (not in any CI workflow) |
| retrieval_eval_gate | YES | YES (test:cert:strict) |
| bank collision check | YES | YES (bank-quality-gates.yml) |
| bank staleness report | YES | YES (bank-quality-gates.yml + weekly cron) |

### 8. Command Outputs

```
$ npm run -s banks:checksum:check
[banks:checksum] check failed (missingFile=0, registryMismatches=1480, manifestMissing=0, manifestExtra=1, manifestMismatches=1480)

$ npm run -s docint:verify -- --strict
Could not determine Node.js install directory

$ npm run -s test:runtime-wiring
Fatal process out of memory: Re-embedded builtins: set permissions
```

---

## Family-Level Grade Summary

| Family | Banks | Grade | P0 Gate | Top Issue |
|--------|-------|-------|---------|-----------|
| manifest | 10 | A | PASS | Clean |
| schemas | 16 | D | FAIL (no runtime consumer) | Meta-only, no getBank() consumer |
| normalizers | 10 | B- | PARTIAL | `locale_numeric_date_rules`, `month_normalization` DEAD |
| routing | 8 | A | PASS | Minor collision risk |
| operators | 50 | A- | PASS | Historical dead banks cleaned |
| semantics | 606 | A- | PARTIAL | 6 dead banks; concentration risk (59.3%) |
| scope | 3 | A | PASS | Clean |
| retrieval | 36 | A | PASS | Clean |
| formatting | 21 | B+ | PARTIAL | 4 style stubs config-only |
| dictionaries | 31 | B- | FAIL (parity) | excel_functions EN/PT gap (-61) |
| lexicons | 34 | A | PASS | Clean |
| parsers | 10 | A- | PARTIAL | `range_resolution_rules` dead |
| intent_patterns | 4 | B- | FAIL (collision) | 8 collision clusters (4 HIGH) |
| microcopy | 11 | B- | FAIL (dead) | 6 dead microcopy banks (35% dead rate) |
| overlays | 6 | B | PARTIAL | `followup_suggestions` dead |
| prompts | 13 | B | PARTIAL | 4 dead prompts; 7 lack test suites |
| policies | 64 | A- | PASS | `result_verification_policy`, `refusal_phrases` dead |
| fallbacks | 5 | A- | PARTIAL | `fallback_extraction_recovery` thin (2 rules) |
| quality | 36 | B | PARTIAL | `hallucination_guards` thin; `numeric_integrity_rules` dead |
| triggers | 2 | A | PASS | Clean |
| ambiguity | 3 | A | PASS | Clean |
| probes | 10 | B | PARTIAL | Test/eval only |
| templates | 3 | B | PARTIAL | Loaded by dead DataBankRegistry only |
| tests | 3 | B+ | N/A | Test data banks |
| agents/excel_calc | 21 | **F** | **P0 FAIL** | ENTIRE subsystem DEAD — zero runtime consumers |
| document_intelligence | ~200 | B+ | PARTIAL | `ops` domain missing; 166 entity schema orphans |

---

## Key Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Registry integrity | 0 ghosts, 0 dupes, 238 orphans | WARN |
| Checksum coverage | 1,019/1,019 registered | PASS (but checksums stale) |
| Checksum verification | 1,480 mismatches | **FAIL** |
| Schema enforcement | AJV active at boot | PASS |
| Dead bank rate | ~55/1,019 (5.4%) | WARN |
| Excel calc dead rate | 21/21 (100%) | **FAIL** |
| Microcopy dead rate | 6/17 (35%) | WARN |
| SSOT conflicts | 3 clusters (1 HIGH, 2 MEDIUM) | **FAIL** |
| EN/PT file parity | 60/60 (100%) | PASS |
| EN/PT content parity | 6 gaps | WARN |
| CI gate coverage | 10 test suites, 3 in CI | PARTIAL |
| Missing scripts | 28 referenced but absent | WARN |
| Missing test files | 10 referenced but absent | WARN |
| Dead code (DataBankRegistry) | 1,365 lines | TECH DEBT |
