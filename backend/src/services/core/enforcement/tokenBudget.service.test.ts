import { describe, expect, it } from "@jest/globals";
import {
  estimateTokenCount,
  resolveOutputTokenBudget,
  trimTextToTokenBudget,
} from "./tokenBudget.service";

describe("tokenBudget.service", () => {
  it("returns higher budgets for verbose doc-grounded scenarios", () => {
    const base = resolveOutputTokenBudget({
      answerMode: "general_answer",
      outputLanguage: "en",
      routeStage: "final",
      userText: "Short answer",
    });
    const docPt = resolveOutputTokenBudget({
      answerMode: "doc_grounded_multi",
      outputLanguage: "pt",
      routeStage: "final",
      userText:
        "Explique as diferenças e cite os pontos principais de cada documento em uma comparação detalhada.",
      evidenceItems: 10,
      hasTables: true,
    });
    expect(docPt.maxOutputTokens).toBeGreaterThan(base.maxOutputTokens);
    expect(docPt.complexity).not.toBe("low");
  });

  it("trims text to token budget with boundary preservation", () => {
    const longText = Array.from(
      { length: 200 },
      (_, idx) => `Sentence ${idx + 1}.`,
    ).join(" ");
    const trimmed = trimTextToTokenBudget(longText, 60, {
      preserveSentenceBoundary: true,
    });
    expect(trimmed.truncated).toBe(true);
    expect(estimateTokenCount(trimmed.text)).toBeLessThanOrEqual(60);
    expect(trimmed.text.length).toBeGreaterThan(0);
  });
});
