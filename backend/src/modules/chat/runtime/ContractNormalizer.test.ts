import { describe, expect, test } from "@jest/globals";
import type { ChatResult } from "../domain/chat.contracts";
import { ContractNormalizer } from "./ContractNormalizer";

function mkResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    conversationId: "conv-1",
    userMessageId: "user-msg-1",
    assistantMessageId: "assistant-msg-1",
    assistantText: "grounded answer",
    answerMode: "doc_grounded_single",
    answerClass: "DOCUMENT",
    sources: [
      { documentId: "doc-1", filename: "d1.pdf", mimeType: null, page: 1 },
    ],
    completion: { answered: true, missingSlots: [], nextAction: null },
    truncation: { occurred: false, reason: null, resumeToken: null },
    evidence: { required: true, provided: true, sourceIds: ["doc-1"] },
    status: "success",
    ...overrides,
  };
}

describe("ContractNormalizer", () => {
  test("downgrades to partial when required evidence is missing", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        evidence: { required: true, provided: false, sourceIds: [] },
        sources: [],
      }),
    );
    expect(normalized.status).toBe("partial");
    expect(normalized.failureCode).toBe("MISSING_SOURCES");
  });

  test("marks navigation payload responses as answered when assistant text is empty", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        assistantText: "",
        listing: [{ kind: "file", id: "f1", title: "Budget.xlsx" }],
        completion: { answered: false, missingSlots: [], nextAction: null },
      }),
    );
    expect(normalized.completion?.answered).toBe(true);
    expect(normalized.status).toBe("success");
  });

  test("downgrades success to partial when truncation occurred", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        truncation: {
          occurred: true,
          reason: "semantic_incomplete",
          resumeToken: null,
        },
      }),
    );
    expect(normalized.status).toBe("partial");
    expect(normalized.failureCode).toBe("TRUNCATED_OUTPUT");
  });

  test("deduplicates sources deterministically", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        sources: [
          { documentId: "doc-1", filename: "d1.pdf", mimeType: null, page: 1 },
          { documentId: "doc-1", filename: "d1.pdf", mimeType: null, page: 1 },
        ],
      }),
    );
    expect(normalized.sources).toHaveLength(1);
    expect(normalized.evidence?.sourceIds).toEqual(["doc-1"]);
  });

  test("downgrades to partial when blocking quality gates are present", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        qualityGates: {
          allPassed: false,
          failed: [
            {
              gateName: "no_raw_json",
              severity: "block",
              reason: "Response appears to be raw JSON output",
            },
          ],
        },
      }),
    );
    expect(normalized.status).toBe("partial");
    expect(normalized.failureCode).toBe("QUALITY_GATE_BLOCKED");
  });
});
