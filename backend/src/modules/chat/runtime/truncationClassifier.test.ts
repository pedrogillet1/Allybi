import { describe, expect, test } from "@jest/globals";
import {
  SEMANTIC_TRUNCATION_DETECTOR_VERSION,
  classifyProviderTruncation,
  classifyVisibleTruncation,
  isSemanticTruncationV2Enabled,
} from "./truncationClassifier";

describe("truncationClassifier", () => {
  test("classifies provider truncation from finish reason", () => {
    expect(
      classifyProviderTruncation({ finishReason: "length" }).occurred,
    ).toBe(true);
    expect(
      classifyProviderTruncation({ finishReason: "max_tokens" }).occurred,
    ).toBe(true);
    expect(classifyProviderTruncation({ finishReason: "stop" }).occurred).toBe(
      false,
    );
  });

  test("does not mark visible truncation when enforcer trim repairs exist but output is complete", () => {
    const result = classifyVisibleTruncation({
      finalText: "Complete sentence.",
      enforcementRepairs: ["SOFT_MAX_TOKENS_TRIMMED"],
      providerTruncation: { occurred: false, reason: null },
    });
    expect(result.occurred).toBe(false);
    expect(result.reason).toBeNull();
  });

  test("marks visible truncation when enforcer trim leaves incomplete output", () => {
    const result = classifyVisibleTruncation({
      finalText:
        "Com base no documento, os principais pontos incluem planejamento, orçamento e",
      enforcementRepairs: ["SOFT_MAX_TOKENS_TRIMMED"],
      providerTruncation: { occurred: false, reason: null },
    });
    expect(result.occurred).toBe(true);
    expect(result.reason).toBe("enforcer_trimmed");
  });

  test("does not mark visible truncation for provider overflow when final text is complete", () => {
    const result = classifyVisibleTruncation({
      finalText: "This answer is complete and ends with punctuation.",
      enforcementRepairs: [],
      providerTruncation: { occurred: true, reason: "length" },
    });
    expect(result.occurred).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.detectorVersion).toBe(SEMANTIC_TRUNCATION_DETECTOR_VERSION);
  });

  test("marks visible truncation for provider overflow when final text is incomplete", () => {
    const result = classifyVisibleTruncation({
      finalText:
        "This answer keeps listing details from multiple sections but stops in the middle of a",
      enforcementRepairs: [],
      providerTruncation: { occurred: true, reason: "length" },
    });
    expect(result.occurred).toBe(true);
    expect(result.reason).toBe("semantic_incomplete_after_provider_overflow");
  });

  test("marks visible truncation for provider overflow when output has unbalanced quotes", () => {
    const result = classifyVisibleTruncation({
      finalText: 'Com base no documento "Trabalho_projeto_.',
      enforcementRepairs: [],
      providerTruncation: { occurred: true, reason: "length" },
    });
    expect(result.occurred).toBe(true);
    expect(result.reason).toBe("semantic_incomplete_after_provider_overflow");
  });

  test("supports feature flag parser for semantic v2 gate", () => {
    expect(
      isSemanticTruncationV2Enabled({
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isSemanticTruncationV2Enabled({
        TRUNCATION_SEMANTIC_V2_ENABLED: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isSemanticTruncationV2Enabled({
        TRUNCATION_SEMANTIC_V2_ENABLED: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isSemanticTruncationV2Enabled({
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isSemanticTruncationV2Enabled({
        NODE_ENV: "production",
        TRUNCATION_SEMANTIC_V2_ENABLED: "off",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
