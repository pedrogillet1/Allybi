import { beforeEach, describe, expect, test, jest } from "@jest/globals";
import { getOptionalBank } from "../../core/banks/bankLoader.service";
import {
  LlmRequestBuilderService,
  type PromptRegistryService,
} from "./llmRequestBuilder.service";
import type { BuildRequestInput } from "./llmRequestBuilder.service";

jest.mock("../../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

function createInput(
  overrides?: Partial<BuildRequestInput>,
): BuildRequestInput {
  return {
    env: "test" as any,
    route: {
      provider: "openai",
      model: "gpt-5.2",
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

  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
    mockedGetOptionalBank.mockReturnValue(null);
  });

  test("applies a doc-grounded token floor when not explicitly short", () => {
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

    expect((req.options?.maxOutputTokens ?? 0) <= 260).toBe(true);
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
          productHelpSnippet:
            "Edit DOCX text and formatting on scoped targets.",
        },
      }),
    );

    const promptCtx = buildPrompt.mock.calls[0]?.[1] as Record<string, any>;
    expect(promptCtx?.slots?.productHelpTopic).toBe("docx_editing");
    expect(promptCtx?.slots?.productHelpSnippet).toContain("Edit DOCX");
  });

  test("does not route locate_docs to retrieval prompt unless explicitly requested", () => {
    const buildPrompt = jest.fn().mockReturnValue({
      messages: [{ role: "system", content: "compose" }],
    });
    const builder = new LlmRequestBuilderService({
      buildPrompt,
    } as unknown as PromptRegistryService);

    builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "doc_grounded_single",
          operator: "locate_docs",
          intentFamily: "retrieval",
        },
      }),
    );
    expect(buildPrompt.mock.calls[0]?.[0]).toBe("compose_answer");
  });

  test("routes retrieval prompt only when promptMode is retrieval_plan", () => {
    const buildPrompt = jest.fn().mockReturnValue({
      messages: [{ role: "system", content: "retrieval" }],
    });
    const builder = new LlmRequestBuilderService({
      buildPrompt,
    } as unknown as PromptRegistryService);

    builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "doc_grounded_single",
          operator: "locate_docs",
          intentFamily: "retrieval",
          promptMode: "retrieval_plan",
        },
      }),
    );

    expect(buildPrompt.mock.calls[0]?.[0]).toBe("retrieval");
  });

  test("does not apply style token cap to doc-grounded mode unless explicitly short", () => {
    const buildPrompt = jest.fn().mockReturnValue({
      messages: [{ role: "system", content: "compose" }],
    });
    const builder = new LlmRequestBuilderService({
      buildPrompt,
    } as unknown as PromptRegistryService);

    const req = builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          styleProfile: "brief",
          styleMaxChars: 180,
          boldingEnabled: false,
        },
        options: {
          maxOutputTokens: 1200,
        },
      }),
    );

    expect(req.options?.maxOutputTokens).toBe(1200);
    const promptCtx = buildPrompt.mock.calls[0]?.[1] as Record<string, any>;
    expect(promptCtx?.runtimeSignals?.styleProfile).toBe("brief");
    expect(promptCtx?.runtimeSignals?.boldingEnabled).toBe(false);
  });

  test("applies style token cap when user explicitly requests short output", () => {
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          styleMaxChars: 180,
          userRequestedShort: true,
        },
        options: {
          maxOutputTokens: 1200,
        },
      }),
    );

    expect(req.options?.maxOutputTokens).toBe(256);
  });

  test("emits resolved token policy metadata for doc-grounded floor", () => {
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(
      createInput({
        options: {
          maxOutputTokens: 1200,
        },
      }),
    );
    const meta = req.kodaMeta as Record<string, any>;
    expect(meta?.resolvedTokenPolicy?.docGroundedFloorApplied).toBe(true);
    expect(meta?.resolvedTokenPolicy?.docGroundedFloor).toBe(1000);
    expect(meta?.resolvedTokenPolicy?.finalMaxOutputTokens).toBe(1200);
  });

  test("combines page and section in evidence location", () => {
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "doc_grounded_single",
        },
        evidencePack: {
          evidence: [
            {
              docId: "doc_1",
              locationKey: "loc_1",
              snippet: "Revenue grew 18% year-over-year driven by subscription expansion.",
              evidenceType: "text" as const,
              title: "Annual Report",
              location: { page: 3, sectionKey: "Revenue Analysis" },
            },
          ],
        },
      }),
    );

    const userMessage = req.messages.find((msg) => msg.role === "user");
    const content = userMessage?.content || "";
    // Should combine page and section: "p.3,sec:Revenue Analysis"
    expect(content).toContain("p.3");
    expect(content).toContain("sec:Revenue Analysis");
  });

  test("excludes chunk_ prefixed sectionKey from evidence location", () => {
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "doc_grounded_single",
        },
        evidencePack: {
          evidence: [
            {
              docId: "doc_1",
              locationKey: "loc_1",
              snippet: "Some evidence text for testing location formatting output.",
              evidenceType: "text" as const,
              location: { page: 5, sectionKey: "chunk_42" },
            },
          ],
        },
      }),
    );

    const userMessage = req.messages.find((msg) => msg.role === "user");
    const content = userMessage?.content || "";
    expect(content).toContain("p.5");
    expect(content).not.toContain("sec:chunk_42");
  });

  test("caps payload sections and reports payload stats", () => {
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(
      createInput({
        signals: {
          ...createInput().signals,
          answerMode: "doc_grounded_multi",
        },
        memoryPack: {
          contextText: "M".repeat(20000),
        },
        evidencePack: {
          evidence: Array.from({ length: 24 }, (_, idx) => ({
            docId: `doc_${idx + 1}`,
            locationKey: `loc_${idx + 1}`,
            snippet: "S".repeat(1800),
            evidenceType: "text" as const,
          })),
        },
      }),
    );

    const userMessage = req.messages.find((msg) => msg.role === "user");
    expect((userMessage?.content || "").length).toBeLessThanOrEqual(24000);

    const meta = req.kodaMeta as Record<string, any>;
    const payloadStats = meta?.payloadStats as Record<string, any>;
    expect(payloadStats?.memoryCharsIncluded).toBeLessThanOrEqual(9000);
    expect(payloadStats?.evidenceItemsIncluded).toBeLessThanOrEqual(14);
    expect(payloadStats?.evidenceCharsIncluded).toBeLessThanOrEqual(5600);
    expect(payloadStats?.estimatedPromptTokens).toBeGreaterThan(0);
  });

  test("resolves max input tokens for pinned OpenAI model versions via family key", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "provider_capabilities") {
        return {
          providers: {
            openai: {
              models: {
                "gpt-5.2": { maxInputTokens: 128000 },
              },
            },
          },
        } as unknown as ReturnType<typeof getOptionalBank>;
      }
      return null;
    });
    const builder = new LlmRequestBuilderService(prompts);
    const maxTokens = (builder as any).resolveMaxInputTokens(
      createInput({
        route: {
          ...createInput().route,
          provider: "openai",
          model: "gpt-5.2-2026-01-15",
        },
      }),
    );
    expect(maxTokens).toBe(128000);
  });

  test("resolves max input tokens using wildcard model rules", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "provider_capabilities") {
        return {
          providers: {
            local: {
              models: {
                "ollama:*": { maxInputTokens: 8192 },
              },
            },
          },
        } as unknown as ReturnType<typeof getOptionalBank>;
      }
      return null;
    });
    const builder = new LlmRequestBuilderService(prompts);
    const maxTokens = (builder as any).resolveMaxInputTokens(
      createInput({
        route: {
          ...createInput().route,
          provider: "local",
          model: "ollama:phi4",
        },
      }),
    );
    expect(maxTokens).toBe(8192);
  });
});
