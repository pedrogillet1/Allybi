import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { getOptionalBank } from "../../domain/infra";
import { DocumentIntelligenceBrainDecisionFrameService } from "./documentIntelligenceBrainDecisionFrame.service";

jest.mock("../../domain/infra", () => ({
  getOptionalBank: jest.fn(),
}));

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("DocumentIntelligenceBrainDecisionFrameService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "query_family_catalog") {
        return {
          config: { enabled: true, defaultFamily: "document_retrieval" },
          families: [
            {
              id: "family_extract",
              name: "content_extraction",
              canonicalIntents: ["extract", "summarize", "quote"],
            },
          ],
        } as any;
      }
      if (bankId === "confidence_calibration") {
        return { thresholds: { low: 0.45, medium: 0.65, high: 0.85 } } as any;
      }
      if (bankId === "claim_strength_matrix") {
        return {
          levels: [{ id: "exact" }, { id: "inference" }, { id: "speculative" }],
        } as any;
      }
      if (bankId === "doc_lock_policy") {
        return { config: { allowUnlockOnExplicitCompare: true } } as any;
      }
      if (bankId === "source_policy") {
        return { rules: [{ id: "SRC_006_doc_grounded_requires_citation" }] } as any;
      }
      if (bankId === "one_best_question_policy") {
        return { config: { maxQuestions: 1 } } as any;
      }
      if (bankId === "project_memory_policy") {
        return { policy: { docLockBlocksBroadMemoryBleed: true } } as any;
      }
      if (bankId === "context_container_profiles") {
        return {
          profiles: [
            { id: "single_doc", requiresActiveDoc: true },
            { id: "corpus", requiresActiveDoc: false },
          ],
        } as any;
      }
      if (bankId === "tone_profiles") {
        return { profiles: [{ domain: "finance", primaryTone: "precise" }] } as any;
      }
      if (bankId === "voice_personality_profiles") {
        return { profiles: [{ id: "balanced", traits: ["direct"] }] } as any;
      }
      if (bankId === "verbosity_ladder") {
        return { levels: { balanced: { maxWords: 220 } } } as any;
      }
      if (bankId === "assistant_identity") {
        return { identity: { name: "Allybi", stance: "evidence_first" } } as any;
      }
      if (bankId === "mission_and_non_goals") {
        return { mission: { primary: "Answer from documents." } } as any;
      }
      if (bankId === "help_and_capabilities") {
        return { capabilities: { can: ["extract"], cannot: ["invent"] } } as any;
      }
      if (bankId === "behavioral_contract") {
        return { rules: ["stay precise"] } as any;
      }
      return null as any;
    });
  });

  test("builds a populated 8-question frame for doc-grounded turns", () => {
    const service = new DocumentIntelligenceBrainDecisionFrameService();
    const frame = service.build({
      outputLanguage: "pt",
      userText: "Resuma o contrato",
      signals: {
        answerMode: "doc_grounded_single",
        intentFamily: "documents",
        operator: "summarize",
        domain: "finance",
        explicitDocLock: true,
        activeDocId: "doc-1",
        maxQuestions: 1,
      },
      evidencePack: {
        evidence: [{ docId: "doc-1" }],
        stats: { topScore: 0.52, uniqueDocsInEvidence: 1 },
      },
    });

    expect(frame.whatIsThis.answerMode).toBe("doc_grounded_single");
    expect(frame.whatIsThis.queryFamily).toBe("content_extraction");
    expect(frame.whatUserWants.operator).toBe("summarize");
    expect(frame.allowedSources.mode).toBe("locked_doc_only");
    expect(frame.evidenceRequired.mustBeDocumentGrounded).toBe(true);
    expect(frame.reasoningPolicy.calibratedLanguageRequired).toBe(true);
    expect(frame.responsePolicy.language).toBe("pt");
    expect(frame.actionPlan.action).toBe("answer");
    expect(frame.proofPlan.requireLocationRichProvenance).toBe(true);
    expect(frame.contributingBankIds).toContain("query_family_catalog");
    expect(frame.contributingBankIds).toContain("source_policy");
  });
});
