# SSOT Conflicts & Duplications Report
Generated: 2026-03-02 | Registry v4.0.1 | 1,023 banks

## Executive Summary
- 5 overlap clusters identified across 1,023 registered banks
- 1 HIGH severity (domain ontology fork), 2 MEDIUM (doc types, sections), 2 LOW (entities, evidence)
- No true destructive duplicates — all overlaps are either parallel forks or layered complementary definitions
- 29 canonical mirrors identified (25 legal, 4 medical) — safe to clean up
- 6 category-level mutual dependency cycles detected

## Cluster 1: Domain Ontology Triple — HIGH Severity

### The Conflict
Three independent sources claim authority over domain taxonomy:

| Source | Bank ID | Version | Domains | Subdomains | Key Fields |
|--------|---------|---------|---------|------------|------------|
| Root Taxonomy | `domain_ontology` | 3.0.0 | 10 parents | 54 children | retrievalProfiles, formattingProfiles, terminologyHooks, aliases |
| DI Enumeration | `di_domain_ontology` | 1.1.0 | 14 flat | none | crossDomainLinks, bilingual labels (en/pt) |
| Domain Profiles | `domain_profile_*` | varies | 14 | varies | per-domain capabilities, operator support |

### Domain ID Alignment
- **Shared (7):** banking, billing, insurance, medical, legal, accounting, finance
- **Root-only (3):** personal_docs, excel, general
- **DI-only (7):** education, housing, hr_payroll, identity, ops, tax, travel

### Critical Gap
`di_domain_ontology` declares `dependsOn: []` — no dependency on root `domain_ontology`. This makes it an autonomous parallel definition, not a downstream derivative. The root ontology doesn't know about 7 DI domains, and the DI ontology doesn't know about 3 root domains.

### SSOT Decision
| Concept | Canonical Source | Reasoning |
|---------|-----------------|-----------|
| Domain taxonomy & hierarchy | `domain_ontology` | Root authority with parent/child structure, retrieval/formatting profiles |
| DI-layer domain enumeration | `di_domain_ontology` | Scoped to document intelligence with bilingual labels and cross-domain links |
| Per-domain capabilities | `domain_profile_*` | Granular operator support and feature flags per domain |

### Required Migration
1. Add `dependsOn: ["domain_ontology"]` to `di_domain_ontology`
2. Add `_meta.ssotRole: "di_enumeration"` marker to `di_domain_ontology`
3. Add `_meta.ssotRole: "root_taxonomy"` marker to `domain_ontology`
4. Add cross-validation in `documentIntelligenceIntegrity.service.ts`: verify shared domain IDs match
5. Consider adding the 7 DI-only domains as subdomains under a new `general` or `specialized` parent in root ontology

## Cluster 2: Doc Type Definitions — MEDIUM Severity

### The Conflict
Two parallel registries define document types with different schemas and incompatible domain coverage:

| Source | Bank ID | Entries | Domains | Schema |
|--------|---------|---------|---------|--------|
| DI Doc Type Ontology | `di_doc_type_ontology` | 202 | 13 | id, domainId, label, labelPt, category |
| Master Doc Taxonomy | `doc_taxonomy` | 230 | 5 | id, domain, label, aliases, signals, retrievalProfile |

### Overlap Analysis
- **Shared doc type IDs:** 83
- **DI-only:** 119 (covering education, housing, hr_payroll, identity, insurance, tax, travel, billing, banking)
- **Taxonomy-only:** 147 (deeper coverage of finance, legal, medical, ops, accounting)
- **Domain set incompatibility:** `doc_taxonomy` enforces `failOnUnknown: true` against only 5 canonical domains; DI uses 13

### Field Comparison
| Field | di_doc_type_ontology | doc_taxonomy |
|-------|---------------------|-------------|
| category | ✅ (23 categories) | ❌ |
| aliases | ❌ | ✅ |
| signals | ❌ | ✅ |
| retrievalProfile | ❌ | ✅ |
| bilingual labels | ✅ (labelPt) | ❌ |

### SSOT Decision
| Concept | Canonical Source |
|---------|-----------------|
| DI doc type enumeration (what exists) | `di_doc_type_ontology` |
| Retrieval profile assignment (how to retrieve) | `doc_taxonomy` |
| Bank path resolution (where to find banks) | `doc_type_catalog_*` |

### No Migration Required (for now)
These are layered definitions at different abstraction levels. The incompatible domain sets are the real issue — tracked separately in Cluster 1.

## Cluster 3: Section Definitions — MEDIUM Severity

### The Conflict
Section concepts defined at three layers:

| Source | Bank ID | Entries | Purpose |
|--------|---------|---------|---------|
| Section Ontology | `di_section_ontology` | 64 sections | What sections exist (ID, label, category, domains) |
| Section Priority | `section_priority_*` | 5 banks | Retrieval ordering per domain |
| Per-Doctype Sections | `*.sections.any.json` | 172 files | Which sections belong to each doc type |

### Nature: Layered Complementary
This is NOT a true conflict. Each source answers a different question:
- Ontology: "What sections exist in the system?"
- Priority: "In what order should sections be retrieved for a given domain?"
- Per-doctype: "Which sections does this specific document type contain?"

### SSOT Decision
| Concept | Canonical Source |
|---------|-----------------|
| Section ID registry | `di_section_ontology` |
| Retrieval ordering | `section_priority_*` |
| Doc-type membership | Per-doctype `.sections.any.json` files |

### Gap
`di_section_ontology` references DI domain IDs only — same Cluster 1 dependency. No per-section validation that section IDs used in priority and per-doctype files actually exist in the ontology.

## Cluster 4: Entity Patterns — LOW Severity

### The Conflict
Entity concepts defined at three complementary layers:

| Source | Bank ID | Entries | Purpose |
|--------|---------|---------|---------|
| Entity Ontology | `di_entity_ontology` | 45 types | What entity types exist (categories, extraction hints) |
| Pattern Banks | `*_patterns` (money, date, party, identifier) | 4 banks | Regex extraction patterns |
| Entity Schemas | `*.entities.schema.any.json` | 172 files | JSON Schema validation contracts |

### Nature: Complementary (No Conflict)
- Ontology defines WHAT to extract
- Pattern banks define HOW to extract (regex)
- Entity schemas define validation contracts
- No overlapping field definitions

### SSOT Decision
All three are canonical for their respective layers. No migration needed.

## Cluster 5: Evidence & Extraction — LOW Severity

### The Conflict

| Source | Bank ID | Purpose |
|--------|---------|---------|
| Extraction Policy | `extraction_policy` | Extraction modes (STRICT_EXTRACT, ALLOW_INFERENCE), confidence thresholds |
| Evidence Packaging | `evidence_packaging` | Packaging contract, dedup, score thresholds, evidence object schema |
| Evidence Requirements | `evidence_requirements_*` | 14 per-domain rule sets |

### Nature: Different Abstraction Levels (No Conflict)
- `extraction_policy`: Controls extraction behavior (inference allowed? confidence threshold?)
- `evidence_packaging`: Controls post-retrieval packaging (how many items? dedup? schema?)
- `evidence_requirements_*`: Domain-specific rules

### Budget Consistency Check
- `extraction_policy.evidenceBudget.extraction.maxEvidenceItems`: 16
- `evidence_packaging.config.actionsContract.thresholds.maxEvidenceItemsSoft`: 18
- Consistent: extraction budget (16) < packaging budget (18) ✅

### SSOT Decision
All three are canonical for their respective layers. No migration needed.

---

## Appendix A: Canonical Mirrors (29 files)

29 files on disk that are domain-prefixed mirrors of canonical files. All in `document_intelligence/domains/legal/` (25) and `medical/` (4).

### Breakdown by Type
| Type | Legal | Medical | Total |
|------|-------|---------|-------|
| Extraction hints | 7 | 0 | 7 |
| Section definitions | 7 | 0 | 7 |
| Table definitions | 7 | 0 | 7 |
| Abbreviations (en+pt) | 2 | 2 | 4 |
| Lexicons (en+pt) | 2 | 2 | 4 |
| **Total** | **25** | **4** | **29** |

### Status
- None are registered in bank_registry (intentionally excluded)
- All have canonical counterparts that ARE registered
- The existing `unused_bank_audit.json` tracks these as excluded
- **Recommendation:** Delete mirrors, add redirect aliases if any code references them

## Appendix B: Quarantine (11 files)

All 11 files in `_quarantine/2026-02-memory-audit/`:
- 4 schema files: `rich_message.schema.json`, `creative.schema.json`, `editing.schema.json`, `connectors.schema.json`
- 6 dictionary files: `editing_synonyms.{en,pt}.json`, `file_actions_synonyms.{en,pt}.json`, `connectors_synonyms.{en,pt}.json`
- 1 report: `__bank_generation_report.any.json`

### Status
From a February 2026 memory audit. These should be reviewed for promotion or deletion.

## Appendix C: Category-Level Dependency Cycles

6 mutual dependency cycles detected at the category level:

| Cycle | Nature |
|-------|--------|
| `manifest` ↔ `schemas` | Bootstrap mutual reference — manifest defines bank schema, schemas require manifest to load |
| `manifest` ↔ `semantics` | Manifest references semantic banks, semantics reference manifest structure |
| `normalizers` ↔ `semantics` | Normalizers use semantic data, some semantic banks reference normalizer output |
| `routing` ↔ `semantics` | Routing uses semantic domain IDs, semantic banks reference routing patterns |
| `operators` ↔ `semantics` | Operators use semantic domain data, semantics reference operator catalogs |
| `quality` ↔ `semantics` | Quality gates reference semantic concepts, semantics reference quality thresholds |

### Assessment
These are all **bootstrap-order cycles**, not logical errors. The load order in bank_registry resolves them deterministically (manifest → schemas → normalizers → routing → operators → semantics). The `semantics` category is the most coupled — it participates in 5 of 6 cycles. This is expected given semantics contains 606 banks (59.5% of all banks).

## Appendix D: Unclassified Orphans (18 files)

Files on disk not in registry and not fitting standard orphan categories:

| Path | Nature |
|------|--------|
| `document_intelligence/__implementation_report.any.json` | Build artifact |
| `legal/abbreviations/legal.{en,pt}.any.json` (2) | Canonical mirrors |
| `legal/doc_types/extraction/legal_*.extraction_hints.any.json` (7) | Canonical mirrors |
| `legal/lexicons/legal.{en,pt}.any.json` (2) | Canonical mirrors |
| `medical/abbreviations/medical.{en,pt}.any.json` (2) | Canonical mirrors |
| `medical/lexicons/medical.{en,pt}.any.json` (2) | Canonical mirrors |
| `quality/training/intent_training.jsonl` | Training data |
| `quality/training/multi_intent.jsonl` | Training data |

Note: 16 of these 18 are actually additional canonical mirrors (raising the true total to ~45). The remaining 2 are training JSONL files.

---

## Cross-References

- **Master index:** `SSOT_MASTER_INDEX.md`
- **Canonical map:** `SSOT_CANONICAL_MAP.json`
- **Migration plan:** `SSOT_MIGRATION_PATCHPLAN.md`
- **Runtime truth contract:** `SSOT_RUNTIME_TRUTH_CONTRACT.md`
- **Scorecard:** `SSOT_SCORECARD.md`
