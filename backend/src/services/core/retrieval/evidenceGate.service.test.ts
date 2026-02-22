import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getBankLoaderInstance: () => ({
    getBank: (...args: unknown[]) => mockGetBank(...args),
  }),
}));

describe("EvidenceGateService", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => {
      if (bankId === "memory_policy") {
        return {
          config: {
            runtimeTuning: {
              evidenceGate: {
                factRequiringPatterns: {
                  dates: ["\\bwhen\\b"],
                  numbers: ["\\bhow much\\b"],
                  names: ["\\bwho\\b"],
                  specifics: ["\\bexactly\\b"],
                },
                narrativeRiskPatterns: ["\\bhistory\\b"],
                evidenceKeywords: {
                  dates: "\\b(19|20)\\d{2}\\b",
                  numbers: "\\b\\d+\\b",
                  names: "\\b[A-Z][a-z]+\\s+[A-Z][a-z]+\\b",
                  quotes: '"[^"]+"',
                  specifics: "\\bpage\\s+\\d+\\b",
                },
                richContentMinWords: 3,
                strengthThresholds: {
                  strong: 0.8,
                  moderate: 0.5,
                },
                copy: {
                  clarifyQuestion: {
                    en: "Which file should I use?",
                    pt: "Qual arquivo devo usar?",
                    es: "Que archivo debo usar?",
                  },
                  hedgePrefixWeak: {
                    en: "Based on limited evidence, ",
                    pt: "Com evidencia limitada, ",
                    es: "Con evidencia limitada, ",
                  },
                  hedgePrefixModerateNarrative: {
                    en: "According to the available documents, ",
                    pt: "De acordo com os documentos disponiveis, ",
                    es: "Segun los documentos disponibles, ",
                  },
                },
              },
            },
          },
        };
      }
      return null;
    });
  });

  it("apologizes when evidence is off-topic and query asks for dates", async () => {
    const { EvidenceGateService } = await import("./evidenceGate.service");
    const gate = new EvidenceGateService();
    const result = gate.checkEvidence(
      "when is the company history",
      [{ text: "This section provides broad context without exact dates." }],
      "en",
    );
    // Evidence has no dates and no topic overlap → insufficient evidence
    expect(result.suggestedAction).toBe("apologize");
    expect(result.evidenceStrength).toBe("none");
  });

  it("asks for clarification when evidence is weak and query is narrative-risk", async () => {
    const { EvidenceGateService } = await import("./evidenceGate.service");
    const gate = new EvidenceGateService();
    const result = gate.checkEvidence(
      "what is the company history and background",
      [{ text: "The company was established in a competitive market environment with various stakeholders." }],
      "en",
    );
    // Evidence has topic overlap ("company") but no required facts → weak + narrative risk = clarify
    expect(result.suggestedAction).toBe("clarify");
    expect(result.clarifyQuestion).toBe("Which file should I use?");
  });

  it("hedges when weak evidence exists for non-narrative query", async () => {
    const { EvidenceGateService } = await import("./evidenceGate.service");
    const gate = new EvidenceGateService();
    const result = gate.checkEvidence(
      "how much when who exactly",
      [{ text: "context only words here for fallback behavior." }],
      "en",
    );
    expect(result.suggestedAction).toBe("hedge");
    expect(result.hedgePrefix).toBe("Based on limited evidence,");
  });

  it("answers with stronger evidence when required facts are present", async () => {
    const { EvidenceGateService } = await import("./evidenceGate.service");
    const gate = new EvidenceGateService();
    const result = gate.checkEvidence(
      "when did this happen",
      [{ text: 'In 2024, "Acme Corp" started on page 3.' }],
      "en",
    );
    expect(result.evidenceStrength).toBe("strong");
  });
});
