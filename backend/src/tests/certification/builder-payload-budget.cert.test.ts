import { describe, expect, test } from "@jest/globals";

import { LlmRequestBuilderService } from "../../services/llm/core/llmRequestBuilder.service";
import type {
  BuildRequestInput,
  PromptRegistryService,
} from "../../services/llm/core/llmRequestBuilder.service";
import { writeCertificationGateReport } from "./reporting";

function createInput(overrides?: Partial<BuildRequestInput>): BuildRequestInput {
  return {
    env: "local" as any,
    route: {
      provider: "openai",
      model: "gpt-5-mini",
      reason: "quality_finish",
      stage: "final",
      constraints: {},
    },
    outputLanguage: "en",
    userText: "Build a complete answer using all relevant evidence.",
    signals: {
      answerMode: "doc_grounded_single",
      intentFamily: "documents",
      operator: "extract",
      operatorFamily: "qa",
      maxQuestions: 1,
      explicitDocLock: false,
      activeDocId: null,
      fallback: { triggered: false },
      disambiguation: null,
      navType: null,
      isExtractionQuery: false,
    },
    evidencePack: {
      evidence: Array.from({ length: 18 }, (_, idx) => ({
        docId: `doc_${idx + 1}`,
        locationKey: `loc_${idx + 1}`,
        snippet: "Revenue and margin details ".repeat(70),
        evidenceType: "text" as const,
      })),
    },
    memoryPack: {
      contextText: "Prior conversation context ".repeat(900),
    },
    ...overrides,
  };
}

describe("Certification: builder payload budget", () => {
  test("builder keeps standard doc-grounded payload under prompt-size budget", () => {
    const prompts: PromptRegistryService = {
      buildPrompt: () => ({
        messages: [{ role: "system", content: "Answer using only evidence." }],
      }),
    };
    const builder = new LlmRequestBuilderService(prompts);
    const req = builder.build(createInput());
    const meta = req.kodaMeta as Record<string, any>;
    const payloadStats = (meta?.payloadStats || {}) as Record<string, any>;

    const estimatedPromptTokens = Number(payloadStats.estimatedPromptTokens || 0);
    const evidenceItemsIncluded = Number(payloadStats.evidenceItemsIncluded || 0);
    const userPayloadChars = Number(payloadStats.totalUserPayloadChars || 0);
    const failures: string[] = [];

    if (!Number.isFinite(estimatedPromptTokens) || estimatedPromptTokens <= 0) {
      failures.push("PROMPT_TOKEN_ESTIMATE_MISSING");
    }
    if (estimatedPromptTokens > 5000) {
      failures.push("PROMPT_TOKEN_BUDGET_EXCEEDED");
    }
    if (evidenceItemsIncluded > 8) {
      failures.push("EVIDENCE_ITEM_CAP_EXCEEDED");
    }
    if (userPayloadChars > 24000) {
      failures.push("USER_PAYLOAD_CHAR_CAP_EXCEEDED");
    }

    writeCertificationGateReport("builder-payload-budget", {
      passed: failures.length === 0,
      metrics: {
        estimatedPromptTokens,
        evidenceItemsIncluded,
        userPayloadChars,
      },
      thresholds: {
        maxEstimatedPromptTokens: 5000,
        maxEvidenceItemsIncluded: 8,
        maxUserPayloadChars: 24000,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
