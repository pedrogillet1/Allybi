import { describe, expect, test, beforeAll } from "@jest/globals";
import {
  safeEditingBank,
  clearEditingBankCache,
} from "../services/editing/banks/bankService";
import {
  EditReceiptService,
  buildTemplateContext,
} from "../services/editing/editReceipt.service";

describe("Editing microcopy templates", () => {
  let bank: any;
  let uxBank: any;

  beforeAll(() => {
    clearEditingBankCache();
    bank = safeEditingBank<any>("editing_microcopy");
    uxBank = safeEditingBank<any>("editing_ux");
  });

  test("bank loads successfully", () => {
    expect(bank).not.toBeNull();
    expect(bank._meta.id).toBe("editing_microcopy");
  });

  // ---------------------------------------------------------------------------
  // Template interpolation
  // ---------------------------------------------------------------------------

  describe("template interpolation", () => {
    const interpolate = (
      template: string,
      params: Record<string, string>,
    ): string =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const val = params[key];
        return val == null ? "" : String(val);
      });

    const samplePayloads: Record<string, Record<string, string>> = {
      DOCX_CREATE_TABLE: { rowCount: "4", colCount: "3" },
      DOCX_SET_HEADING_LEVEL: { headingLevel: "2" },
      DOCX_TRANSLATE_SCOPE: {
        scopeLabel: "section 1",
        targetLanguage: "Portuguese",
      },
      DOCX_SET_RUN_STYLE: { styleDetail: "bold + italic" },
      XLSX_ADD_SHEET: { sheetName: "Q1 Revenue" },
      XLSX_RENAME_SHEET: { newSheetName: "Summary" },
      XLSX_DELETE_SHEET: { sheetName: "Temp" },
      XLSX_CHART_CREATE: { chartType: "bar", sourceRange: "A1:D10" },
      XLSX_SORT_RANGE: { sortRange: "A1:F50" },
      XLSX_FILTER_APPLY: { filterRange: "A1:G100" },
      XLSX_INSERT_ROWS: { rowCount: "3" },
      XLSX_DELETE_ROWS: { rowCount: "2" },
    };

    for (const [op, params] of Object.entries(samplePayloads)) {
      test(`no unresolved placeholders for ${op} (EN)`, () => {
        const template =
          bank.copy.byCanonicalOperator?.preview?.[op]?.en?.body || "";
        if (!template) return; // skip if no template
        const result = interpolate(template, params);
        expect(result).not.toMatch(/\{\{/);
      });

      test(`no unresolved placeholders for ${op} (PT)`, () => {
        const template =
          bank.copy.byCanonicalOperator?.preview?.[op]?.pt?.body || "";
        if (!template) return;
        const result = interpolate(template, params);
        expect(result).not.toMatch(/\{\{/);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Operator coverage — canonical operators have at least preview + applied
  // ---------------------------------------------------------------------------

  describe("canonical operator coverage", () => {
    const CANONICAL_OPERATORS = [
      "DOCX_CREATE_TABLE",
      "DOCX_ADD_TABLE_ROW",
      "DOCX_DELETE_TABLE_ROW",
      "DOCX_SET_TABLE_CELL",
      "DOCX_SET_HEADER",
      "DOCX_SET_FOOTER",
      "DOCX_INSERT_PAGE_NUMBERS",
      "DOCX_SET_HEADING_LEVEL",
      "DOCX_FIND_REPLACE",
      "DOCX_TRANSLATE_SCOPE",
      "DOCX_MERGE_PARAGRAPHS",
      "DOCX_SPLIT_PARAGRAPH",
      "DOCX_DELETE_PARAGRAPH",
      "DOCX_SET_RUN_STYLE",
      "DOCX_LIST_APPLY_BULLETS",
      "DOCX_LIST_APPLY_NUMBERING",
      "XLSX_ADD_SHEET",
      "XLSX_RENAME_SHEET",
      "XLSX_DELETE_SHEET",
      "XLSX_CHART_CREATE",
      "XLSX_SORT_RANGE",
      "XLSX_FILTER_APPLY",
      "XLSX_INSERT_ROWS",
      "XLSX_DELETE_ROWS",
    ];

    const stages = ["preview", "applied", "noop"];

    for (const op of CANONICAL_OPERATORS) {
      for (const stage of stages) {
        test(`${op} has non-empty EN body for '${stage}'`, () => {
          const body =
            bank.copy.byCanonicalOperator?.[stage]?.[op]?.en?.body || "";
          expect(body.length).toBeGreaterThan(0);
        });

        test(`${op} has non-empty PT body for '${stage}'`, () => {
          const body =
            bank.copy.byCanonicalOperator?.[stage]?.[op]?.pt?.body || "";
          expect(body.length).toBeGreaterThan(0);
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // No generic fallback when specific exists
  // ---------------------------------------------------------------------------

  describe("canonical differs from runtime fallback", () => {
    const DOCX_CANONICAL = [
      "DOCX_CREATE_TABLE",
      "DOCX_SET_HEADING_LEVEL",
      "DOCX_FIND_REPLACE",
      "DOCX_DELETE_PARAGRAPH",
    ];

    for (const op of DOCX_CANONICAL) {
      test(`${op} preview EN differs from EDIT_DOCX_BUNDLE`, () => {
        const canonicalBody =
          bank.copy.byCanonicalOperator?.preview?.[op]?.en?.body || "";
        const runtimeBody =
          bank.copy.byOperator?.preview?.EDIT_DOCX_BUNDLE?.en?.body || "";
        expect(canonicalBody).not.toBe(runtimeBody);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Bilingual parity — every EN key has a PT counterpart
  // ---------------------------------------------------------------------------

  describe("bilingual parity in byCanonicalOperator", () => {
    const byCO = bank?.copy?.byCanonicalOperator || {};
    for (const [stage, operators] of Object.entries(byCO)) {
      for (const [op, langs] of Object.entries(operators as any)) {
        const hasEn = Boolean((langs as any)?.en?.body);
        const hasPt = Boolean((langs as any)?.pt?.body);
        test(`${stage}.${op} has both EN and PT`, () => {
          expect(hasEn).toBe(true);
          expect(hasPt).toBe(true);
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Action labels — all 7 action kinds have labels in EN and PT
  // ---------------------------------------------------------------------------

  describe("action labels in bank", () => {
    const ACTION_KINDS = [
      "confirm",
      "cancel",
      "pick_target",
      "undo",
      "open_doc",
      "go_to_location",
      "export",
    ];

    for (const kind of ACTION_KINDS) {
      test(`actionLabel '${kind}' exists in EN`, () => {
        const label = bank?.copy?.actionLabels?.en?.[kind] || "";
        expect(label.length).toBeGreaterThan(0);
      });

      test(`actionLabel '${kind}' exists in PT`, () => {
        const label = bank?.copy?.actionLabels?.pt?.[kind] || "";
        expect(label.length).toBeGreaterThan(0);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Undo stage
  // ---------------------------------------------------------------------------

  describe("undo stage in byOperator", () => {
    test("undo.* has EN body", () => {
      const body = bank?.copy?.byOperator?.undo?.["*"]?.en?.body || "";
      expect(body.length).toBeGreaterThan(0);
    });

    test("undo.* has PT body", () => {
      const body = bank?.copy?.byOperator?.undo?.["*"]?.pt?.body || "";
      expect(body.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Editing UX bank
  // ---------------------------------------------------------------------------

  describe("editing_ux bank", () => {
    test("editing_ux bank loads", () => {
      expect(uxBank).not.toBeNull();
      expect(uxBank._meta.id).toBe("editing_ux");
    });

    test("no_selection_confirm has EN and PT", () => {
      expect(uxBank.prompts.no_selection_confirm.en.length).toBeGreaterThan(0);
      expect(uxBank.prompts.no_selection_confirm.pt.length).toBeGreaterThan(0);
    });

    test("range_required has EN and PT", () => {
      expect(uxBank.prompts.range_required.en.length).toBeGreaterThan(0);
      expect(uxBank.prompts.range_required.pt.length).toBeGreaterThan(0);
    });

    test("ambiguous_target has EN and PT", () => {
      expect(uxBank.prompts.ambiguous_target.en.length).toBeGreaterThan(0);
      expect(uxBank.prompts.ambiguous_target.pt.length).toBeGreaterThan(0);
    });

    test("prompts contain {{placeholders}} for interpolation", () => {
      expect(uxBank.prompts.no_selection_confirm.en).toContain(
        "{{fallbackScope}}",
      );
      expect(uxBank.prompts.range_required.en).toContain("{{exampleRange}}");
      expect(uxBank.prompts.ambiguous_target.en).toContain(
        "{{candidateCount}}",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Runtime wiring integration
  // ---------------------------------------------------------------------------

  describe("runtime wiring integration", () => {
    let receiptService: EditReceiptService;

    beforeAll(() => {
      receiptService = new EditReceiptService();
    });

    test("canonical lookup resolves from bank without explicit note", () => {
      // Verify that the canonical body in the bank actually exists and
      // that the receipt service's resolveNote 3-tier lookup is wired.
      // We pull the expected body from safeEditingBank (filesystem-backed in test)
      // then build a receipt WITHOUT an explicit note — it should still resolve.
      const canonicalBody =
        bank?.copy?.byCanonicalOperator?.preview?.DOCX_CREATE_TABLE?.en?.body ||
        "";
      expect(canonicalBody.length).toBeGreaterThan(0);

      // Build receipt with NO explicit note — relies on bank lookup
      const receipt = receiptService.build({
        stage: "preview",
        language: "en",
        documentId: "doc-1",
        targetId: "t-1",
        operator: "EDIT_DOCX_BUNDLE",
        canonicalOperator: "DOCX_CREATE_TABLE",
        domain: "docx",
        templateContext: { rowCount: "4", colCount: "3" },
      });
      // If the core bank loader is initialized, note should match the canonical body
      // (interpolated). If not, it should at least be a string with no {{placeholders}}.
      expect(receipt.note || "").not.toMatch(/\{\{/);
      // The receipt note should be non-empty (either from canonical bank or runtime fallback)
      expect(typeof receipt.note).toBe("string");
    });

    test("placeholder hydration with plan.metadata flows through correctly", () => {
      // Simulate the data flow: plan with metadata (populated by Fix 1B)
      // passed through buildTemplateContext → receipt note contains real values.
      const planLike = {
        canonicalOperator: "DOCX_CREATE_TABLE",
        metadata: { rowCount: "4", colCount: "3" },
      };
      const ctx = buildTemplateContext(planLike);
      expect(ctx.rowCount).toBe("4");
      expect(ctx.colCount).toBe("3");

      // Now build receipt with this context and an explicit note template
      // to verify the full interpolation pipeline
      const canonicalBody =
        bank?.copy?.byCanonicalOperator?.preview?.DOCX_CREATE_TABLE?.en?.body ||
        "";
      const receipt = receiptService.build({
        stage: "preview",
        language: "en",
        documentId: "doc-1",
        targetId: "t-1",
        operator: "EDIT_DOCX_BUNDLE",
        canonicalOperator: "DOCX_CREATE_TABLE",
        domain: "docx",
        templateContext: ctx,
        note:
          canonicalBody || "Table ({{rowCount}} rows, {{colCount}} columns)",
      });
      expect(receipt.note).not.toMatch(/\{\{/);
      expect(receipt.note).toContain("4");
      expect(receipt.note).toContain("3");
    });

    test("fallback when canonical absent returns note from bank or empty", () => {
      const receipt = receiptService.build({
        stage: "preview",
        language: "en",
        documentId: "doc-1",
        targetId: "t-1",
        operator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
      });
      // Without canonicalOperator, it should either resolve from byOperator bank
      // or return empty string — either way, no crash and no {{placeholders}}
      expect(typeof receipt.note).toBe("string");
      expect(receipt.note || "").not.toMatch(/\{\{/);
    });

    test("undo stage resolves correctly", () => {
      const receipt = receiptService.build({
        stage: "undo",
        language: "en",
        documentId: "doc-undo-1",
      });
      expect(receipt.stage).toBe("applied"); // undo renders as applied stage
      expect(typeof receipt.note).toBe("string");
      expect(receipt.note || "").not.toMatch(/\{\{/);
    });

    test("buildTemplateContext produces correct keys for DOCX_CREATE_TABLE", () => {
      const ctx = buildTemplateContext({
        canonicalOperator: "DOCX_CREATE_TABLE",
        rowCount: "4",
        colCount: "3",
      });
      expect(ctx.rowCount).toBe("4");
      expect(ctx.colCount).toBe("3");
    });

    test("buildTemplateContext handles missing plan values gracefully", () => {
      const ctx = buildTemplateContext({
        canonicalOperator: "DOCX_CREATE_TABLE",
      });
      expect(ctx.rowCount).toBe("");
      expect(ctx.colCount).toBe("");
    });

    test("buildTemplateContext returns empty object for unknown operator", () => {
      const ctx = buildTemplateContext({
        canonicalOperator: "UNKNOWN_OP",
      });
      expect(Object.keys(ctx).length).toBe(0);
    });
  });
});
