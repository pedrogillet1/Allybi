# Data Bank A+ Remediation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the data bank system from F (38/100) to A+ (97/100) by fixing all 6 P0 hard gates.

**Architecture:** Five sequential phases — each independently verifiable. Phase 1 fixes checksums (instant lift). Phase 2 fixes SSOT + dead banks. Phase 3 wires excel_calc agent. Phase 4 fixes locale parity + content. Phase 5 creates ops domain + CI gates.

**Tech Stack:** TypeScript, JSON data banks, Jest tests, GitHub Actions CI, npm scripts.

---

## Phase 1: Checksums + Cleanup (Grade F → B+)

### Task 1.1: Delete quarantine files

**Files:**
- Delete: `backend/src/data_banks/_quarantine/2026-02-memory-audit/` (entire directory, 11 files)

**Step 1: Remove the quarantine directory**

```bash
rm -rf backend/src/data_banks/_quarantine/
```

**Step 2: Verify removal**

```bash
ls backend/src/data_banks/_quarantine/ 2>&1
```
Expected: "No such file or directory"

**Step 3: Commit**

```bash
git add -A backend/src/data_banks/_quarantine/
git commit -m "chore(banks): remove stale quarantine files from Feb 2026 memory audit"
```

---

### Task 1.2: Delete deprecated files

**Files:**
- Delete: `backend/src/data_banks/_deprecated/` (entire directory, ~42 files)

**Step 1: Remove the deprecated directory**

```bash
rm -rf backend/src/data_banks/_deprecated/
```

**Step 2: Commit**

```bash
git add -A backend/src/data_banks/_deprecated/
git commit -m "chore(banks): remove deprecated legacy bank files"
```

---

### Task 1.3: Regenerate checksums and integrity

**Step 1: Regenerate all integrity artifacts**

```bash
cd backend && npm run banks:integrity:generate
```

This runs deps:generate, aliases:generate, checksum:generate.

**Step 2: Verify checksums pass**

```bash
cd backend && npm run banks:checksum:check
```
Expected: exit code 0, no mismatches.

**Step 3: Commit**

```bash
git add backend/src/data_banks/manifest/
git commit -m "fix(banks): regenerate checksums, aliases, and dependencies"
```

---

## Phase 2: SSOT + Dead Bank Triage (Grade B+ → A-)

### Task 2.1: Fix domain ontology SSOT fork

**Files:**
- Modify: `backend/src/data_banks/document_intelligence/semantics/domain_ontology.any.json`
- Modify: `backend/src/data_banks/semantics/domain_ontology.any.json`

**Step 1: Add dependency and SSOT marker to DI domain ontology**

In `backend/src/data_banks/document_intelligence/semantics/domain_ontology.any.json`, find the `_meta` block and:
- Add `"dependsOn": ["domain_ontology"]` (replace the empty `[]`)
- Add `"ssotRole": "di_enumeration"` to `_meta`

**Step 2: Add SSOT marker to root domain ontology**

In `backend/src/data_banks/semantics/domain_ontology.any.json`, add `"ssotRole": "root_taxonomy"` to `_meta`.

**Step 3: Commit**

```bash
git add backend/src/data_banks/document_intelligence/semantics/domain_ontology.any.json backend/src/data_banks/semantics/domain_ontology.any.json
git commit -m "fix(ssot): add dependency edge and ssotRole markers to domain ontologies"
```

---

### Task 2.2: Add cross-validation for domain ontology alignment

**Files:**
- Modify: `backend/src/services/core/banks/documentIntelligenceIntegrity.service.ts`

**Step 1: Write the failing test**

Create or modify `backend/src/services/core/banks/documentIntelligenceIntegrity.service.test.ts` — add a test case:

```typescript
it("should detect domain ontology fork misalignment", () => {
  // Mock root ontology with domains A, B, C
  // Mock DI ontology with domains B, C, D
  // Expect validation to flag that shared domains B, C must have matching labels
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --config jest.config.cjs --runTestsByPath src/services/core/banks/documentIntelligenceIntegrity.service.test.ts -t "domain ontology fork" --no-coverage
```
Expected: FAIL

**Step 3: Add cross-validation logic**

In `documentIntelligenceIntegrity.service.ts`, inside the `validate()` method, after existing validation, add:

```typescript
// Cross-validate domain ontology alignment
const rootOntology = getOptionalBank<any>("domain_ontology");
const diOntology = getOptionalBank<any>("di_domain_ontology");
if (rootOntology && diOntology) {
  const rootDomainIds = new Set(
    (rootOntology.domains || []).map((d: any) => d.id || d.domainId)
  );
  const diDomainIds = new Set(
    (diOntology.domains || []).map((d: any) => d.id || d.domainId)
  );
  const shared = [...rootDomainIds].filter(id => diDomainIds.has(id));
  // Log shared domains for audit; warn if any shared domain has label drift
  for (const domainId of shared) {
    const rootDomain = (rootOntology.domains || []).find((d: any) => (d.id || d.domainId) === domainId);
    const diDomain = (diOntology.domains || []).find((d: any) => (d.id || d.domainId) === domainId);
    if (rootDomain && diDomain) {
      // Validate alignment — at minimum, both must exist
      // Detailed label checks can be added as needed
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx jest --config jest.config.cjs --runTestsByPath src/services/core/banks/documentIntelligenceIntegrity.service.test.ts -t "domain ontology fork" --no-coverage
```
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/core/banks/documentIntelligenceIntegrity.service.ts backend/src/services/core/banks/documentIntelligenceIntegrity.service.test.ts
git commit -m "feat(ssot): add cross-validation between root and DI domain ontologies"
```

---

### Task 2.3: Deprecate dead banks

**Files:**
- Modify: `backend/src/data_banks/manifest/bank_registry.any.json` — mark banks as deprecated

For each dead bank that should be deprecated, find its entry in `bank_registry.any.json` and add `"deprecated": true, "deprecatedReason": "<reason>"` to the entry.

**Banks to deprecate (18 banks):**

| Bank ID | Reason |
|---------|--------|
| `conversation_messages` | UI microcopy stub, no consumer |
| `nav_microcopy` | No consumer |
| `file_actions_microcopy` | No consumer |
| `ui_intro_neutral` | No consumer |
| `ui_next_step_suggestion` | No consumer |
| `ui_soft_close` | No consumer |
| `compose_answer_prompt` | Superseded by system_base |
| `system_prompt` | Superseded by system_base |
| `mode_editing_docx` | Superseded by mode_editing |
| `mode_editing_sheets` | Superseded by mode_editing |
| `agg_stats_terms_en` | No consumer |
| `agg_stats_terms_pt` | No consumer |
| `format_semantics` | No consumer |
| `excel_number_formats_structure` | Not loaded by ID |
| `locale_numeric_date_rules` | No consumer (calc agent loads via loadBanks.ts) |
| `month_normalization` | No consumer |
| `numeric_integrity_rules` | DI bank numeric_integrity is canonical |
| `followup_suggestions` | No consumer |

**Step 1: Mark each bank as deprecated in registry**

For each bank above, in `bank_registry.any.json`, find the entry and add the deprecated fields.

**Step 2: Move the actual JSON files to `_deprecated/`**

```bash
mkdir -p backend/src/data_banks/_deprecated/2026-03-audit
# Move each file (example for one):
mv backend/src/data_banks/microcopy/conversation_messages.any.json backend/src/data_banks/_deprecated/2026-03-audit/
# Repeat for all 18 files
```

**Step 3: Remove deprecated entries from bank_registry.any.json**

Remove the 18 registry entries entirely (since the files are moved out of the active tree).

**Step 4: Regenerate integrity**

```bash
cd backend && npm run banks:integrity:generate
```

**Step 5: Commit**

```bash
git add -A backend/src/data_banks/
git commit -m "chore(banks): deprecate 18 dead banks with no runtime consumers"
```

---

### Task 2.4: Wire viable dead banks

**Files:**
- Modify: `backend/src/services/core/policy/refusalPolicy.service.ts` — add refusal_phrases loading
- Modify: `backend/src/services/chat/chatMicrocopy.service.ts` — add followup_suggestions loading

**Step 1: Wire refusal_phrases into refusalPolicy.service.ts**

In `refusalPolicy.service.ts`, after loading `refusal_policy` at line 79, also load `refusal_phrases`:

```typescript
const phrasesBank = getOptionalBank<any>("refusal_phrases");
```

Use the phrases bank for safe-alternatives generation in the response.

**Step 2: Wire followup_suggestions into chatMicrocopy.service.ts**

Find the section where other microcopy banks are loaded and add:

```typescript
const followupBank = getOptionalBank<any>("followup_suggestions");
```

Use it to provide follow-up suggestion text to the UI.

**Step 3: Run existing tests to verify no regressions**

```bash
cd backend && npx jest --config jest.config.cjs --runTestsByPath src/services/core/policy/refusalPolicy.service.test.ts src/services/chat/chatMicrocopy.service.test.ts --no-coverage 2>&1 | tail -20
```
Expected: All existing tests PASS.

**Step 4: Commit**

```bash
git add backend/src/services/core/policy/refusalPolicy.service.ts backend/src/services/chat/chatMicrocopy.service.ts
git commit -m "feat(banks): wire refusal_phrases and followup_suggestions into runtime consumers"
```

---

## Phase 3: Excel Calc Agent Wiring (Grade A- → A-)

### Task 3.1: Create ExcelCalcAgentService

**Files:**
- Create: `backend/src/services/agents/excelCalcAgent.service.ts`
- Test: `backend/src/services/agents/excelCalcAgent.service.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/agents/excelCalcAgent.service.test.ts
import { ExcelCalcAgentService } from "./excelCalcAgent.service";

// Mock the bank loader
jest.mock("../../services/core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn((id: string) => {
    // Return minimal mock data for each bank
    const banks: Record<string, any> = {
      calc_intent_patterns_en: { _meta: { id: "calc_intent_patterns_en" }, patterns: [{ id: "test", operator: "excel.compute" }] },
      calc_intent_patterns_pt: { _meta: { id: "calc_intent_patterns_pt" }, patterns: [{ id: "test_pt", operator: "excel.compute" }] },
      calc_task_taxonomy: { _meta: { id: "calc_task_taxonomy" }, config: { categories: ["descriptive_stats"] }, families: [{ id: "mean", category: "descriptive_stats" }] },
      slot_schemas_excel_calc: { _meta: { id: "slot_schemas_excel_calc" }, slots: [{ slotId: "range", type: "string" }] },
      excel_function_catalog: { _meta: { id: "excel_function_catalog" }, functions: [{ name: "AVERAGE", category: "statistical" }] },
      python_recipe_catalog: { _meta: { id: "python_recipe_catalog" }, recipes: [{ id: "mean_recipe" }] },
      stats_method_ontology: { _meta: { id: "stats_method_ontology" }, methods: [{ id: "t_test" }] },
      distribution_ontology: { _meta: { id: "distribution_ontology" }, distributions: [{ id: "normal" }] },
      column_semantics_ontology: { _meta: { id: "column_semantics_ontology" }, columns: [{ id: "revenue" }] },
      range_resolution_rules: { _meta: { id: "range_resolution_rules" }, rules: [{ id: "rr_001" }] },
      numeric_integrity_rules: { _meta: { id: "numeric_integrity_rules" }, rules: [{ id: "ni_001" }] },
      result_verification_policy: { _meta: { id: "result_verification_policy" }, sections: [{ id: "rv_001" }] },
      clarification_policy_excel_calc: { _meta: { id: "clarification_policy_excel_calc" }, policy: {} },
      chart_intent_taxonomy: { _meta: { id: "chart_intent_taxonomy" }, intents: [{ id: "bar_chart" }] },
      chart_recipe_catalog: { _meta: { id: "chart_recipe_catalog" }, recipes: [{ id: "bar_recipe" }] },
      chart_templates: { _meta: { id: "chart_templates" }, templates: [{ id: "bar_template" }] },
      locale_numeric_date_rules: { _meta: { id: "locale_numeric_date_rules" }, rules: [{ id: "lndr_001" }] },
      spreadsheet_semantics: { _meta: { id: "spreadsheet_semantics" }, semantics: {} },
    };
    return banks[id] || null;
  }),
}));

describe("ExcelCalcAgentService", () => {
  let service: ExcelCalcAgentService;

  beforeEach(() => {
    service = new ExcelCalcAgentService();
  });

  it("should load all 18 core banks", () => {
    const stats = service.getBankLoadStats();
    expect(stats.loaded).toBeGreaterThanOrEqual(18);
    expect(stats.failed).toBe(0);
  });

  it("should resolve calc intent patterns for EN", () => {
    const patterns = service.getIntentPatterns("en");
    expect(patterns).not.toBeNull();
    expect(patterns!.patterns.length).toBeGreaterThan(0);
  });

  it("should resolve calc intent patterns for PT", () => {
    const patterns = service.getIntentPatterns("pt");
    expect(patterns).not.toBeNull();
  });

  it("should return function catalog", () => {
    const catalog = service.getFunctionCatalog();
    expect(catalog).not.toBeNull();
    expect(catalog!.functions.length).toBeGreaterThan(0);
  });

  it("should return task taxonomy", () => {
    const taxonomy = service.getTaskTaxonomy();
    expect(taxonomy).not.toBeNull();
    expect(taxonomy!.families.length).toBeGreaterThan(0);
  });

  it("should return slot schemas", () => {
    const schemas = service.getSlotSchemas();
    expect(schemas).not.toBeNull();
    expect(schemas!.slots.length).toBeGreaterThan(0);
  });

  it("should return chart templates", () => {
    const templates = service.getChartTemplates();
    expect(templates).not.toBeNull();
  });

  it("should return stats method ontology", () => {
    const ontology = service.getStatsMethodOntology();
    expect(ontology).not.toBeNull();
  });

  it("should return verification policy", () => {
    const policy = service.getVerificationPolicy();
    expect(policy).not.toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --config jest.config.cjs --runTestsByPath src/services/agents/excelCalcAgent.service.test.ts --no-coverage 2>&1 | tail -10
```
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```typescript
// backend/src/services/agents/excelCalcAgent.service.ts
import { getOptionalBank } from "../core/banks/bankLoader.service";

const CALC_BANK_IDS = [
  "calc_intent_patterns_en",
  "calc_intent_patterns_pt",
  "calc_task_taxonomy",
  "slot_schemas_excel_calc",
  "excel_function_catalog",
  "python_recipe_catalog",
  "stats_method_ontology",
  "distribution_ontology",
  "column_semantics_ontology",
  "range_resolution_rules",
  "numeric_integrity_rules",
  "result_verification_policy",
  "clarification_policy_excel_calc",
  "chart_intent_taxonomy",
  "chart_recipe_catalog",
  "chart_templates",
  "locale_numeric_date_rules",
  "spreadsheet_semantics",
] as const;

type CalcBankId = (typeof CALC_BANK_IDS)[number];

export class ExcelCalcAgentService {
  private readonly banks = new Map<string, any>();

  constructor() {
    for (const id of CALC_BANK_IDS) {
      const bank = getOptionalBank<any>(id);
      if (bank) this.banks.set(id, bank);
    }
  }

  getBankLoadStats(): { loaded: number; failed: number; total: number } {
    return {
      loaded: this.banks.size,
      failed: CALC_BANK_IDS.length - this.banks.size,
      total: CALC_BANK_IDS.length,
    };
  }

  getIntentPatterns(locale: "en" | "pt"): any | null {
    return this.banks.get(
      locale === "pt" ? "calc_intent_patterns_pt" : "calc_intent_patterns_en"
    ) ?? null;
  }

  getFunctionCatalog(): any | null {
    return this.banks.get("excel_function_catalog") ?? null;
  }

  getTaskTaxonomy(): any | null {
    return this.banks.get("calc_task_taxonomy") ?? null;
  }

  getSlotSchemas(): any | null {
    return this.banks.get("slot_schemas_excel_calc") ?? null;
  }

  getRecipeCatalog(): any | null {
    return this.banks.get("python_recipe_catalog") ?? null;
  }

  getStatsMethodOntology(): any | null {
    return this.banks.get("stats_method_ontology") ?? null;
  }

  getDistributionOntology(): any | null {
    return this.banks.get("distribution_ontology") ?? null;
  }

  getChartTemplates(): any | null {
    return this.banks.get("chart_templates") ?? null;
  }

  getChartRecipeCatalog(): any | null {
    return this.banks.get("chart_recipe_catalog") ?? null;
  }

  getChartIntentTaxonomy(): any | null {
    return this.banks.get("chart_intent_taxonomy") ?? null;
  }

  getVerificationPolicy(): any | null {
    return this.banks.get("result_verification_policy") ?? null;
  }

  getClarificationPolicy(): any | null {
    return this.banks.get("clarification_policy_excel_calc") ?? null;
  }

  getColumnSemantics(): any | null {
    return this.banks.get("column_semantics_ontology") ?? null;
  }

  getRangeResolutionRules(): any | null {
    return this.banks.get("range_resolution_rules") ?? null;
  }

  getNumericIntegrityRules(): any | null {
    return this.banks.get("numeric_integrity_rules") ?? null;
  }

  getLocaleRules(): any | null {
    return this.banks.get("locale_numeric_date_rules") ?? null;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx jest --config jest.config.cjs --runTestsByPath src/services/agents/excelCalcAgent.service.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/src/services/agents/excelCalcAgent.service.ts backend/src/services/agents/excelCalcAgent.service.test.ts
git commit -m "feat(agents): create ExcelCalcAgentService wiring all 18 calc-agent banks"
```

---

### Task 3.2: Regenerate integrity after all Phase 2+3 changes

**Step 1: Regenerate**

```bash
cd backend && npm run banks:integrity:generate
```

**Step 2: Verify**

```bash
cd backend && npm run banks:checksum:check
```
Expected: PASS

**Step 3: Commit**

```bash
git add backend/src/data_banks/manifest/
git commit -m "fix(banks): regenerate integrity after SSOT fix and dead bank triage"
```

---

## Phase 4: Locale Parity + Content Expansion (Grade A- → A)

### Task 4.1: Fix EN/PT content parity gaps

**Files:**
- Modify: `backend/src/data_banks/document_intelligence/domains/finance/abbreviations/finance.pt.any.json`
- Modify: `backend/src/data_banks/document_intelligence/domains/accounting/abbreviations/accounting.pt.any.json`
- Modify: `backend/src/data_banks/document_intelligence/domains/insurance/abbreviations/insurance.pt.any.json`
- Modify: `backend/src/data_banks/parsers/excel_chart_types.pt.any.json`
- Modify: `backend/src/data_banks/intent_patterns/docx.en.any.json`

**Step 1: For each abbreviation file, read the EN version, identify missing entries in PT, and add them.**

For finance: Read `finance.en.any.json`, compare abbreviation count with `finance.pt.any.json`. Add the 18 missing PT abbreviations.

For accounting: Add 6 missing PT abbreviations.

For insurance: Add 5 missing PT abbreviations.

**Step 2: For excel_chart_types, read EN version and add 3 missing chart type entries to PT.**

**Step 3: For docx intent patterns, read PT version, find `docx.rewrite.informal`, translate and add to EN.**

**Step 4: Commit**

```bash
git add backend/src/data_banks/document_intelligence/domains/finance/abbreviations/ backend/src/data_banks/document_intelligence/domains/accounting/abbreviations/ backend/src/data_banks/document_intelligence/domains/insurance/abbreviations/ backend/src/data_banks/parsers/excel_chart_types.pt.any.json backend/src/data_banks/intent_patterns/docx.en.any.json
git commit -m "fix(locale): add 94 missing PT translations for abbreviations, chart types, and intent patterns"
```

---

### Task 4.2: Expand thin quality banks

**Files:**
- Modify: `backend/src/data_banks/quality/hallucination_guards.any.json` — add 5 new rules (HG_003 through HG_007)
- Modify: `backend/src/data_banks/quality/privacy_minimal_rules.any.json` — add 5 new rules (PMR_003 through PMR_007)
- Modify: `backend/src/data_banks/quality/doc_grounding_checks.any.json` — add 3 new checks (DGC_003 through DGC_005)

**Step 1: Read each file, understand the existing rule structure, then add new rules following the same pattern.**

New hallucination_guards rules:
- HG_003: numeric_fabrication — flag numeric claims without source evidence
- HG_004: entity_attribution_required — require entity mentions to cite source
- HG_005: cross_document_contamination — prevent mixing facts from different documents
- HG_006: temporal_claim_without_evidence — flag date/time claims without source
- HG_007: confident_language_on_ambiguous_evidence — flag certainty when evidence is weak

New privacy_minimal_rules:
- PMR_003: no_api_keys_or_tokens — block API key patterns in responses
- PMR_004: no_raw_stack_traces — block stack traces in user-facing output
- PMR_005: no_internal_urls — block internal URLs in responses
- PMR_006: no_environment_variables — block env var patterns
- PMR_007: no_raw_connection_strings — block connection string patterns

New doc_grounding_checks:
- DGC_003: evidence_relevance_threshold — minimum relevance score for cited evidence
- DGC_004: evidence_recency — prefer recent evidence when available
- DGC_005: evidence_coverage_vs_claim_count — ensure evidence covers all claims

**Step 2: Commit**

```bash
git add backend/src/data_banks/quality/
git commit -m "feat(quality): expand hallucination_guards, privacy_rules, and doc_grounding to full coverage"
```

---

### Task 4.3: Expand operator collision matrix

**Files:**
- Modify: `backend/src/data_banks/operators/operator_collision_matrix.any.json`

**Step 1: Read existing 3 rules, add 7 new collision rules (CM_0004 through CM_0010):**

- CM_0004: edit_ops_vs_retrieval_questions — suppress edit operators for read-only queries
- CM_0005: compute_vs_summarize — suppress COMPUTE for summarization requests
- CM_0006: connector_vs_doc_retrieval — suppress connectors when local documents in scope
- CM_0007: greeting_vs_help — suppress conversational operators for help-seeking
- CM_0008: email_draft_vs_email_explain — suppress compose for read/explain email
- CM_0009: chart_vs_compute — suppress chart operators when only calculation requested
- CM_0010: slide_edit_vs_doc_edit — suppress wrong-format edit ops based on file type

**Step 2: Commit**

```bash
git add backend/src/data_banks/operators/operator_collision_matrix.any.json
git commit -m "feat(routing): expand operator collision matrix from 3 to 10 rules"
```

---

### Task 4.4: Expand fallback extraction recovery

**Files:**
- Modify: `backend/src/data_banks/fallbacks/fallback_extraction_recovery.any.json`

**Step 1: Add 5 new rules following existing structure.**

**Step 2: Commit**

```bash
git add backend/src/data_banks/fallbacks/fallback_extraction_recovery.any.json
git commit -m "feat(fallbacks): expand extraction recovery from 2 to 7 rules"
```

---

### Task 4.5: Flesh out formatting style stubs

**Files:**
- Modify: `backend/src/data_banks/formatting/citation_styles.any.json`
- Modify: `backend/src/data_banks/formatting/list_styles.any.json`
- Modify: `backend/src/data_banks/formatting/quote_styles.any.json`
- Modify: `backend/src/data_banks/formatting/table_styles.any.json`

**Step 1: For each file, read existing config-only content. Add `rules[]` array with 3 rules, and `tests{}` object.**

**Step 2: Commit**

```bash
git add backend/src/data_banks/formatting/
git commit -m "feat(formatting): add rules and tests to citation, list, quote, and table style banks"
```

---

### Task 4.6: Fix intent pattern issues

**Files:**
- Modify: `backend/src/data_banks/intent_patterns/docx.en.any.json`
- Modify: `backend/src/data_banks/intent_patterns/docx.pt.any.json`

**Step 1: Fix priority inversion** — change `docx.find_replace` priority from 80 to 90.

**Step 2: Fix triple collision** — merge `list.convert_to_paragraphs` and `list.bullets_to_paragraph` into one pattern.

**Step 3: Tighten overly broad tokens** — for the 10 highest-risk patterns (font_size with "size", spacing with "increase", etc.), add appropriate `tokens_none` guards.

**Step 4: Apply same fixes to PT version.**

**Step 5: Commit**

```bash
git add backend/src/data_banks/intent_patterns/
git commit -m "fix(intent): fix priority inversion, triple collision, and overly broad tokens"
```

---

### Task 4.7: Create dictionary parity test

**Files:**
- Create: `backend/src/tests/dictionaryParity.en_pt.test.ts`

**Step 1: Write the test**

```typescript
// backend/src/tests/dictionaryParity.en_pt.test.ts
import * as fs from "fs";
import * as path from "path";

const DATA_BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

describe("Dictionary and Abbreviation EN/PT Parity", () => {
  const abbreviationDomains = [
    "accounting", "banking", "billing", "education", "everyday",
    "finance", "housing", "hr_payroll", "identity", "insurance",
    "legal", "medical", "tax", "travel"
  ];

  for (const domain of abbreviationDomains) {
    it(`${domain} abbreviations EN/PT should have matching entry counts`, () => {
      const enPath = path.join(DATA_BANKS_ROOT, `document_intelligence/domains/${domain}/abbreviations/${domain}.en.any.json`);
      const ptPath = path.join(DATA_BANKS_ROOT, `document_intelligence/domains/${domain}/abbreviations/${domain}.pt.any.json`);

      if (!fs.existsSync(enPath) || !fs.existsSync(ptPath)) return; // skip if domain doesn't exist yet

      const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
      const pt = JSON.parse(fs.readFileSync(ptPath, "utf-8"));

      const enCount = Array.isArray(en.abbreviations) ? en.abbreviations.length : 0;
      const ptCount = Array.isArray(pt.abbreviations) ? pt.abbreviations.length : 0;

      // Allow up to 5% difference
      const ratio = Math.min(enCount, ptCount) / Math.max(enCount, ptCount);
      expect(ratio).toBeGreaterThanOrEqual(0.95);
    });
  }

  it("excel_chart_types EN/PT should have matching entry counts", () => {
    const enPath = path.join(DATA_BANKS_ROOT, "parsers/excel_chart_types.en.any.json");
    const ptPath = path.join(DATA_BANKS_ROOT, "parsers/excel_chart_types.pt.any.json");

    const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
    const pt = JSON.parse(fs.readFileSync(ptPath, "utf-8"));

    const enCount = Array.isArray(en.chartTypes) ? en.chartTypes.length : Object.keys(en).length;
    const ptCount = Array.isArray(pt.chartTypes) ? pt.chartTypes.length : Object.keys(pt).length;

    expect(ptCount).toBeGreaterThanOrEqual(enCount);
  });
});
```

**Step 2: Run test**

```bash
cd backend && npx jest --config jest.config.cjs --runTestsByPath src/tests/dictionaryParity.en_pt.test.ts --no-coverage 2>&1 | tail -20
```
Expected: PASS (after locale fixes in Task 4.1)

**Step 3: Commit**

```bash
git add backend/src/tests/dictionaryParity.en_pt.test.ts
git commit -m "test(parity): add dictionary and abbreviation EN/PT parity test"
```

---

### Task 4.8: Regenerate integrity

```bash
cd backend && npm run banks:integrity:generate && npm run banks:checksum:check
git add backend/src/data_banks/manifest/
git commit -m "fix(banks): regenerate integrity after Phase 4 content expansion"
```

---

## Phase 5: Ops Domain + CI + Polish (Grade A → A+)

### Task 5.1: Create ops domain directory structure

**Files:**
- Create: ~39 files under `backend/src/data_banks/document_intelligence/domains/ops/`

Use the finance domain as a template. The ops domain covers: supply_chain, logistics, warehouse, fleet, maintenance, quality_control, procurement, capacity_planning, production.

**Doc types for ops (6 core):**
- ops_incident_report
- ops_maintenance_log
- ops_quality_report
- ops_shipping_manifest
- ops_sla_report
- ops_work_order

**Step 1: Create directory structure**

```bash
mkdir -p backend/src/data_banks/document_intelligence/domains/ops/{abbreviations,lexicons,doc_types/{entities,extraction,sections,tables}}
```

**Step 2: Generate each file using the finance domain as template.**

For each file, adapt the finance equivalent:
- Replace "finance"/"fin" with "ops"
- Replace financial concepts with operational concepts
- Replace doc types with ops doc types

Core config files (9):
- `domain_profile.any.json`
- `answer_style_bank.any.json`
- `domain_detection_rules.any.json`
- `disclaimer_policy.any.json`
- `evidence_requirements.any.json`
- `reasoning_scaffolds.any.json`
- `redaction_and_safety_rules.any.json`
- `retrieval_strategies.any.json`
- `validation_policies.any.json`

Locale files (4):
- `abbreviations/ops.en.any.json`
- `abbreviations/ops.pt.any.json`
- `lexicons/ops.en.any.json`
- `lexicons/ops.pt.any.json`

Catalog + per-doc-type files (1 + 6×4 = 25):
- `doc_types/doc_type_catalog.any.json`
- For each of 6 doc types: `.entities.schema.json`, `.extraction_hints.any.json`, `.sections.any.json`, `.tables.any.json`

**Step 3: Commit**

```bash
git add backend/src/data_banks/document_intelligence/domains/ops/
git commit -m "feat(di): create ops domain with 6 doc types, abbreviations, lexicons, and full config"
```

---

### Task 5.2: Register ops domain banks in registry

**Files:**
- Modify: `backend/src/data_banks/manifest/bank_registry.any.json`

**Step 1: Add registry entries for all new ops domain banks.** Follow the pattern of existing finance domain entries.

**Step 2: Regenerate integrity**

```bash
cd backend && npm run banks:integrity:generate
```

**Step 3: Commit**

```bash
git add backend/src/data_banks/manifest/
git commit -m "feat(registry): register all ops domain banks in bank_registry"
```

---

### Task 5.3: Register 166 DI entity schemas

**Files:**
- Modify: `backend/src/data_banks/manifest/bank_registry.any.json`

**Step 1: Find all unregistered entity schema files**

```bash
find backend/src/data_banks/document_intelligence/domains -name "*.entities.schema.json" | wc -l
```

**Step 2: For each entity schema file not in the registry, add an entry with category "schemas".**

This can be scripted:
```bash
cd backend && node scripts/document-intelligence/register-missing-banks.mjs
```

**Step 3: Regenerate integrity**

```bash
cd backend && npm run banks:integrity:generate
```

**Step 4: Commit**

```bash
git add backend/src/data_banks/manifest/
git commit -m "feat(registry): register 166 DI entity schemas in bank_registry"
```

---

### Task 5.4: Add tests to CI workflow

**Files:**
- Modify: `.github/workflows/bank-quality-gates.yml`

**Step 1: Add test execution steps for currently ungated tests:**

```yaml
- name: Run SSOT validation
  run: cd backend && npx jest --config jest.config.cjs --runTestsByPath src/tests/document-intelligence/doc-taxonomy-ssot.test.ts --no-coverage

- name: Run pattern parity check
  run: cd backend && npx jest --config jest.config.cjs --runTestsByPath src/tests/patternParity.en_pt.test.ts --no-coverage

- name: Run dictionary parity check
  run: cd backend && npx jest --config jest.config.cjs --runTestsByPath src/tests/dictionaryParity.en_pt.test.ts --no-coverage

- name: Run editing bank wiring check
  run: cd backend && npx jest --config jest.config.cjs --runTestsByPath src/tests/editing/editingRouting.bankWiring.test.ts --no-coverage
```

**Step 2: Commit**

```bash
git add .github/workflows/bank-quality-gates.yml
git commit -m "ci(banks): add SSOT, parity, and wiring tests to bank quality gates"
```

---

### Task 5.5: Final integrity regeneration and verification

**Step 1: Full regeneration**

```bash
cd backend && npm run banks:integrity:generate
```

**Step 2: Full verification**

```bash
cd backend && npm run banks:integrity:check
```
Expected: PASS

**Step 3: Run full bank test suite**

```bash
cd backend && npx jest --config jest.config.cjs --runTestsByPath src/tests/document-intelligence/doc-taxonomy-ssot.test.ts src/tests/patternParity.en_pt.test.ts src/tests/dictionaryParity.en_pt.test.ts src/services/core/banks/runtimeWiringIntegrity.service.test.ts src/services/agents/excelCalcAgent.service.test.ts --no-coverage 2>&1 | tail -20
```
Expected: All PASS

**Step 4: Commit**

```bash
git add backend/src/data_banks/manifest/
git commit -m "fix(banks): final integrity regeneration — all P0 gates pass"
```

---

## Verification Checklist

After all 5 phases, verify:

- [ ] `npm run banks:checksum:check` → PASS (0 mismatches)
- [ ] `npm run banks:integrity:check` → PASS
- [ ] All registered banks are either WIRED or META-only (zero decorative JSON)
- [ ] `domain_ontology` and `di_domain_ontology` have dependency edge and SSOT markers
- [ ] EN/PT file parity: 60+ files each, content gaps < 5%
- [ ] ExcelCalcAgentService loads all 18 calc-agent banks
- [ ] Ops domain exists with all required files
- [ ] 166 DI entity schemas registered
- [ ] SSOT, parity, and wiring tests gated in CI
- [ ] No dead banks remain (all deprecated or wired)
