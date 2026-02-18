import { describe, expect, test } from "@jest/globals";
import { classifyAllybiIntent } from "./intentClassifier";

describe("classifyAllybiIntent", () => {
  test("classifies whole-document translation requests via trigger bank", () => {
    const out = classifyAllybiIntent("Translate the entire document to Portuguese.", "docx");
    expect(out?.intentId).toBe("DOCX_TRANSLATE");
  });

  test("does not force a random fallback intent on unrelated text", () => {
    const out = classifyAllybiIntent("What's the weather in Boston today?", "docx");
    expect(out).toBeNull();
  });

  test("routes font-family EN prompt without 'font' keyword to formatting intent", () => {
    const out = classifyAllybiIntent("change this to times new roman", "docx");
    expect(out?.intentId).toBe("DOCX_FORMAT_INLINE");
    expect(out?.fontFamily).toBe("Times New Roman");
    expect(out?.isFormattingIntent).toBe(true);
    expect(out?.operatorCandidates[0]).toBe("DOCX_SET_RUN_STYLE");
  });

  test("routes font-family PT prompt without 'fonte' keyword to formatting intent", () => {
    const out = classifyAllybiIntent("mude isso para times new roman", "docx");
    expect(out?.intentId).toBe("DOCX_FORMAT_INLINE");
    expect(out?.fontFamily).toBe("Times New Roman");
    expect(out?.isFormattingIntent).toBe(true);
  });

  test("marks ambiguous font phrases for clarification", () => {
    const out = classifyAllybiIntent("change to roman", "docx");
    expect(out?.clarificationRequired).toBe(true);
    expect(out?.reason).toBe("font_entity_ambiguous");
    expect(out?.isFormattingIntent).toBe(true);
  });

  test("classifies PT bullets-to-single-paragraph requests", () => {
    const out = classifyAllybiIntent(
      "Transforme todos os bullets selecionados em um único parágrafo, mantendo exatamente o mesmo conteúdo.",
      "docx",
      "pt",
    );
    expect(out?.intentId).toBe("DOCX_LIST_CONVERT");
    expect(Array.isArray(out?.operatorCandidates)).toBe(true);
    expect((out?.operatorCandidates || []).some((op) => String(op).startsWith("DOCX_LIST_"))).toBe(true);
  });

  test("classifies EN selected-bullets-to-one-paragraph requests", () => {
    const out = classifyAllybiIntent(
      "Convert the selected bullets into one paragraph and keep all wording exactly the same.",
      "docx",
      "en",
    );
    expect(out?.intentId).toBe("DOCX_LIST_CONVERT");
    expect(Array.isArray(out?.operatorCandidates)).toBe(true);
    expect((out?.operatorCandidates || []).some((op) => String(op).startsWith("DOCX_LIST_"))).toBe(true);
  });

  test("matches intent from natural PT wording even when trigger phrase is not contiguous", () => {
    const out = classifyAllybiIntent(
      "Por favor, coloque isso em negrito e centralize este título",
      "docx",
      "pt",
    );
    expect(out?.intentId).toBe("DOCX_FORMAT_INLINE");
    expect(Array.isArray(out?.operatorCandidates)).toBe(true);
  });

  test("matches intent from natural EN wording with reordered trigger words", () => {
    const out = classifyAllybiIntent(
      "Can you sort this selected range by capex in descending order?",
      "xlsx",
      "en",
    );
    expect(out?.intentId).toBe("XLSX_SORT");
    expect(out?.operatorCandidates?.[0]).toBe("XLSX_SORT_RANGE");
  });
});
