import { ExcelCalcAgentService } from "./excelCalcAgent.service";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn((id: string) => {
    const banks: Record<string, unknown> = {
      calc_intent_patterns_en: {
        _meta: { id: "calc_intent_patterns_en" },
        patterns: [{ id: "test", operator: "excel.compute" }],
      },
      calc_intent_patterns_pt: {
        _meta: { id: "calc_intent_patterns_pt" },
        patterns: [{ id: "test_pt", operator: "excel.compute" }],
      },
      calc_task_taxonomy: {
        _meta: { id: "calc_task_taxonomy" },
        config: { categories: ["descriptive_stats"] },
        families: [{ id: "mean", category: "descriptive_stats" }],
      },
      slot_schemas_excel_calc: {
        _meta: { id: "slot_schemas_excel_calc" },
        slots: [{ slotId: "range", type: "string" }],
      },
      excel_function_catalog: {
        _meta: { id: "excel_function_catalog" },
        functions: [{ name: "AVERAGE", category: "statistical" }],
      },
      python_recipe_catalog: {
        _meta: { id: "python_recipe_catalog" },
        recipes: [{ id: "mean_recipe" }],
      },
      stats_method_ontology: {
        _meta: { id: "stats_method_ontology" },
        methods: [{ id: "t_test" }],
      },
      distribution_ontology: {
        _meta: { id: "distribution_ontology" },
        distributions: [{ id: "normal" }],
      },
      column_semantics_ontology: {
        _meta: { id: "column_semantics_ontology" },
        columns: [{ id: "revenue" }],
      },
      range_resolution_rules: {
        _meta: { id: "range_resolution_rules" },
        rules: [{ id: "rr_001" }],
      },
      numeric_integrity_rules: {
        _meta: { id: "numeric_integrity_rules" },
        rules: [{ id: "ni_001" }],
      },
      result_verification_policy: {
        _meta: { id: "result_verification_policy" },
        sections: [{ id: "rv_001" }],
      },
      clarification_policy_excel_calc: {
        _meta: { id: "clarification_policy_excel_calc" },
        policy: {},
      },
      chart_intent_taxonomy: {
        _meta: { id: "chart_intent_taxonomy" },
        intents: [{ id: "bar_chart" }],
      },
      chart_recipe_catalog: {
        _meta: { id: "chart_recipe_catalog" },
        recipes: [{ id: "bar_recipe" }],
      },
      chart_templates: {
        _meta: { id: "chart_templates" },
        templates: [{ id: "bar_template" }],
      },
      locale_numeric_date_rules: {
        _meta: { id: "locale_numeric_date_rules" },
        rules: [{ id: "lndr_001" }],
      },
      spreadsheet_semantics: {
        _meta: { id: "spreadsheet_semantics" },
        semantics: {},
      },
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
    expect(stats.loaded).toBe(18);
    expect(stats.failed).toBe(0);
  });

  it("should resolve calc intent patterns for EN", () => {
    const patterns = service.getIntentPatterns("en");
    expect(patterns).not.toBeNull();
  });

  it("should resolve calc intent patterns for PT", () => {
    const patterns = service.getIntentPatterns("pt");
    expect(patterns).not.toBeNull();
  });

  it("should return function catalog", () => {
    const catalog = service.getFunctionCatalog();
    expect(catalog).not.toBeNull();
  });

  it("should return task taxonomy", () => {
    const taxonomy = service.getTaskTaxonomy();
    expect(taxonomy).not.toBeNull();
  });

  it("should return slot schemas", () => {
    const schemas = service.getSlotSchemas();
    expect(schemas).not.toBeNull();
  });

  it("should return chart templates", () => {
    expect(service.getChartTemplates()).not.toBeNull();
  });

  it("should return stats method ontology", () => {
    expect(service.getStatsMethodOntology()).not.toBeNull();
  });

  it("should return verification policy", () => {
    expect(service.getVerificationPolicy()).not.toBeNull();
  });

  it("should return distribution ontology", () => {
    expect(service.getDistributionOntology()).not.toBeNull();
  });

  it("should return column semantics", () => {
    expect(service.getColumnSemantics()).not.toBeNull();
  });

  it("should return range resolution rules", () => {
    expect(service.getRangeResolutionRules()).not.toBeNull();
  });

  it("should return locale rules", () => {
    expect(service.getLocaleRules()).not.toBeNull();
  });

  it("should return clarification policy", () => {
    expect(service.getClarificationPolicy()).not.toBeNull();
  });

  it("should return chart recipe catalog", () => {
    expect(service.getChartRecipeCatalog()).not.toBeNull();
  });

  it("should return chart intent taxonomy", () => {
    expect(service.getChartIntentTaxonomy()).not.toBeNull();
  });

  it("should return recipe catalog", () => {
    expect(service.getRecipeCatalog()).not.toBeNull();
  });

  it("should return numeric integrity rules", () => {
    expect(service.getNumericIntegrityRules()).not.toBeNull();
  });
});
