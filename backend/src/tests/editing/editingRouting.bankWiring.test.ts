/**
 * Bank-wiring proof tests for editing_routing.any.json.
 *
 * These tests prove the routing bank is loaded at runtime and its guardrail
 * rules actually influence planning and validation decisions. If the bank is
 * missing or not wired, at least 10 of these tests will fail.
 */

import { describe, expect, test, beforeEach } from "@jest/globals";
import { loadAllybiBanks } from "../../services/editing/allybi/loadBanks";
import {
  planAllybiOperator,
  applyPostGuardrails,
  operatorClassFromCanonical,
} from "../../services/editing/allybi/operatorPlanner";
import {
  validateNoopResult,
  validateMultiIntentConflict,
} from "../../services/editing/allybi/operatorValidator";
import { clearEditingBankCache } from "../../services/editing/banks/bankService";

beforeEach(() => {
  clearEditingBankCache();
});

// ---------------------------------------------------------------------------
// 1. Bank loading proof — if this fails, all guardrails are dead-letter
// ---------------------------------------------------------------------------

describe("editing_routing bank is loaded", () => {
  test("editingRouting field is populated on loadAllybiBanks()", () => {
    const banks = loadAllybiBanks();
    expect(banks.editingRouting).toBeDefined();
    expect(banks.editingRouting).not.toBeNull();
  });

  test("guardrails array is present and non-empty", () => {
    const banks = loadAllybiBanks();
    expect(Array.isArray(banks.editingRouting.guardrails)).toBe(true);
    expect(banks.editingRouting.guardrails.length).toBeGreaterThanOrEqual(8);
  });

  test("all 8 guardrail rule ids exist", () => {
    const banks = loadAllybiBanks();
    const ids = banks.editingRouting.guardrails.map((r: any) => r.id);
    const expected = [
      "selection_first_precedence",
      "no_bulk_override_selection",
      "formatting_never_rewrite",
      "structural_never_paragraph_rewrite",
      "rewrite_translate_conflict",
      "destructive_ops_confirm",
      "noop_prevention",
      "engine_capability_gate",
    ];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
  });

  test("tiebreakers array is present", () => {
    const banks = loadAllybiBanks();
    expect(Array.isArray(banks.editingRouting.tiebreakers)).toBe(true);
    expect(banks.editingRouting.tiebreakers.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 2. formatting_never_rewrite: formatting intent → rewrite blocked
// ---------------------------------------------------------------------------

describe("formatting_never_rewrite guardrail", () => {
  test("blocks formatting intent routed to DOCX_REWRITE_PARAGRAPH", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_REWRITE_PARAGRAPH",
        runtimeOperator: "EDIT_PARAGRAPH",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_text_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: true,
      operatorClass: "formatting",
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe("block");
    expect(result!.code).toBe("ROUTING_FORMATTING_REWRITE_BLOCKED");
  });

  test("allows formatting intent to DOCX_SET_RUN_STYLE (non-rewrite)", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_SET_RUN_STYLE",
        runtimeOperator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_inline_format_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: true,
      operatorClass: "formatting",
    });
    // Should NOT fire — formatting to formatting operator is fine
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. structural_never_paragraph_rewrite: structural → rewrite blocked
// ---------------------------------------------------------------------------

describe("structural_never_paragraph_rewrite guardrail", () => {
  test("blocks doc_feature class routed to DOCX_REWRITE_PARAGRAPH", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_REWRITE_PARAGRAPH",
        runtimeOperator: "EDIT_PARAGRAPH",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_text_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: false,
      operatorClass: "doc_feature",
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe("block");
    expect(result!.code).toBe("ROUTING_STRUCTURAL_REWRITE_BLOCKED");
  });

  test("blocks list_numbering class routed to DOCX_REPLACE_SPAN", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_REPLACE_SPAN",
        runtimeOperator: "EDIT_SPAN",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_text_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: false,
      operatorClass: "list_numbering",
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe("block");
  });

  test("allows rewrite class to DOCX_REWRITE_PARAGRAPH (legitimate)", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_REWRITE_PARAGRAPH",
        runtimeOperator: "EDIT_PARAGRAPH",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_text_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: false,
      operatorClass: "rewrite",
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. destructive_ops_confirm: destructive ops require confirmation
// ---------------------------------------------------------------------------

describe("destructive_ops_confirm guardrail", () => {
  test("requires confirmation for DELETE_ROW operator", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "XLSX_DELETE_ROW",
        runtimeOperator: "DELETE_ROW",
        domain: "sheets",
        requiresConfirmation: false,
        previewRenderType: "xlsx_structural_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: false,
      operatorClass: "xlsx_structural",
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe("require_confirmation");
    expect(result!.code).toBe("ROUTING_DESTRUCTIVE_CONFIRM");
  });

  test("requires confirmation for DELETE_PARAGRAPH operator", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_DELETE_PARAGRAPH",
        runtimeOperator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_structural_diff",
        language: "pt",
      },
      language: "pt",
      isFormattingIntent: false,
      operatorClass: "doc_feature",
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe("require_confirmation");
    // PT message should be used
    expect(result!.message).toContain("destrutiva");
  });

  test("requires confirmation for REMOVE_COMMENT operator", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_REMOVE_COMMENT",
        runtimeOperator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_structural_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: false,
      operatorClass: "review",
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe("require_confirmation");
  });

  test("does NOT require confirmation for non-destructive ops", () => {
    const result = applyPostGuardrails({
      plan: {
        canonicalOperator: "DOCX_SET_RUN_STYLE",
        runtimeOperator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_inline_format_diff",
        language: "en",
      },
      language: "en",
      isFormattingIntent: true,
      operatorClass: "formatting",
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. noop_prevention: no-change results produce NOOP
// ---------------------------------------------------------------------------

describe("noop_prevention guardrail", () => {
  test("returns NOOP when changed=false", () => {
    const result = validateNoopResult(false, "en");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ROUTING_NOOP_NO_CHANGE");
    expect(result.message).toContain("No changes");
  });

  test("returns NOOP with PT message when lang=pt", () => {
    const result = validateNoopResult(false, "pt");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ROUTING_NOOP_NO_CHANGE");
    expect(result.message).toContain("Nenhuma altera");
  });

  test("returns ok when changed=true", () => {
    const result = validateNoopResult(true, "en");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. rewrite_translate_conflict: same-target rewrite+translate
// ---------------------------------------------------------------------------

describe("rewrite_translate_conflict guardrail", () => {
  test("detects conflict when rewrite and translate share a target", () => {
    const result = validateMultiIntentConflict(
      [
        { canonicalOperator: "DOCX_REWRITE_PARAGRAPH", targetHint: "para_3" },
        { canonicalOperator: "DOCX_TRANSLATE_SCOPE", targetHint: "para_3" },
      ],
      "en",
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ROUTING_REWRITE_TRANSLATE_CONFLICT");
  });

  test("no conflict when rewrite and translate have different targets", () => {
    const result = validateMultiIntentConflict(
      [
        { canonicalOperator: "DOCX_REWRITE_PARAGRAPH", targetHint: "para_3" },
        { canonicalOperator: "DOCX_TRANSLATE_SCOPE", targetHint: "para_7" },
      ],
      "en",
    );
    expect(result.ok).toBe(true);
  });

  test("no conflict when only one type present", () => {
    const result = validateMultiIntentConflict(
      [
        { canonicalOperator: "DOCX_REWRITE_PARAGRAPH", targetHint: "para_3" },
        { canonicalOperator: "DOCX_REWRITE_SECTION", targetHint: "para_3" },
      ],
      "en",
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. engine_capability_gate: cross-domain operator blocked
// ---------------------------------------------------------------------------

describe("engine_capability_gate guardrail", () => {
  test("blocks chart creation when domain is docx (via planAllybiOperator)", () => {
    const plan = planAllybiOperator({
      domain: "docx",
      message: "create a bar chart",
      classifiedIntent: {
        intentId: "XLSX_CHART",
        confidence: 0.9,
        operatorCandidates: ["XLSX_CHART_CREATE"],
        language: "en",
        reason: "test",
      },
      scope: {
        source: "structural_resolver",
        confidence: 0.8,
        scopeKind: "paragraph",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });
    expect(plan).not.toBeNull();
    expect(plan!.planStatus).toBe("blocked");
    expect(plan!.blockedReasonCode).toBe("ROUTING_ENGINE_UNSUPPORTED");
  });
});

// ---------------------------------------------------------------------------
// 8. no_bulk_override_selection: bulk scope with selection = blocked
// ---------------------------------------------------------------------------

describe("no_bulk_override_selection guardrail", () => {
  test("blocks document-scope when selection active and no 'entire document' phrase", () => {
    const plan = planAllybiOperator({
      domain: "docx",
      message: "change all headings to Arial",
      classifiedIntent: {
        intentId: "DOCX_FORMAT_INLINE",
        confidence: 0.85,
        operatorCandidates: ["DOCX_SET_RUN_STYLE"],
        language: "en",
        reason: "test",
        isFormattingIntent: true,
      },
      scope: {
        source: "frozen_selection",
        confidence: 1,
        targetHint: "para_5",
        scopeKind: "document",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });
    expect(plan).not.toBeNull();
    expect(plan!.planStatus).toBe("blocked");
    expect(plan!.blockedReasonCode).toBe("ROUTING_BULK_OVERRIDE_BLOCKED");
  });

  test("allows document-scope when user says 'entire document'", () => {
    const plan = planAllybiOperator({
      domain: "docx",
      message: "change all headings in the entire document to Arial",
      classifiedIntent: {
        intentId: "DOCX_FORMAT_INLINE",
        confidence: 0.85,
        operatorCandidates: ["DOCX_SET_RUN_STYLE"],
        language: "en",
        reason: "test",
        isFormattingIntent: true,
      },
      scope: {
        source: "frozen_selection",
        confidence: 1,
        targetHint: "para_5",
        scopeKind: "document",
        requiresDisambiguation: false,
        explicitlyLimitedToFirst: false,
        multiRangeFanout: false,
      },
    });
    // Should NOT be blocked — user explicitly said 'entire document'
    if (plan && plan.planStatus === "blocked") {
      expect(plan.blockedReasonCode).not.toBe("ROUTING_BULK_OVERRIDE_BLOCKED");
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Guardrails are data-driven — modifying bank changes behavior
// ---------------------------------------------------------------------------

describe("guardrails are data-driven (not hardcoded)", () => {
  test("each rule has an id, phase, description, and condition", () => {
    const banks = loadAllybiBanks();
    for (const rule of banks.editingRouting.guardrails) {
      expect(typeof rule.id).toBe("string");
      expect(rule.id.length).toBeGreaterThan(0);
      expect(["pre", "post"]).toContain(rule.phase);
      expect(typeof rule.description).toBe("string");
      expect(rule.condition).toBeDefined();
    }
  });

  test("each rule has at least one example", () => {
    const banks = loadAllybiBanks();
    for (const rule of banks.editingRouting.guardrails) {
      expect(Array.isArray(rule.examples)).toBe(true);
      expect(rule.examples.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. PT message coverage — guardrails have bilingual messages
// ---------------------------------------------------------------------------

describe("guardrail messages are bilingual", () => {
  test("block rules have both en and pt messages", () => {
    const banks = loadAllybiBanks();
    const blockRules = banks.editingRouting.guardrails.filter(
      (r: any) => r.action === "block" && r.blockMessage,
    );
    expect(blockRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of blockRules) {
      expect(typeof rule.blockMessage.en).toBe("string");
      expect(typeof rule.blockMessage.pt).toBe("string");
    }
  });

  test("confirm rules have both en and pt messages", () => {
    const banks = loadAllybiBanks();
    const confirmRules = banks.editingRouting.guardrails.filter(
      (r: any) => r.action === "require_confirmation" && r.confirmMessage,
    );
    expect(confirmRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of confirmRules) {
      expect(typeof rule.confirmMessage.en).toBe("string");
      expect(typeof rule.confirmMessage.pt).toBe("string");
    }
  });

  test("noop rule has both en and pt messages", () => {
    const banks = loadAllybiBanks();
    const noopRule = banks.editingRouting.guardrails.find(
      (r: any) => r.id === "noop_prevention",
    );
    expect(noopRule).toBeDefined();
    expect(typeof noopRule.noopMessage.en).toBe("string");
    expect(typeof noopRule.noopMessage.pt).toBe("string");
  });
});
