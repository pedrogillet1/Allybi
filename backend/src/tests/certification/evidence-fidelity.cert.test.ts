import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";

const mockGetBank = jest.fn();

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
}));

describe("Certification: evidence fidelity", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetBank.mockReturnValue(null);
  });

  test("doc-grounded output enforces structured provenance map integrity", async () => {
    const { ResponseContractEnforcerService } = await import(
      "../../services/core/enforcement/responseContractEnforcer.service"
    );

    const enforcer = new ResponseContractEnforcerService();

    const baseProvenance = {
      mode: "hidden_map" as const,
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
          snippetHash: "hash-a",
          coverageScore: 0.9,
        },
      ],
      coverageScore: 1,
    };

    const missingMap = enforcer.enforce(
      { content: "Answer" },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        provenance: baseProvenance,
      },
    );

    const mismatched = enforcer.enforce(
      { content: "Answer" },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        provenance: baseProvenance,
        evidenceMapSchemaVersion: "v1",
        evidenceMap: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "hash-b",
          },
        ],
      },
    );

    const valid = enforcer.enforce(
      { content: "Answer" },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        provenance: baseProvenance,
        evidenceMapSchemaVersion: "v1",
        evidenceMap: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "hash-a",
          },
        ],
      },
    );

    const failures: string[] = [];
    if (!missingMap.enforcement.blocked)
      failures.push("MISSING_MAP_NOT_BLOCKED");
    if (missingMap.enforcement.reasonCode !== "missing_evidence_map") {
      failures.push("MISSING_MAP_REASON_CODE_INVALID");
    }
    if (!mismatched.enforcement.blocked)
      failures.push("HASH_MISMATCH_NOT_BLOCKED");
    if (mismatched.enforcement.reasonCode !== "evidence_map_hash_mismatch") {
      failures.push("HASH_MISMATCH_REASON_CODE_INVALID");
    }
    if (valid.enforcement.blocked) failures.push("VALID_MAP_BLOCKED");

    writeCertificationGateReport("evidence-fidelity", {
      passed: failures.length === 0,
      metrics: {
        missingMapBlocked: missingMap.enforcement.blocked,
        missingMapReasonCode: missingMap.enforcement.reasonCode || null,
        hashMismatchBlocked: mismatched.enforcement.blocked,
        hashMismatchReasonCode: mismatched.enforcement.reasonCode || null,
        validMapPasses: !valid.enforcement.blocked,
      },
      thresholds: {
        missingMapBlocked: true,
        missingMapReasonCode: "missing_evidence_map",
        hashMismatchBlocked: true,
        hashMismatchReasonCode: "evidence_map_hash_mismatch",
        validMapPasses: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
