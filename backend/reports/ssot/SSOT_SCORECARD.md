# SSOT Scorecard
Generated: 2026-03-02 | Registry v4.0.1 | 1,023 banks

---

## §1 Dimension Grades (0-10 scale, 10 = perfect)

| # | Dimension | Grade | Evidence |
|---|-----------|-------|----------|
| 1 | Registry Coverage | **9/10** | 1,023/1,304 files registered (78.5%). All 281 orphans are intentionally outside the system (entity schemas, quarantine, mirrors, eval). Zero ghosts. Zero duplicate IDs/paths. Loses 1 point: 18 unclassified orphans include 16 additional canonical mirrors not tracked in `unused_bank_audit.json`. |
| 2 | Checksum Coverage | **10/10** | 1,023/1,023 entries (100%). SHA-256 checksums for every registered bank. Strict enforcement in prod/staging. 152 banks marked required. |
| 3 | Dependency Health | **7/10** | 1,023/1,023 bank-level entries. 833 edges, zero dangling targets. BUT: 6 mutual category-level cycles (all involving semantics). While resolved by deterministic load order, they indicate tight coupling. `di_domain_ontology` declares `dependsOn: []` despite being a conceptual fork of `domain_ontology` — a governance gap. |
| 4 | Duplicate Severity | **6/10** | No byte-for-byte duplicates. But: Cluster 1 (domain ontology) is a true HIGH-severity fork with incompatible domain ID sets. Cluster 2 (doc types) has 83 overlapping IDs across two registries with incompatible schemas. 29 canonical mirrors on disk add confusion even though unregistered. Total: 1 HIGH, 2 MEDIUM, 2 LOW conflict clusters. |
| 5 | Naming Consistency | **7/10** | Strong conventions: `category_name.lang.json` pattern widely followed. 24 clear categories. Dot-notation aliases (234) provide compatibility. But: DI banks use `di_` prefix inconsistently (ontologies have it, profiles don't). Root semantics uses `doc_taxonomy` while DI uses `di_doc_type_ontology` — different naming for parallel concept. Entity schemas (172) follow a consistent `.entities.schema.any.json` pattern but live outside the registry. |
| 6 | Runtime Wiring | **9/10** | 52 RUNTIME_REQUIRED_BANKS validated at boot. 21 integrity check categories cover: bank loading, operator contracts, prompt layers, builder policy, legacy imports, console usage, memory patterns, answer mode drift. Zero tolerance for missing required banks in prod. Loses 1 point: no cross-validation between root and DI domain ontologies; no file-path-leakage detection in responses. |
| 7 | Documentation | **5/10** | `DATABANK_TYPES_AND_COMPLEXITY.md` provides token counts. `unused_bank_audit.json` tracks mirrors and orphans. `runtime_wiring_gates` has 3 gates. BUT: No formal SSOT documentation existed before this audit. No concept namespace map. No canonical source declarations. Bank registry description says "single source of truth" but doesn't define what that means for overlapping banks. |
| 8 | Prompt Truth Guarantees | **8/10** | `system_base` + `rag_policy` + `policy_citations` + `hallucination_guards` (7 rules) form a strong truth chain. `responseContractEnforcer` blocks on provenance failure. `ProvenanceValidator` checks lexical overlap. But: No file-path-leakage guard. No concept-ID validation in responses. No formal truth contract document (before this audit). |
| 9 | Migration Readiness | **6/10** | Alias system with migration grace periods (90-day default, 365 max). Self-aliases for all 1,023 banks. Existing audit infrastructure (`unused_bank_audit.json`). But: 29 canonical mirrors still on disk. 31 deprecated files unreviewed. 11 quarantine files pending decision. No automated SSOT enforcement in CI. |
| 10 | Scalability | **7/10** | 1,023 banks load successfully. 24 categories with deterministic load order. Checksum-based integrity. Alias-based backward compatibility. But: `semantics` category has 606 banks (59.3%) — massive concentration. 5 individual banks exceed 60K tokens each. 5.1M total tokens means full system load requires careful budgeting. No partition strategy for semantics. |

### Overall Score: **7.4/10**

**Interpretation:** The bank system is well-engineered with strong integrity foundations (registry, checksums, aliases, dependency tracking). The main weaknesses are: (1) the domain ontology fork creates a governance gap that could cause subtle bugs, (2) documentation of canonical ownership is absent, and (3) the semantics category needs a partition strategy to scale beyond ~1,500 banks.

---

## §2 Top 20 Blocking Issues

Ranked by severity (P0 = critical, P1 = high, P2 = medium, P3 = low):

| # | Priority | Issue | Impact | Resolution |
|---|----------|-------|--------|------------|
| 1 | **P0** | Domain ontology fork: `domain_ontology` vs `di_domain_ontology` have incompatible domain ID sets (7 shared, 3 root-only, 7 DI-only) with no declared dependency | Domain misrouting, incomplete coverage, silent failures when DI references domains unknown to root | Add dependency edge, SSOT markers, cross-validation (see Migration §2) |
| 2 | **P0** | `di_domain_ontology` declares `dependsOn: []` — autonomous parallel definition | No boot-time validation that shared domain IDs stay aligned. Drift guaranteed over time. | Add `dependsOn: ["domain_ontology"]` + cross-validation integrity check |
| 3 | **P1** | Doc type registries incompatible: `doc_taxonomy` enforces 5 domains with `failOnUnknown: true`, DI uses 13 domains | Doc types from DI-only domains (banking, billing, education, etc.) would fail taxonomy validation if cross-referenced | Either expand `doc_taxonomy` canonical domains or add domain-set compatibility layer |
| 4 | **P1** | 83 doc type IDs shared between `di_doc_type_ontology` and `doc_taxonomy` with different schemas (category vs aliases+signals+retrievalProfile) | No single source of truth for these 83 doc types. Updates to one registry may not propagate to the other. | Assign canonical ownership per field: DI owns enumeration, taxonomy owns retrieval profiles |
| 5 | **P1** | No SSOT documentation existed before this audit | Developers must reverse-engineer canonical ownership from code. New banks may be created in wrong locations. | Deploy all 6 SSOT deliverables and reference in onboarding docs |
| 6 | **P1** | 29 canonical mirrors still on disk | Confusion for developers (which file is canonical?), disk bloat, stale content risk | Delete mirrors or add redirect aliases (see Migration §1) |
| 7 | **P2** | 6 mutual category-level dependency cycles (manifest↔schemas, manifest↔semantics, normalizers↔semantics, routing↔semantics, operators↔semantics, quality↔semantics) | While resolved by load order, indicates tight coupling. Adding a new category in the cycle zone requires careful ordering. | Document cycles explicitly. Consider breaking some by splitting semantics into sub-categories. |
| 8 | **P2** | `semantics` category: 606 banks (59.3%), 2.99M tokens (58.6%) | Single category dominates system. No internal structure for navigation. Hard to reason about changes. | Partition semantics into sub-categories: `semantics.domains`, `semantics.taxonomy`, `semantics.ontology`, `semantics.profiles` |
| 9 | **P2** | No CI-level SSOT enforcement | Registry-disk reconciliation, checksum validation, and dependency checks run at boot but not in CI. Drift can reach production before detection. | Add CI job: run `unused_bank_audit`, verify zero unclassified orphans, verify checksum coverage 100% |
| 10 | **P2** | No file-path-leakage detection in responses | Bank file paths (e.g., `data_banks/semantics/domain_ontology.any.json`) could leak into LLM responses | Add regex guard in `responseContractEnforcer` for `data_banks/`, `*.any.json`, `src/` patterns |
| 11 | **P2** | 31 deprecated files unreviewed | Disk clutter, potential for accidental loading via path manipulation | Audit for code references, delete unreferenced, alias referenced ones |
| 12 | **P2** | 11 quarantine files pending decision since February 2026 | Governance stale — quarantine should have a review SLA | Review and decide: promote or delete. Set 30-day quarantine SLA policy. |
| 13 | **P2** | `doc_taxonomy` has 230 doc types but only 5 canonical domains (accounting, finance, legal, medical, ops) | 9 DI domains (banking, billing, education, housing, hr_payroll, identity, insurance, tax, travel) have doc types in DI ontology but NO taxonomy entries | Expand `doc_taxonomy` canonical domains or accept split coverage |
| 14 | **P2** | No concept-ID validation in LLM responses | System could generate responses referencing non-existent domain/entity/doctype IDs | Add structured response validation against registered bank concepts |
| 15 | **P2** | No `_meta.ssotRole` markers on any bank | Banks don't self-declare their canonical ownership role | Add `ssotRole` markers to all banks identified as canonical sources in conflict clusters |
| 16 | **P3** | 172 entity schemas outside bank registry | While intentional, they lack checksum validation, dependency tracking, or version governance | Add governance policy to registry config; consider lightweight registration |
| 17 | **P3** | 5 individual banks exceed 60K tokens (medical_explanation_templates: 173K, medical_report_ontology: 159K, doc_taxonomy: 78K, legal_clause_ontology: 77K, excel_function_catalog: 66K) | Memory pressure, slow loading, context window risks if loaded into prompts | Consider splitting or lazy-loading for banks >50K tokens |
| 18 | **P3** | No automated drift detection between root and DI ontologies | Domain IDs can diverge silently between `domain_ontology` and `di_domain_ontology` | Add cross-validation integrity check (proposed in Migration §2A.4) |
| 19 | **P3** | Section priority banks (5) and per-doctype section files (172) don't validate against `di_section_ontology` | Section IDs used in priority/per-doctype files may not exist in ontology | Add validation: all section IDs in priority/per-doctype files must exist in `di_section_ontology` |
| 20 | **P3** | No partition strategy for semantics category growth | At 606 banks and growing, semantics will become unwieldy. No sub-categorization mechanism in registry. | Design sub-category scheme. Consider nested categories in registry v5.0. |

---

## §3 Summary

### Strengths
- **Zero ghosts, zero dangling references** — registry-disk integrity is excellent
- **100% checksum and dependency coverage** — every bank tracked
- **Strong alias system** — 1,290 aliases with migration grace periods
- **Comprehensive runtime wiring** — 52 required banks, 21 integrity categories
- **Robust truth chain** — 7 hallucination guards + provenance validator + contract enforcer

### Weaknesses
- **Domain ontology fork** is the #1 governance gap (P0)
- **No SSOT documentation** existed before this audit (P1)
- **No CI-level enforcement** — drift detected only at boot (P2)
- **Semantics concentration** — 59.3% of all banks in one category (P2)

### Recommended Priority Order
1. **Immediate (P0):** Fix domain ontology fork — add dependency, SSOT markers, cross-validation
2. **Short-term (P1):** Deploy SSOT documentation, clean up mirrors, assign doc type canonical ownership
3. **Medium-term (P2):** Add CI enforcement, partition semantics, add response guards
4. **Long-term (P3):** Entity schema governance, large bank splitting, section ID validation

---

## Cross-References

- **Master index:** `SSOT_MASTER_INDEX.md`
- **Canonical map:** `SSOT_CANONICAL_MAP.json`
- **Conflict analysis:** `SSOT_CONFLICTS_AND_DUPES.md`
- **Migration plan:** `SSOT_MIGRATION_PATCHPLAN.md`
- **Truth contract:** `SSOT_RUNTIME_TRUTH_CONTRACT.md`
