import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { estimateTokenCount } from "./tokenBudget.service";

const mockGetBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
}));

describe("ResponseContractEnforcerService provenance contract", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetBank.mockReturnValue(null);
  });

  it("blocks doc-grounded responses when provenance is missing", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      { content: "Answer text." },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        provenance: null,
      },
    );
    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("missing_provenance");
  });

  it("blocks provenance refs outside allowed scope", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      { content: "Answer text." },
      {
        answerMode: "doc_grounded_multi",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        provenance: {
          mode: "hidden_map",
          required: true,
          validated: false,
          failureCode: null,
          evidenceIdsUsed: ["doc-2:loc-2"],
          sourceDocumentIds: ["doc-2"],
          snippetRefs: [
            {
              evidenceId: "doc-2:loc-2",
              documentId: "doc-2",
              locationKey: "loc-2",
              snippetHash: "abc",
              coverageScore: 0.8,
            },
          ],
          coverageScore: 1,
        },
      },
    );
    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("out_of_scope_provenance");
  });

  it("passes when provenance is valid for doc-grounded response", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      { content: "Answer text." },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        evidenceMapSchemaVersion: "v1",
        evidenceMap: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "abc",
          },
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
              snippetHash: "abc",
              coverageScore: 0.8,
            },
          ],
          coverageScore: 0.5,
        },
      },
    );
    expect(out.enforcement.blocked).toBe(false);
  });

  it("blocks doc-grounded responses when structured evidence map is missing", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      { content: "Answer text." },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
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
              snippetHash: "abc",
              coverageScore: 0.8,
            },
          ],
          coverageScore: 0.9,
        },
      },
    );
    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("missing_evidence_map");
  });

  it("blocks doc-grounded responses when provenance hash mismatches evidence map", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      { content: "Answer text." },
      {
        answerMode: "doc_grounded_multi",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        evidenceMapSchemaVersion: "v1",
        evidenceMap: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "hash-from-map",
          },
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
              snippetHash: "different-hash",
              coverageScore: 0.8,
            },
          ],
          coverageScore: 1,
        },
      },
    );
    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("evidence_map_hash_mismatch");
  });

  it("applies token-aware short constraint trimming", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const longText = Array.from({ length: 120 }, (_, i) => `item-${i}`)
      .join(" ")
      .trim();

    const out = enforcer.enforce(
      { content: longText },
      {
        answerMode: "general_answer",
        language: "en",
        constraints: {
          userRequestedShort: true,
          maxOutputTokens: 30,
        },
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(estimateTokenCount(out.content)).toBeLessThanOrEqual(30);
    expect(out.enforcement.repairs).toContain(
      "SHORT_CONSTRAINT_TRIMMED_TOKENS",
    );
  });

  it("uses hard token guard when content exceeds token budget", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const longText = Array.from({ length: 400 }, () => "budget")
      .join(" ")
      .trim();

    const out = enforcer.enforce(
      { content: longText },
      {
        answerMode: "general_answer",
        language: "en",
        constraints: {
          maxOutputTokens: 80,
          hardMaxOutputTokens: 100,
        },
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(estimateTokenCount(out.content)).toBeLessThanOrEqual(100);
    expect(out.enforcement.repairs).toContain("SOFT_MAX_TOKENS_TRIMMED");
  });
});
