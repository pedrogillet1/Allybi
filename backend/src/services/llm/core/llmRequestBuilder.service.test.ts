import { describe, expect, test, jest } from "@jest/globals";
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

  test("selects fallback prompt kind when fallback is triggered", () => {
    const buildPrompt = jest.fn().mockReturnValue({
      messages: [{ role: "system", content: "fallback" }],
    });
    const builder = new LlmRequestBuilderService({
      buildPrompt,
    } as unknown as PromptRegistryService);

    builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "general_answer",
          fallback: {
            triggered: true,
            reasonCode: "scope_hard_constraints_empty",
          },
        },
      }),
    );

    expect(buildPrompt).toHaveBeenCalled();
    expect(buildPrompt.mock.calls[0]?.[0]).toBe("fallback");
  });

  test("disambiguation prompt kind wins over fallback when rank_disambiguate is active", () => {
    const buildPrompt = jest.fn().mockReturnValue({
      messages: [{ role: "system", content: "disambiguation" }],
    });
    const builder = new LlmRequestBuilderService({
      buildPrompt,
    } as unknown as PromptRegistryService);

    builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "rank_disambiguate",
          fallback: {
            triggered: true,
            reasonCode: "low_confidence",
          },
        },
      }),
    );

    expect(buildPrompt.mock.calls[0]?.[0]).toBe("disambiguation");
  });

  test("passes product help slots into prompt context", () => {
    const buildPrompt = jest.fn().mockReturnValue({
      messages: [{ role: "system", content: "help" }],
    });
    const builder = new LlmRequestBuilderService({
      buildPrompt,
    } as unknown as PromptRegistryService);

    builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "help_steps",
          productHelpTopic: "docx_editing",
          productHelpSnippet: "Edit DOCX text and formatting on scoped targets.",
        },
      }),
    );

    const promptCtx = buildPrompt.mock.calls[0]?.[1] as Record<string, any>;
    expect(promptCtx?.slots?.productHelpTopic).toBe("docx_editing");
    expect(promptCtx?.slots?.productHelpSnippet).toContain("Edit DOCX");
  });
});
