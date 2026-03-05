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
    provenance: {
      mode: "hidden_map",
      required: true,
      validated: true,
      failureCode: null,
      evidenceIdsUsed: ["doc-1:loc-1"],
      sourceDocumentIds: ["doc-1"],
      snippetRefs: [
        {
          evidenceId: "doc-1:loc-1",
          documentId: "doc-1",
          locationKey: "loc-1",
          snippetHash: "hash-1",
          coverageScore: 1,
        },
      ],
      coverageScore: 1,
    },
    completion: { answered: true, missingSlots: [], nextAction: null },
    truncation: { occurred: false, reason: null, resumeToken: null },
    evidence: { required: true, provided: true, sourceIds: ["doc-1"] },
    status: "success",
    ...overrides,
  };
}

describe("ContractNormalizer", () => {
  test("fails closed when required evidence is missing", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        evidence: { required: true, provided: false, sourceIds: [] },
        sources: [],
      }),
    );
    expect(normalized.status).toBe("failed");
    expect(normalized.failureCode).toBe("MISSING_EVIDENCE");
  });

  test("keeps success when evidence is present even if provenance metadata is missing", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        provenance: undefined,
      }),
    );
    expect(normalized.status).toBe("success");
    expect(normalized.failureCode).toBeNull();
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
  });

  test("sets failed status when completion is unanswered despite success status", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        status: "success",
        completion: {
          answered: false,
          missingSlots: ["scope"],
          nextAction: "clarify",
        },
      }),
    );
    expect(normalized.status).toBe("failed");
    expect(normalized.failureCode).toBe("EMPTY_ANSWER");
  });

  test("fails closed when blocking quality gates are present", () => {
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
    expect(normalized.status).toBe("failed");
    expect(normalized.failureCode).toBe("quality_gate_blocked");
  });

  test("keeps success when fallback telemetry exists but user-facing fallback reason is absent", () => {
    const normalizer = new ContractNormalizer();
    const normalized = normalizer.normalize(
      mkResult({
        status: "success",
        fallbackReasonCode: undefined,
        assistantTelemetry: {
          fallbackTelemetry: { reasonCode: "low_confidence" },
        },
      } as ChatResult),
    );
    expect(normalized.status).toBe("success");
    expect(normalized.failureCode).toBeNull();
  });
});
