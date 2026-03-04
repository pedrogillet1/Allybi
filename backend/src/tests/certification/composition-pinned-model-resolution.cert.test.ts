import { describe, expect, jest, test } from "@jest/globals";
import { getOptionalBank } from "../../services/core/banks/bankLoader.service";
import { LlmRequestBuilderService } from "../../services/llm/core/llmRequestBuilder.service";
import { toCostFamilyModel } from "../../services/llm/core/llmCostCalculator";
import { writeCertificationGateReport } from "./reporting";

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("Certification: pinned model resolution", () => {
  test("pinned model ids resolve to family capability limits", () => {
    mockedGetOptionalBank.mockReset();
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "provider_capabilities") {
        return {
          providers: {
            openai: {
              models: {
                "gpt-5.2": { maxInputTokens: 128000 },
              },
            },
            gemini: {
              models: {
                "gemini-2.5-flash": { maxInputTokens: 1048576 },
              },
            },
          },
        } as unknown as ReturnType<typeof getOptionalBank>;
      }
      return null;
    });

    const builder = new LlmRequestBuilderService({
      buildPrompt: () => ({
        messages: [{ role: "system", content: "Answer with evidence." }],
      }),
    });

    const openaiMax = (builder as any).resolveMaxInputTokens({
      env: "production",
      route: {
        provider: "openai",
        model: "gpt-5.2-2026-01-15",
        reason: "quality_finish",
        stage: "final",
        constraints: {},
      },
      outputLanguage: "en",
      userText: "hello",
      signals: {
        answerMode: "doc_grounded_single",
        maxQuestions: 1,
        explicitDocLock: false,
        activeDocId: null,
        fallback: { triggered: false },
        disambiguation: null,
        navType: null,
        isExtractionQuery: false,
      },
      evidencePack: { evidence: [] },
    });

    const geminiMax = (builder as any).resolveMaxInputTokens({
      env: "production",
      route: {
        provider: "gemini",
        model: "gemini-2.5-flash-001",
        reason: "fast_path",
        stage: "draft",
        constraints: {},
      },
      outputLanguage: "en",
      userText: "hello",
      signals: {
        answerMode: "nav_pills",
        maxQuestions: 1,
        explicitDocLock: false,
        activeDocId: null,
        fallback: { triggered: false },
        disambiguation: null,
        navType: null,
        isExtractionQuery: false,
      },
      evidencePack: { evidence: [] },
    });

    const failures: string[] = [];
    if (openaiMax !== 128000) failures.push(`OPENAI_MAX_INPUT:${openaiMax}`);
    if (geminiMax !== 1048576) failures.push(`GEMINI_MAX_INPUT:${geminiMax}`);
    if (toCostFamilyModel("gpt-5.2-2026-01-15") !== "gpt-5.2") {
      failures.push("OPENAI_FAMILY_NORMALIZATION_FAILED");
    }
    if (toCostFamilyModel("gemini-2.5-flash-001") !== "gemini-2.5-flash") {
      failures.push("GEMINI_FAMILY_NORMALIZATION_FAILED");
    }

    writeCertificationGateReport("composition-pinned-model-resolution", {
      passed: failures.length === 0,
      metrics: {
        openaiFamilyLimitResolved: openaiMax === 128000 ? 1 : 0,
        geminiFamilyLimitResolved: geminiMax === 1048576 ? 1 : 0,
      },
      thresholds: {
        openaiFamilyLimitResolved: 1,
        geminiFamilyLimitResolved: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
