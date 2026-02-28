import { describe, expect, test } from "@jest/globals";
import {
  SEMANTIC_TRUNCATION_DETECTOR_VERSION,
  classifyProviderTruncation,
  classifyVisibleTruncation,
  isSemanticTruncationV2Enabled,
  // @ts-expect-error — internal function exposed for testing
} from "./truncationClassifier";

// Helper: classify with provider overflow to trigger semantic checks
function classifyWithOverflow(text: string) {
  return classifyVisibleTruncation({
    finalText: text,
    enforcementRepairs: [],
    providerTruncation: { occurred: true, reason: "length" },
  });
}

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

  // --- Step 2: edge case coverage ---

  test("code fence + inline backtick interaction: fenced code with even inline is NOT flagged", () => {
    // 3 fence backticks (open) + 1 inline + 1 inline + 3 fence backticks (close) = 8 total
    // Fence count = 2 (even) → ok. Inline = 8 - 2*3 = 2 (even) → ok.
    const text = "Here is code:\n```\nconst x = `hello`;\n```\nDone.";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("emoticon parentheses :) not flagged as unbalanced", () => {
    const text = "Great job on the report :) everything looks good.";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("bullet list ending without period is NOT flagged", () => {
    const text = "Key items:\n- Budget approved\n- Timeline confirmed\n- Resources allocated";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("numbered list ending is NOT flagged", () => {
    const text = "Steps:\n1. Open the file\n2. Edit the header\n3. Save changes";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("table row ending is NOT flagged", () => {
    const text = "| Name | Value |\n|---|---|\n| Alpha | 100 |";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("blockquote ending is NOT flagged", () => {
    const text = "> This is a quoted passage from the document";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("continuation punctuation (colon) IS flagged", () => {
    const text = "The following items are included in the budget:";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(true);
  });

  test("unbalanced code fence IS flagged", () => {
    const text = "Here is code:\n```\nconst x = 1;\nAnd then";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(true);
  });

  test("footnote references [^1] NOT flagged as unbalanced brackets", () => {
    const text = "The revenue increased[^1] and costs decreased[^2].";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("curly quotes balanced are NOT flagged", () => {
    const text = "\u201CThis is a quote,\u201D she said.";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(false);
  });

  test("odd inline backtick IS flagged", () => {
    const text = "The field `status is pending and needs review.";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(true);
  });

  test("dangling hyphen IS flagged", () => {
    const text = "The total amount for the quarter was approximately-";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(true);
  });

  test("empty/whitespace input IS flagged as incomplete", () => {
    const result = classifyWithOverflow("   ");
    expect(result.occurred).toBe(true);
  });

  test("opening parenthesis mid-sentence IS flagged", () => {
    const text = "The project (including all sub-tasks and dependencies";
    const result = classifyWithOverflow(text);
    expect(result.occurred).toBe(true);
  });

  test("short complete text 'Done.' is NOT flagged", () => {
    const result = classifyWithOverflow("Done.");
    expect(result.occurred).toBe(false);
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
