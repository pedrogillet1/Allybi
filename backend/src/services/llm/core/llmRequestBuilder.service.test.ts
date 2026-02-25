import { describe, expect, it } from "@jest/globals";
import {
  LlmRequestBuilderService,
  type BuildRequestInput,
  type PromptRegistryService,
} from "./llmRequestBuilder.service";

function makeBuilder(): LlmRequestBuilderService {
  const prompts: PromptRegistryService = {
    buildPrompt: () => ({
      messages: [{ role: "system", content: "System prompt." }],
      trace: {
        orderedPrompts: [
          {
            bankId: "compose_answer",
            version: "1.0.0",
            templateId: "default",
            hash: "abc",
          },
        ],
      },
    }),
  };
  return new LlmRequestBuilderService(prompts);
}

function makeInput(overrides?: Partial<BuildRequestInput>): BuildRequestInput {
  return {
    env: "dev",
    route: {
      provider: "gemini",
      model: "gemini-2.5-flash",
      reason: "quality_finish",
      stage: "final",
      constraints: {
        requireStreaming: true,
        disallowTools: true,
        disallowImages: true,
      },
    },
    outputLanguage: "en",
    userText: "Summarize the attached document.",
    signals: {
      answerMode: "general_answer",
      intentFamily: "qa",
      operator: "answer",
      operatorFamily: null,
      disallowJsonOutput: true,
      maxQuestions: 1,
      fallback: { triggered: false },
    },
    ...overrides,
  };
}

describe("LlmRequestBuilderService output token budget", () => {
  it("adapts maxOutputTokens by answer mode and language", () => {
    const builder = makeBuilder();

    const generic = builder.build(makeInput());
    const groundedPt = builder.build(
      makeInput({
        outputLanguage: "pt",
        signals: {
          ...makeInput().signals,
          answerMode: "doc_grounded_multi",
        },
        evidencePack: {
          evidence: [
            { docId: "d1", snippet: "A", evidenceType: "text" },
            { docId: "d2", snippet: "B", evidenceType: "text" },
            { docId: "d3", snippet: "C", evidenceType: "text" },
            { docId: "d4", snippet: "D", evidenceType: "text" },
            { docId: "d5", snippet: "E", evidenceType: "text" },
            { docId: "d6", snippet: "F", evidenceType: "text" },
          ],
        } as any,
      }),
    );

    expect(generic.options.maxOutputTokens ?? 0).toBeGreaterThan(200);
    expect(groundedPt.options.maxOutputTokens).toBeGreaterThan(
      generic.options.maxOutputTokens ?? 0,
    );
  });

  it("keeps nav_pills output strictly short", () => {
    const builder = makeBuilder();
    const req = builder.build(
      makeInput({
        signals: {
          ...makeInput().signals,
          answerMode: "nav_pills",
        },
      }),
    );
    expect(req.options.maxOutputTokens).toBeLessThanOrEqual(220);
  });

  it("keeps disambiguation output short and deterministic", () => {
    const builder = makeBuilder();
    const req = builder.build(
      makeInput({
        signals: {
          ...makeInput().signals,
          answerMode: "rank_disambiguate",
          disambiguation: {
            active: true,
            candidateType: "document",
            options: [
              { id: "1", label: "Doc A" },
              { id: "2", label: "Doc B" },
            ],
            maxOptions: 4,
            maxQuestions: 1,
          },
        },
      }),
    );
    expect((req.kodaMeta as any)?.promptType).toBe("disambiguation");
    expect(req.options.maxOutputTokens).toBeLessThanOrEqual(220);
  });

  it("emits structured evidence map metadata for provenance checks", () => {
    const builder = makeBuilder();
    const req = builder.build(
      makeInput({
        signals: {
          ...makeInput().signals,
          answerMode: "doc_grounded_single",
        },
        evidencePack: {
          evidence: [
            {
              docId: "doc-1",
              locationKey: "p:1:c:1",
              snippet: "Revenue in Q1 was 200k",
              evidenceType: "text",
            },
          ],
        } as any,
      }),
    );
    const evidenceMap = (req.kodaMeta as any)?.evidenceMap;
    expect(Array.isArray(evidenceMap)).toBe(true);
    expect(evidenceMap).toHaveLength(1);
    expect(evidenceMap[0]).toMatchObject({
      evidenceId: "doc-1:p:1:c:1",
      documentId: "doc-1",
      locationKey: "p:1:c:1",
    });
    expect(typeof evidenceMap[0].snippetHash).toBe("string");
    expect(evidenceMap[0].snippetHash.length).toBe(16);
  });
});
