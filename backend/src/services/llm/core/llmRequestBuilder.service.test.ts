import { describe, expect, test } from "@jest/globals";
import {
  LlmRequestBuilderService,
  type PromptRegistryService,
} from "./llmRequestBuilder.service";
import type { BuildRequestInput } from "./llmRequestBuilder.service";

function createInput(
  overrides?: Partial<BuildRequestInput>,
): BuildRequestInput {
  return {
    env: "test" as any,
    route: {
      provider: "openai",
      model: "gpt-5-mini",
      reason: "quality_finish",
      stage: "final",
      constraints: {},
    },
    outputLanguage: "pt",
    userText: "Monte uma tabela completa com evidências",
    signals: {
      answerMode: "doc_grounded_table",
      intentFamily: "documents",
      operator: "summarize",
      operatorFamily: "qa",
      maxQuestions: 1,
      explicitDocLock: true,
      activeDocId: null,
      fallback: { triggered: false },
      disambiguation: null,
      navType: null,
      isExtractionQuery: false,
    },
    evidencePack: {
      evidence: [],
    },
    ...overrides,
  };
}

describe("LlmRequestBuilderService", () => {
  const prompts: PromptRegistryService = {
    buildPrompt: () => ({
      messages: [{ role: "system", content: "Answer with evidence." }],
    }),
  };

  test("respects requested maxOutputTokens override for table mode", () => {
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(
      createInput({
        options: {
          maxOutputTokens: 1200,
        },
      }),
    );

    expect(req.options?.maxOutputTokens).toBe(1200);
  });

  test("keeps nav/disambiguation short caps intact", () => {
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "nav_pills",
        },
      }),
    );

    expect((req.options?.maxOutputTokens ?? 0) <= 220).toBe(true);
  });
});
