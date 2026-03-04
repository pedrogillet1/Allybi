# Data Bank SSOT Conflicts Report

> Generated: 2026-03-04 | Based on SSOT analysis of 1,019+ registered banks and 1,412+ files on disk

---

## Executive Summary

- **5 conflict clusters** identified
- **1 HIGH severity** (domain ontology fork)
- **2 MEDIUM severity** (doc type registries, table header ontology)
- **2 LOW severity** (entity definitions, evidence policies)
- **29 canonical mirrors** on disk (25 legal, 4 medical) — should be deleted
- **11 quarantine files** pending since Feb 2026

---

## Cluster 1: Domain Ontology Fork — HIGH SEVERITY

### The Conflict

Three independent sources claim authority over domain taxonomy:

| Source | Bank ID | Version | Domains | Subdomains | Key Fields |
|--------|---------|---------|---------|------------|------------|
| Root Taxonomy | `domain_ontology` | 3.0.0 | 10 parents | 54 children | retrievalProfiles, formattingProfiles, terminologyHooks, aliases |
| DI Enumeration | `di_domain_ontology` | 2.0.0 | 14 flat | none | crossDomainLinks, bilingual labels (en/pt) |
| Domain Profiles | `domain_profile_*` | varies | 14 | varies | per-domain capabilities, operator support |

### Domain ID Alignment

| Set | Domain IDs |
|-----|-----------|
| Shared (7) | banking, billing, insurance, medical, legal, accounting, finance |
| Root-only (3) | personal_docs, excel, general |
| DI-only (7) | education, housing, hr_payroll, identity, ops, tax, travel |

### Critical Gap

`di_domain_ontology` declares `dependsOn: []` — autonomous parallel definition with NO dependency on root `domain_ontology`. This means:
- No boot-time validation that shared domain IDs stay aligned
- Drift is guaranteed over time
- Domain misrouting, incomplete coverage, silent failures possible

### Evidence

- File: `backend/src/data_banks/semantics/domain_ontology.any.json` — 10 parent domains, 54 subdomains
- File: `backend/src/data_banks/document_intelligence/semantics/domain_ontology.any.json` — 14 flat domains, `dependsOn: []`
- No cross-validation exists between these two ontologies at boot or CI time

### Required Fix

1. Add `dependsOn: ["domain_ontology"]` to `di_domain_ontology`
2. Add `_meta.ssotRole: "root_taxonomy"` to `domain_ontology`
3. Add `_meta.ssotRole: "di_enumeration"` to `di_domain_ontology`
4. Add cross-validation in `documentIntelligenceIntegrity.service.ts`: verify shared 7 domain IDs match
5. Expand root ontology to acknowledge DI-only domains (or formally document the split)

---

## Cluster 2: Doc Type Registries — MEDIUM SEVERITY

### The Conflict

Two parallel registries define document types with incompatible schemas:

| Source | Bank ID | Entries | Domains | Schema Fields |
|--------|---------|---------|---------|---------------|
| DI Doc Type Ontology | `di_doc_type_ontology` | 202 | 13 | id, domainId, label, labelPt, category |
| Master Doc Taxonomy | `doc_taxonomy` | 230 | 15 | id, domain, label, aliases, signals, retrievalProfile |

### Overlap

- **Shared doc type IDs**: 83
- **DI-only**: 119 entries (education, housing, hr_payroll, identity, insurance, tax, travel, billing, banking domains)
- **Taxonomy-only**: 147 entries (deeper coverage of finance, legal, medical, ops, accounting)
- **Domain set incompatibility**: `doc_taxonomy` uses `failOnUnknown: true` against only its canonical domains

### Field Incompatibility

| Field | di_doc_type_ontology | doc_taxonomy |
|-------|---------------------|-------------|
| category | YES (23 categories) | NO |
| aliases | NO | YES |
| signals | NO | YES |
| retrievalProfile | NO | YES |
| bilingual labels | YES (labelPt) | NO |

### SSOT Decision

| Concept | Canonical Source |
|---------|-----------------|
| DI doc type enumeration (what exists) | `di_doc_type_ontology` |
| Retrieval profile assignment (how to retrieve) | `doc_taxonomy` |
| Bank path resolution (where to find banks) | `doc_type_catalog_*` per domain |

### Evidence

- File: `backend/src/data_banks/semantics/taxonomy/doc_taxonomy.any.json` — v3.0.0, 230 entries
- File: `backend/src/data_banks/document_intelligence/semantics/doc_type_ontology.any.json` — 202 entries
- Test: `doc-taxonomy-ssot.test.ts` validates single canonical file but NOT cross-validation with DI ontology

---

## Cluster 3: Table Header Ontology — MEDIUM SEVERITY

### The Conflict

Table header definitions exist in two locations:

| Location | Files | Domains |
|----------|-------|---------|
| `semantics/structure/table_header_ontology.*.any.json` | 10 files | accounting, banking, billing, everyday, finance, insurance, legal, medical, ops, tax |
| `document_intelligence/semantics/structure/table_header_ontology.*.any.json` | 5 files | accounting, everyday, finance, legal, medical |

### Impact

5 duplicate definitions across locations. The semantics/structure versions are canonical (registered in bank_registry), but the DI versions create confusion for developers.

### Required Fix

Delete the 5 DI duplicate files or convert them to aliases/redirects.

---

## Cluster 4: Entity Definitions — LOW SEVERITY

### Nature: Layered Complementary (NOT true conflict)

| Source | Purpose | Count |
|--------|---------|-------|
| `di_entity_ontology` | What entities exist (45 types) | 1 bank |
| Pattern banks (money, date, party, identifier) | HOW to extract entities | 4 banks |
| Entity schemas (`.entities.schema.json`) | VALIDATION contracts | 172 files |

These answer different questions. No action needed beyond registering the 166 orphan entity schemas.

---

## Cluster 5: Evidence Policies — LOW SEVERITY

Evidence requirements split across:
- `evidence_packaging` (retrieval — how to package evidence)
- `evidence_requirements_*` (per-domain — what evidence is needed)
- `doc_grounding_checks` (quality — how to verify evidence)

These are complementary layers. No action needed.

---

## Canonical Mirror Files (29 files — DELETE)

All unregistered, all have canonical counterparts:

### Legal Domain (25 files)
- `document_intelligence/domains/legal/abbreviations/legal.{en,pt}.any.json`
- `document_intelligence/domains/legal/lexicons/legal.{en,pt}.any.json`
- `document_intelligence/domains/legal/doc_types/extraction/legal_*.extraction_hints.any.json` (7 files)
- `document_intelligence/domains/legal/doc_types/sections/legal_*.sections.any.json` (7 files)
- `document_intelligence/domains/legal/doc_types/tables/legal_*.tables.any.json` (7 files)

### Medical Domain (4 files)
- `document_intelligence/domains/medical/abbreviations/medical.{en,pt}.any.json`
- `document_intelligence/domains/medical/lexicons/medical.{en,pt}.any.json`

---

## Quarantine Files (11 files — REVIEW OR DELETE)

Location: `_quarantine/2026-02-memory-audit/`
- 4 schema files: rich_message, creative, editing, connectors
- 6 dictionary files: editing_synonyms, file_actions_synonyms, connectors_synonyms (en+pt pairs)
- 1 report: `__bank_generation_report.any.json`

**Status**: Stale since February 2026. No resolution documented. Should be reviewed and either promoted or deleted.

---

## Deprecated Files (42 files)

Location: `_deprecated/`
- 31 legacy DI bank files
- 11 other deprecated assets

These are not registered and not loaded. Safe to delete after confirming no external references.

---

## SSOT Documentation Status

| Document | Path | Status |
|----------|------|--------|
| SSOT Scorecard | `reports/ssot/SSOT_SCORECARD.md` | EXISTS — score 7.4/10 |
| SSOT Conflicts | `reports/ssot/SSOT_CONFLICTS_AND_DUPES.md` | EXISTS |
| SSOT Runtime Contract | `reports/ssot/SSOT_RUNTIME_TRUTH_CONTRACT.md` | EXISTS |
| SSOT Migration Plan | `reports/ssot/SSOT_MIGRATION_PATCHPLAN.md` | EXISTS |
| SSOT Master Index | `reports/ssot/SSOT_MASTER_INDEX.md` | EXISTS |

The SSOT documentation exists but the fixes have NOT been implemented. The domain ontology fork remains unresolved.
