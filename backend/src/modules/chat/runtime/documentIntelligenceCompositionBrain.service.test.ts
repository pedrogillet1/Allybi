import { describe, expect, test, jest, beforeEach } from "@jest/globals";

jest.mock("../../domain/infra", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../../domain/infra";
import { DocumentIntelligenceCompositionBrainService } from "./documentIntelligenceCompositionBrain.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<typeof getOptionalBank>;

describe("DocumentIntelligenceCompositionBrainService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "followup_suggestions") {
        return {
          config: { enabled: true },
          suggestions: [
            {
              id: "fs_en_extract",
              intent: "extract",
              language: "en",
              text: "Check whether the same amount appears in another section or period.",
              query: "Show the same amount in the adjacent period from {{document}}.",
            },
            {
              id: "fs_en_compare",
              intent: "compare",
              language: "en",
              text: "Compare this metric with a peer document and flag only material differences.",
              query: "Compare {{document}} with {{otherDocument}} for the same metric.",
            },
          ],
        } as any;
      }
      if (bankId === "tone_profiles") {
        return {
          config: { enabled: true },
          profiles: [
            {
              id: "tone_finance_auditor",
              domain: "finance",
              primaryTone: "precise",
              wordingRules: ["state assumptions", "attach caveats"],
            },
          ],
        } as any;
      }
      if (bankId === "voice_personality_profiles") {
        return {
          config: { enabled: true },
          profiles: [{ id: "balanced", traits: ["direct", "evidence_first"] }],
        } as any;
      }
      if (bankId === "hedging_and_uncertainty_language") {
        return {
          config: { enabled: true },
          phrases: { en: ["based on cited evidence", "appears to"] },
        } as any;
      }
      if (bankId === "anti_robotic_style_rules") {
        return { rules: [{ id: "ARS_001" }] } as any;
      }
      if (bankId === "table_render_policy") {
        return { config: { preserveHeaders: true, preserveUnits: true } } as any;
      }
      if (bankId === "verbosity_ladder") {
        return { levels: { balanced: { maxWords: 220 }, detailed: { maxWords: 360 } } } as any;
      }
      if (bankId === "transition_phrases") {
        return { phrases: { en: ["Then", "Next"] } } as any;
      }
      if (bankId === "verb_phrase_bank") {
        return { phrases: { en: ["I confirmed from the source"] } } as any;
      }
      if (bankId === "openers") {
        return {
          openers: [
            { intent: "extract", language: "en", text: "I found relevant evidence from {{document}} and can summarize it safely." },
          ],
        } as any;
      }
      if (bankId === "closers") {
        return { closers: [{ language: "en", text: "If you want, I can also run a second pass for period tie-out." }] } as any;
      }
      if (bankId === "fallback_messages") {
        return { messages: { en: { missingEvidence: "I cannot answer that from current document evidence." } } } as any;
      }
      return null as any;
    });
  });

  test("builds bank-driven followups instead of generic labels", () => {
    const service = new DocumentIntelligenceCompositionBrainService();
    const followups = service.buildFollowups({
      preferredLanguage: "en",
      answerMode: "doc_grounded_single",
      topic: "revenue",
      document: "Q1 Report",
      otherDocument: "Q2 Report",
      hasMultipleDocs: true,
      desiredCount: 2,
    });

    expect(followups).toHaveLength(2);
    expect(followups[0]?.label).toBe(
      "Check whether the same amount appears in another section or period.",
    );
    expect(followups[0]?.query).toContain("Q1 Report");
    expect(followups[1]?.query).toContain("Q2 Report");
  });

  test("builds premium evidence-first prompt signals", () => {
    const service = new DocumentIntelligenceCompositionBrainService();
    const signals = service.buildPromptSignals({
      preferredLanguage: "en",
      answerMode: "doc_grounded_multi",
      domain: "finance",
      userRequestedShort: false,
    });

    expect(signals.compositionTone).toBe("precise");
    expect(signals.voiceProfile).toBe("balanced");
    expect(signals.preserveTableHeaders).toBe(true);
    expect(signals.antiRoboticRuleCount).toBe(1);
  });

  test("adds anti-robotic composition guidance to prompt addendum", () => {
    const service = new DocumentIntelligenceCompositionBrainService();
    const lines = service.buildPromptAddendum({
      preferredLanguage: "en",
      answerMode: "doc_grounded_single",
      domain: "finance",
      evidenceConfidence: 0.6,
    });

    const joined = lines.join("\n");
    expect(joined).toContain("Lead with the answer");
    expect(joined).toContain("Avoid repetitive sentence starters");
    expect(joined).toContain("based on cited evidence");
  });
});
