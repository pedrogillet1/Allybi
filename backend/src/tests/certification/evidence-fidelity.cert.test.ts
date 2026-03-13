import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";

const mockGetBank = jest.fn();
const mockGetOptionalBank = jest.fn();

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
}));

describe("Certification: evidence fidelity", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetOptionalBank.mockReset();
    mockGetBank.mockReturnValue(null);
    mockGetOptionalBank.mockReturnValue(null);
  });

  test("doc-grounded output enforces structured provenance map integrity", async () => {
    const { ResponseContractEnforcerService } =
      await import("../../services/core/enforcement/responseContractEnforcer.service");

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
    if (
      !missingMap.enforcement.violations.some(
        (violation) => violation.code === "MISSING_EVIDENCE_MAP",
      )
    ) {
      failures.push("MISSING_MAP_VIOLATION_INVALID");
    }
    if (
      !mismatched.enforcement.violations.some(
        (violation) => violation.code === "EVIDENCE_MAP_HASH_MISMATCH",
      )
    ) {
      failures.push("HASH_MISMATCH_VIOLATION_INVALID");
    }
    if (valid.enforcement.violations.length > 0) {
      failures.push("VALID_MAP_HAS_VIOLATIONS");
    }

    writeCertificationGateReport("evidence-fidelity", {
      passed: failures.length === 0,
      metrics: {
        missingMapViolations: missingMap.enforcement.violations.map(
          (violation) => violation.code,
        ),
        hashMismatchViolations: mismatched.enforcement.violations.map(
          (violation) => violation.code,
        ),
        validMapViolationCount: valid.enforcement.violations.length,
      },
      thresholds: {
        missingMapViolation: "MISSING_EVIDENCE_MAP",
        hashMismatchViolation: "EVIDENCE_MAP_HASH_MISMATCH",
        validMapViolationCount: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
