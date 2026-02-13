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
});
