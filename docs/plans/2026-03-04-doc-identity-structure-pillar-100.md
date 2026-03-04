# Pillar Audit: Document Identity & Structure Understanding

**Date:** 2026-03-04
**Auditor:** Claude Opus 4.6
**Scope:** Banks, runtime consumers, tests, SSOT discipline

---

## 1. Score Table

| Criterion | Max | Score | Rationale |
|-----------|-----|-------|-----------|
| **Doc type detection precision/recall** | 25 | **14** | 251 doc types defined across 15 domains. Taxonomy v3 with aliases is solid. BUT: tiebreak policy covers only 18/105 domain pairs (17%). 8 high-risk confusion pairs (everyday vs specialized) have zero disambiguation. `getDocArchetypes()` defined for 5 domains but has **zero runtime callers** — decorative. |
| **Section ontology coverage + heading matching EN/PT** | 20 | **15** | section_ontology v2.0 has 620+ canonical signatures with EN/PT labels. All 251 doc types have section files with heading anchors. Section anchors are wired into retrievalEngine `buildDocTypeBoostPlan()`. Deduction: 3 phantom domains (compliance, education_research, procurement) defined in ontology but have zero implementation folders. |
| **Table type detection + header ontology correctness** | 20 | **16** | 15 per-domain `table_header_ontology.{domain}.any.json` files with synonyms, priority scoring, and tiebreak contracts. All 251 doc types have table files. Table anchors consumed by retrieval engine. Deduction: 14 doc types missing extraction_hints (no field-level guidance). |
| **Version/amendment chain handling** | 10 | **7** | `amendment_chain_schema.any.json` defines 5 relationship types (amends, supersedes, restates, extends, terminates), 6 version statuses, 3 conflict detection rules. `effective_date_resolution.any.json` exists. Tests pass. Deduction: no runtime consumer found that actually resolves amendment chains at query time — schema exists but chain resolution is not wired into scopeGate or retrieval. |
| **Disambiguation behavior: ask ONE best question** | 10 | **9** | `clarificationPolicy.service.ts` enforces maxQuestions=1, 2-4 options, multilingual (EN/PT/ES). `scopeGate.service.ts` has section-level and doc-level disambiguation with autopick thresholds (score>=0.85, gap>=0.25). Tested in certification. Minor deduction: no doc_type-level confusion matrix bank exists. |
| **Wrong-doc prevention via structure cues** | 10 | **9** | `wrong_doc_lock.any.json` has 34 rules. `wrong_section_lock.any.json` has 8 rules. Enforced by qualityGateRunner. `wrong-doc.cert.test.ts` proves zero-contamination across doc locks. Solid. |
| **Maintainability / SSOT discipline** | 5 | **2** | **CRITICAL SSOT VIOLATIONS:** (1) Two independent domain_ontology files with `dependsOn: []` — guaranteed drift. (2) `di_doc_type_ontology` (202 types) vs `doc_taxonomy` (230 types) with incompatible schemas. (3) Legacy naming duals (nda/legal_nda, soap_note/med_soap_note — 16 conflicting files). (4) 3 domains in ontologies absent from canonical taxonomy set. |
| **TOTAL** | **100** | **72** | **Grade: C+** |

---

## 2. P0 Blockers Assessment

| P0 Blocker | Status | Evidence |
|------------|--------|----------|
| Frequent confusion between everyday docs and medical/finance/legal | **PARTIALLY ADDRESSED** | TBK_016/017/018 hardcode "medical/legal/finance NEVER everyday" but only 18/105 domain pairs have rules. No doc_type confusion matrix exists for `every_bank_statement` vs `banking_bank_statement` vs `fin_bank_statement`. |
| Section targeting fails ("the termination clause") without asking a single clear question | **FIXED** | scopeGate `extractSectionHint()` detects section keywords (clause/section/part in EN/PT/ES), scores candidates, and routes to clarification_policy with single-question enforcement. |
| Two sources of truth for doc types/sections (SSOT violation) | **STILL BROKEN** | Two domain_ontology files. Two doc type registries (di_doc_type_ontology vs doc_taxonomy). 16 legacy naming conflicts. `di_domain_ontology` has `dependsOn: []` — no cross-validation at boot. |

---

## 3. Runtime Wiring Proof

### WIRED (proven by callers)

| Bank | Accessor | Consumers | Proof |
|------|----------|-----------|-------|
| `doc_taxonomy` | `getDocTaxonomy()` | scopeGate.service.ts:356 | Controls doc-ref matching and scope locks |
| `doc_aliases_{domain}` | `getMergedDocAliasesBank()` | scopeGate.service.ts:357, documentReferenceResolver.service.ts:158 | User doc name -> docId resolution |
| `{domain}_{docType}_sections` | `getDocTypeSections()` | retrievalEngine.service.ts:1821 | Section anchors for structural search |
| `{domain}_{docType}_tables` | `getDocTypeTables()` | retrievalEngine.service.ts:1828 | Table header/column anchors |
| `{domain}_{docType}_extraction_hints` | `getDocTypeExtractionHints()` | retrievalEngine.service.ts:3572 | Field extraction guidance (up to 5 hints) |
| `section_priority_{domain}` | `getSectionPriorityRules()` | retrievalEngine.service.ts | Section ranking for multi-section docs |
| `wrong_doc_lock` | qualityGateRunner | qualityGateRunner.service.ts | Zero-contamination enforcement |
| `cross_domain_tiebreak_policy` | bankSelectionPlanner | bankSelectionPlanner.service.ts:95 | Domain scoring and tiebreak |

### DECORATIVE (zero callers)

| Bank | Accessor | Status |
|------|----------|--------|
| `doc_archetypes_{domain}` | `getDocArchetypes()` | **ZERO callers** — method defined at documentIntelligenceBanks.service.ts:385 but never called by any service |
| `di_{type}_ontology` (section, doc_type, entity, table, unit_and_measurement, domain) | `getDiOntology()` | **ZERO callers** — method defined at documentIntelligenceBanks.service.ts:762 but never called |

---

## 4. Fifteen Concrete Missing Bank Families / Files

### Tier 1: CRITICAL (breaks deterministic classification)

| # | Missing Bank | Path | Impact |
|---|-------------|------|--------|
| 1 | `doc_archetypes/banking.any.json` | `semantics/taxonomy/doc_archetypes/` | No structural identity for banking docs |
| 2 | `doc_archetypes/billing.any.json` | `semantics/taxonomy/doc_archetypes/` | No structural identity for billing docs |
| 3 | `doc_archetypes/everyday.any.json` | `semantics/taxonomy/doc_archetypes/` | No structural identity for everyday docs — root cause of everyday-vs-specialized confusion |
| 4 | `doc_archetypes/insurance.any.json` | `semantics/taxonomy/doc_archetypes/` | No structural identity for insurance docs |
| 5 | `doc_archetypes/identity.any.json` | `semantics/taxonomy/doc_archetypes/` | No structural identity for identity docs |
| 6 | `doc_type_confusion_matrix.any.json` | `quality/document_intelligence/` | No rules for 8 high-risk everyday-vs-specialized confusions |
| 7 | 87 missing tiebreak rules in `cross_domain_tiebreak_policy.any.json` | `quality/document_intelligence/` | Only 17% of domain pairs covered |

### Tier 2: HIGH (incomplete extraction)

| # | Missing Bank | Path | Impact |
|---|-------------|------|--------|
| 8 | `banking_brokerage_statement.extraction_hints.any.json` | `domains/banking/doc_types/extraction/` | No field-level hints |
| 9 | `banking_cd_statement.extraction_hints.any.json` | `domains/banking/doc_types/extraction/` | No field-level hints |
| 10 | `banking_investment_account_statement.extraction_hints.any.json` | `domains/banking/doc_types/extraction/` | No field-level hints |
| 11 | `banking_wire_transfer_confirmation.extraction_hints.any.json` | `domains/banking/doc_types/extraction/` | No field-level hints |
| 12 | `id_birth_certificate.extraction_hints.any.json` | `domains/identity/doc_types/extraction/` | No field-level hints |
| 13 | `id_visa.extraction_hints.any.json` | `domains/identity/doc_types/extraction/` | No field-level hints |
| 14 | `ins_auto_declaration.extraction_hints.any.json` | `domains/insurance/doc_types/extraction/` | No field-level hints |

### Tier 3: SSOT repair

| # | Missing Bank | Path | Impact |
|---|-------------|------|--------|
| 15 | Runtime wiring for `getDocArchetypes()` + `getDiOntology()` | `services/core/` consumers | Two accessor methods with zero callers — need wiring or deprecation |

---

## 5. Ten Golden Eval Cases

```jsonl
{"id": "GOLD_DI_001", "query": "What is the termination clause?", "docType": "legal_msa", "domain": "legal", "expectedBehavior": "scopeGate detects 'clause' keyword, extracts section hint, routes to section disambiguation if multiple docs present. Returns termination clause content from MSA only.", "rubric": "section_targeting + wrong_doc_prevention", "priority": "P0"}
{"id": "GOLD_DI_002", "query": "Show me the balance on the bank statement", "docs": [{"name": "chase_checking_2024.pdf", "domain": "banking"}, {"name": "household_budget.xlsx", "domain": "everyday"}], "expectedBehavior": "Tiebreak resolves banking > everyday (TBK_011). Returns balance from banking_bank_statement sections only. Zero everyday contamination.", "rubric": "doc_type_detection + tiebreak + wrong_doc", "priority": "P0"}
{"id": "GOLD_DI_003", "query": "What does section 3.1 say?", "docs": [{"name": "NDA_Acme_2024.pdf", "domain": "legal"}, {"name": "MSA_Acme_2024.pdf", "domain": "legal"}], "expectedBehavior": "scopeGate detects explicit section ref '3.1' with score 0.95. Two docs have section 3.1 -> needs_doc_choice. clarificationPolicy asks ONE question with 2 options (NDA vs MSA). No answer until disambiguated.", "rubric": "disambiguation_single_question + section_targeting", "priority": "P0"}
{"id": "GOLD_DI_004", "query": "Quanto e o total da fatura?", "docs": [{"name": "fatura_enel_mar2024.pdf", "domain": "billing"}, {"name": "recibo_padaria.pdf", "domain": "everyday"}], "expectedBehavior": "PT query detected. Tiebreak billing > everyday (TBK_001). Section anchors match 'total' in billing_electricity_bill sections (PT labels). Returns total from utility bill.", "rubric": "multilingual_section_matching + tiebreak", "priority": "P0"}
{"id": "GOLD_DI_005", "query": "What are the lab results?", "docs": [{"name": "lab_report_jan2024.pdf", "domain": "medical"}, {"name": "insurance_eob_jan2024.pdf", "domain": "insurance"}], "expectedBehavior": "Tiebreak medical > insurance (TBK_003). Doc type detected as med_lab_results_report. Section anchors match lab result sections. Zero insurance contamination.", "rubric": "domain_tiebreak_safety + wrong_doc", "priority": "P0"}
{"id": "GOLD_DI_006", "query": "Show me the latest version of the agreement", "docs": [{"name": "MSA_v1_signed.pdf", "status": "superseded"}, {"name": "MSA_v2_draft.pdf", "status": "draft"}, {"name": "MSA_amendment_1.pdf", "relationship": "amends_v1"}], "expectedBehavior": "amendment_chain_schema resolves: v1 superseded, amendment_1 amends v1, v2 is draft (not in force). Should ask: 'Which version? The signed original (with amendment) or the draft v2?' Single question, 2 options.", "rubric": "version_chain + disambiguation", "priority": "P1"}
{"id": "GOLD_DI_007", "query": "What are the line items in the invoice?", "docs": [{"name": "invoice_2024_q3.pdf", "domain": "billing"}, {"name": "receipt_walmart.pdf", "domain": "everyday"}], "expectedBehavior": "Doc alias matching identifies 'invoice' -> billing_invoice_business. Table anchors match line item table headers (item, qty, price, total). Returns structured table data from invoice only. Receipt ignored.", "rubric": "doc_alias_resolution + table_header_ontology + wrong_doc", "priority": "P0"}
{"id": "GOLD_DI_008", "query": "How much do I owe on property tax?", "docs": [{"name": "property_tax_2024.pdf", "domain": "tax"}, {"name": "mortgage_statement_dec.pdf", "domain": "housing"}, {"name": "hoa_fees_q4.pdf", "domain": "housing"}], "expectedBehavior": "Query matches tax domain markers. Doc alias 'property tax' -> tax_property_tax_bill. Scope lock to property tax document. Housing docs excluded. Returns amount owed from tax sections.", "rubric": "cross_domain_disambiguation + scope_lock", "priority": "P1"}
{"id": "GOLD_DI_009", "query": "Summarize this document", "docs": [{"name": "patient_intake_form.pdf", "domain": "medical"}], "expectedBehavior": "Single doc -> no disambiguation needed. Doc type detected as med_patient_intake_form. Section anchors used. NOTE: extraction_hints MISSING for this type — extraction should still work via section/table banks but without field-level guidance.", "rubric": "single_doc_detection + missing_hints_graceful", "priority": "P1"}
{"id": "GOLD_DI_010", "query": "What is the interest rate on the CD?", "docs": [{"name": "cd_statement_6mo.pdf", "domain": "banking"}, {"name": "savings_statement.pdf", "domain": "banking"}], "expectedBehavior": "Doc alias 'CD' -> banking_cd_statement. Scope lock to CD document. Section anchors for banking_cd_statement locate interest rate field. NOTE: extraction_hints MISSING — reduced field guidance. Savings statement excluded via wrong_doc_lock.", "rubric": "same_domain_disambiguation + missing_hints", "priority": "P1"}
```

---

## 6. SSOT Conflict Map

| Conflict | Severity | Files Involved |
|----------|----------|----------------|
| **Domain ontology fork** | HIGH | `semantics/domain_ontology.any.json` (root v3.0) vs `document_intelligence/semantics/domain_ontology.any.json` (DI v2.0). DI has `dependsOn: []` — no cross-validation. |
| **Doc type registry split** | MEDIUM | `di_doc_type_ontology.any.json` (202 types, has labelPt) vs `doc_taxonomy.any.json` (230 types, has aliases/signals). Incompatible schemas, 83 overlapping IDs. |
| **Legacy naming conflicts** | MEDIUM | 16 files: `nda.*` vs `legal_nda.*` (legal domain), `soap_note.*` vs `med_soap_note.*` (medical domain). Both exist on disk. |
| **Phantom domains** | LOW | education_research, procurement, compliance defined in ontologies, have section definitions, but zero implementation folders in `domains/`. |

---

## 7. Summary Verdict

**Grade: C+ (72/100)**

### What works well
- 251 doc types with symmetric section+table coverage across 15 domains
- Section ontology v2 with 620+ bilingual signatures, wired into retrieval
- Wrong-doc prevention is battle-tested (34 rules, certification tests, zero-contamination proof)
- Disambiguation enforces single-question policy with autopick thresholds
- Table header ontology covers all 15 domains with synonyms and tiebreak contracts

### What's broken
- **Archetypes are decorative** — 5 defined, 10 missing, `getDocArchetypes()` has zero runtime callers
- **DI ontologies are decorative** — `getDiOntology()` has zero runtime callers
- **Tiebreak policy at 17%** — 87 of 105 domain pairs have no deterministic resolution
- **SSOT violated** — two domain ontologies, two doc type registries, 16 legacy name conflicts
- **Version chain is schema-only** — amendment relationships defined but not resolved at query time
- **No confusion matrix** — 8 high-risk doc type pairs (everyday vs specialized) have zero disambiguation rules
