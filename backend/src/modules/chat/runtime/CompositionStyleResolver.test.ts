import { describe, expect, jest, test } from "@jest/globals";

const mockGetOptionalBank = jest.fn();

jest.mock("../../domain/infra", () => ({
  __esModule: true,
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
}));

import { CompositionStyleResolver } from "./CompositionStyleResolver";
import type { ChatRequest } from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Summarize the document",
    attachedDocumentIds: [],
    preferredLanguage: "en",
    ...overrides,
  };
}

function makeEvidencePack(overrides: Partial<EvidencePack> = {}): EvidencePack {
  return {
    query: "summarize",
    scope: null,
    stats: null,
    evidence: [],
    ...overrides,
  } as EvidencePack;
}

describe("CompositionStyleResolver", () => {
  test("selects sensitive voice, quote strategy, and empathy mode from runtime context", () => {
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "voice_personality_profiles") {
        return {
          profiles: [
            { id: "balanced_operator" },
            { id: "supportive_sensitive" },
            { id: "executive_brief" },
          ],
        };
      }
      if (bankId === "answer_strategies") {
        return {
          strategies: [
            { id: "direct_answer_then_support" },
            { id: "quote_then_explain" },
          ],
        };
      }
      if (bankId === "response_templates") {
        return {
          templates: [{ id: "TML_QUOTE_EXPLANATION_EN" }],
        };
      }
      if (bankId === "openers_and_framing") {
        return {
          families: {
            stabilize_then_answer: {},
            evidence_anchor: {},
            direct_answer: {},
          },
        };
      }
      if (bankId === "sentence_rhythm_and_variety") {
        return {
          patterns: [{ id: "careful_two_step" }, { id: "short_then_supported" }],
        };
      }
      if (bankId === "anti_repetition_patterns") {
        return {
          patterns: [{ id: "repeat_same_starter" }, { id: "repeat_same_transition" }],
        };
      }
      if (bankId === "claim_strength_language") {
        return {
          levels: [{ id: "strong" }, { id: "moderate" }, { id: "weak" }],
        };
      }
      if (bankId === "empathy_and_support_language") {
        return {
          situations: [{ id: "legal_exposure" }],
        };
      }
      if (bankId === "uncertainty_calibration") {
        return {
          bands: [{ id: "high_confidence" }, { id: "medium_confidence" }],
        };
      }
      return null;
    });

    const resolver = new CompositionStyleResolver();
    const decision = resolver.resolve({
      req: makeRequest({
        meta: { domain: "legal" },
        context: { signals: { safetyGate: true, audience: "executive" } },
      }),
      retrievalPack: makeEvidencePack(),
      answerMode: "doc_grounded_quote",
      evidenceStrength: "high",
    });

    expect(decision.voiceProfile).toBe("supportive_sensitive");
    expect(decision.domainVoiceModifier).toBe("sensitive_grounded");
    expect(decision.interactionModifier).toBe("steady");
    expect(decision.answerStrategy).toBe("quote_then_explain");
    expect(decision.templateFamily).toBe("quote_explanation");
    expect(decision.uncertaintyBand).toBe("high_confidence");
    expect(decision.openerFamily).toBe("evidence_anchor");
    expect(decision.rhythmProfile).toBe("careful_two_step");
    expect(decision.claimStrengthProfile).toBe("strong");
    expect(decision.clarificationPolicy).toBe("answer_directly_without_clarifier");
    expect(decision.fallbackPosture).toBe("steady_answer_then_boundary");
    expect(decision.paragraphPlan).toBe("single_paragraph_compressed");
    expect(decision.empathyBudget).toBe(2);
    expect(decision.turnStyleStateKey).toContain("supportive_sensitive");
    expect(decision.repetitionGuard).toEqual([
      "repeat_same_starter",
      "repeat_same_transition",
    ]);
    expect(decision.empathyMode).toBe("legal_exposure");
    expect(decision.antiRoboticFocus).toEqual(
      expect.arrayContaining(["plain_quote_explanation"]),
    );
  });

  test("selects table strategy and low-confidence band when evidence is weak", () => {
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "voice_personality_profiles") {
        return {
          profiles: [
            { id: "balanced_operator" },
            { id: "analyst_precise" },
          ],
        };
      }
      if (bankId === "answer_strategies") {
        return {
          strategies: [
            { id: "direct_answer_then_support" },
            { id: "table_then_takeaway" },
            { id: "scope_limit_then_safe_answer" },
          ],
        };
      }
      if (bankId === "response_templates") {
        return {
          templates: [{ id: "TML_TABLE_READOUT_EN" }],
        };
      }
      if (bankId === "openers_and_framing") {
        return {
          families: {
            direct_answer: {},
            delta_first: {},
          },
        };
      }
      if (bankId === "sentence_rhythm_and_variety") {
        return {
          patterns: [{ id: "dense_then_release" }, { id: "medium_then_short_takeaway" }],
        };
      }
      if (bankId === "anti_repetition_patterns") {
        return {
          patterns: [{ id: "repeat_same_starter" }],
        };
      }
      if (bankId === "claim_strength_language") {
        return {
          levels: [{ id: "moderate" }, { id: "weak" }],
        };
      }
      if (bankId === "empathy_and_support_language") {
        return { situations: [] };
      }
      if (bankId === "uncertainty_calibration") {
        return {
          bands: [{ id: "medium_confidence" }, { id: "low_confidence" }],
        };
      }
      return null;
    });

    const resolver = new CompositionStyleResolver();
    const decision = resolver.resolve({
      req: makeRequest({
        meta: { domain: "finance" },
        context: { signals: { audience: "analyst" } },
      }),
      retrievalPack: makeEvidencePack({
        evidence: [
          {
            evidenceType: "table",
          },
        ],
      }),
      answerMode: "doc_grounded_table",
      evidenceStrength: "low",
    });

    expect(decision.voiceProfile).toBe("analyst_precise");
    expect(decision.domainVoiceModifier).toBe("finance_analytic");
    expect(decision.interactionModifier).toBe("guarded");
    expect(decision.answerStrategy).toBe("table_then_takeaway");
    expect(decision.templateFamily).toBe("table_readout");
    expect(decision.uncertaintyBand).toBe("low_confidence");
    expect(decision.openerFamily).toBe("direct_answer");
    expect(decision.rhythmProfile).toBe("dense_then_release");
    expect(decision.claimStrengthProfile).toBe("weak");
    expect(decision.clarificationPolicy).toBe("clarify_only_if_blocked");
    expect(decision.fallbackPosture).toBe("bounded_answer_then_limit");
    expect(decision.paragraphPlan).toBe("table_readout_then_takeaway");
    expect(decision.empathyBudget).toBe(0);
    expect(decision.repetitionGuard).toEqual(["repeat_same_starter"]);
    expect(decision.antiRoboticFocus).toEqual(
      expect.arrayContaining(["table_then_takeaway", "bounded_uncertainty"]),
    );
  });
});
