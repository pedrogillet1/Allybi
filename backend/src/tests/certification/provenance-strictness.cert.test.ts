import { describe, expect, test } from "@jest/globals";
import { buildChatProvenance } from "../../modules/chat/runtime/provenance/ProvenanceBuilder";
import { validateChatProvenance } from "../../modules/chat/runtime/provenance/ProvenanceValidator";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: provenance strictness", () => {
  test("doc-grounded modes fail when overlap is too weak and pass when overlap is strong", () => {
    const zeroOverlapEvidence = {
      evidence: [
        {
          docId: "doc-1",
          locationKey: "loc-1",
          snippet:
            "The quarterly margin increased due to controlled operating expenses.",
        },
      ],
    } as any;
    const weakProvenance = buildChatProvenance({
      answerText: "Tabela consolidada por prioridade.",
      answerMode: "doc_grounded_quote" as any,
      answerClass: "DOCUMENT" as any,
      retrievalPack: zeroOverlapEvidence,
    });
    const weakValidation = validateChatProvenance({
      provenance: weakProvenance,
      answerMode: "doc_grounded_quote" as any,
      answerClass: "DOCUMENT" as any,
      allowedDocumentIds: ["doc-1"],
    });

    const strongEvidence = {
      evidence: [
        {
          docId: "doc-1",
          locationKey: "loc-2",
          snippet:
            "Revenue increased 15 percent year over year because enterprise renewals improved.",
        },
      ],
    } as any;
    const strongProvenance = buildChatProvenance({
      answerText:
        "Revenue increased 15 percent year over year because enterprise renewals improved.",
      answerMode: "doc_grounded_single" as any,
      answerClass: "DOCUMENT" as any,
      retrievalPack: strongEvidence,
    });
    const strongValidation = validateChatProvenance({
      provenance: strongProvenance,
      answerMode: "doc_grounded_single" as any,
      answerClass: "DOCUMENT" as any,
      allowedDocumentIds: ["doc-1"],
    });

    const failures: string[] = [];
    if (weakValidation.ok) failures.push("WEAK_OVERLAP_NOT_BLOCKED");
    if (!strongValidation.ok) failures.push("STRONG_OVERLAP_BLOCKED");

    writeCertificationGateReport("provenance-strictness", {
      passed: failures.length === 0,
      metrics: {
        weakOverlapBlocked: !weakValidation.ok,
        strongOverlapAccepted: strongValidation.ok,
      },
      thresholds: {
        weakOverlapBlocked: true,
        strongOverlapAccepted: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
