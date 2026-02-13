import { describe, expect, test } from "@jest/globals";
import { validateAllybiOperatorPayload } from "./operatorValidator";

describe("validateAllybiOperatorPayload", () => {
  test("blocks formatting intents from rewrite operators", () => {
    const out = validateAllybiOperatorPayload(
      "docx",
      {
        canonicalOperator: "DOCX_REWRITE_PARAGRAPH",
        runtimeOperator: "EDIT_PARAGRAPH",
        domain: "docx",
        requiresConfirmation: false,
        previewRenderType: "docx_text_diff",
        isFormattingOnly: true,
      },
      { targetId: "p1", afterText: "x" },
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("ALLYBI_FORMATTING_REWRITE_BLOCKED");
  });

  test("returns localized unsupported-font copy (EN)", () => {
    const out = validateAllybiOperatorPayload(
      "docx",
      {
        canonicalOperator: "DOCX_SET_RUN_STYLE",
        runtimeOperator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
        requiresConfirmation: true,
        previewRenderType: "docx_inline_format_diff",
      },
      { targets: ["p1"], style: { fontFamily: "NotAFont" } },
      { language: "en" },
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("ALLYBI_FONT_UNSUPPORTED");
    expect(String(out.message || "")).toContain("Font not available in this document engine");
  });

  test("returns localized unsupported-font copy (PT)", () => {
    const out = validateAllybiOperatorPayload(
      "docx",
      {
        canonicalOperator: "DOCX_SET_RUN_STYLE",
        runtimeOperator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
        requiresConfirmation: true,
        previewRenderType: "docx_inline_format_diff",
      },
      { targets: ["p1"], style: { fontFamily: "NotAFont" } },
      { language: "pt" },
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("ALLYBI_FONT_UNSUPPORTED");
    expect(String(out.message || "")).toContain("Fonte não disponível neste mecanismo");
  });

  test("blocks class mismatch between expected list op and rewrite op", () => {
    const out = validateAllybiOperatorPayload(
      "docx",
      {
        canonicalOperator: "DOCX_REWRITE_PARAGRAPH",
        runtimeOperator: "EDIT_PARAGRAPH",
        domain: "docx",
        requiresConfirmation: true,
        previewRenderType: "docx_text_diff",
        operatorClass: "list_numbering",
        blockedRewrite: true,
      },
      { targetId: "p1", afterText: "x" },
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("ALLYBI_REWRITE_CLASS_BLOCKED");
  });
});
