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
  private readonly banks = new Map<string, unknown>();

  constructor() {
    for (const id of CALC_BANK_IDS) {
      const bank = getOptionalBank<unknown>(id);
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

  getIntentPatterns(locale: "en" | "pt"): unknown | null {
    return this.banks.get(
      locale === "pt" ? "calc_intent_patterns_pt" : "calc_intent_patterns_en",
    ) ?? null;
  }

  getFunctionCatalog(): unknown | null {
    return this.banks.get("excel_function_catalog") ?? null;
  }

  getTaskTaxonomy(): unknown | null {
    return this.banks.get("calc_task_taxonomy") ?? null;
  }

  getSlotSchemas(): unknown | null {
    return this.banks.get("slot_schemas_excel_calc") ?? null;
  }

  getRecipeCatalog(): unknown | null {
    return this.banks.get("python_recipe_catalog") ?? null;
  }

  getStatsMethodOntology(): unknown | null {
    return this.banks.get("stats_method_ontology") ?? null;
  }

  getDistributionOntology(): unknown | null {
    return this.banks.get("distribution_ontology") ?? null;
  }

  getChartTemplates(): unknown | null {
    return this.banks.get("chart_templates") ?? null;
  }

  getChartRecipeCatalog(): unknown | null {
    return this.banks.get("chart_recipe_catalog") ?? null;
  }

  getChartIntentTaxonomy(): unknown | null {
    return this.banks.get("chart_intent_taxonomy") ?? null;
  }

  getVerificationPolicy(): unknown | null {
    return this.banks.get("result_verification_policy") ?? null;
  }

  getClarificationPolicy(): unknown | null {
    return this.banks.get("clarification_policy_excel_calc") ?? null;
  }

  getColumnSemantics(): unknown | null {
    return this.banks.get("column_semantics_ontology") ?? null;
  }

  getRangeResolutionRules(): unknown | null {
    return this.banks.get("range_resolution_rules") ?? null;
  }

  getNumericIntegrityRules(): unknown | null {
    return this.banks.get("numeric_integrity_rules") ?? null;
  }

  getLocaleRules(): unknown | null {
    return this.banks.get("locale_numeric_date_rules") ?? null;
  }
}
