import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getBankLoaderInstance: jest.fn(),
}));

import { getBankLoaderInstance } from "../banks/bankLoader.service";
import { EvidenceGateService } from "./evidenceGate.service";

const mockedGetBankLoaderInstance =
  getBankLoaderInstance as jest.MockedFunction<typeof getBankLoaderInstance>;

function makeMemoryPolicyBank() {
  return {
    config: {
      runtimeTuning: {
        evidenceGate: {
          factRequiringPatterns: {
            dates: ["\\bwhen\\b"],
            numbers: ["\\bhow many\\b"],
            names: ["\\bwho\\b"],
            specifics: ["\\bexact\\b"],
          },
          narrativeRiskPatterns: ["overview", "visao geral"],
          evidenceKeywords: {
            dates: "\\b\\d{4}\\b",
            numbers: "\\b\\d+\\b",
            names: "\\b[A-Z][a-z]+\\b",
            quotes: '"[^"]+"',
            specifics: "\\bsection\\b",
          },
          richContentMinWords: 250,
          strengthThresholds: {
            strong: 0.8,
            moderate: 0.4,
          },
          copy: {
            clarifyQuestion: {
              en: "Can you narrow the request?",
              pt: "Pode especificar melhor o pedido?",
              es: "Puedes precisar mejor la solicitud?",
            },
            hedgePrefixWeak: {
              en: "Based on limited evidence:",
              pt: "Com evidencia limitada:",
              es: "Con evidencia limitada:",
            },
            hedgePrefixModerateNarrative: {
              en: "Likely interpretation:",
              pt: "Interpretacao mais provavel:",
              es: "Interpretacion mas probable:",
            },
          },
        },
      },
    },
  };
}

beforeEach(() => {
  mockedGetBankLoaderInstance.mockReturnValue({
    getBank: jest.fn((bankId: string) =>
      bankId === "memory_policy" ? makeMemoryPolicyBank() : null,
    ),
  } as any);
});

describe("EvidenceGateService", () => {
  test("uses locale variants (pt-BR) for clarify question in narrative-risk weak evidence", () => {
    const service = new EvidenceGateService();
    const result = service.checkEvidence(
      "visao geral do contrato",
      [{ text: "texto curto sem relacao direta", metadata: {} }],
      "pt-BR",
    );
    expect(result.evidenceStrength).toBe("weak");
    expect(result.suggestedAction).toBe("clarify");
    expect(result.clarifyQuestion).toBe("Pode especificar melhor o pedido?");
  });

  test("returns apologize when there are no chunks", () => {
    const service = new EvidenceGateService();
    const result = service.checkEvidence("when was it signed", [], "en");
    expect(result.evidenceStrength).toBe("none");
    expect(result.suggestedAction).toBe("apologize");
  });

  test("returns none/apologize when chunks exist but topic overlap is negligible", () => {
    const service = new EvidenceGateService();
    const result = service.checkEvidence(
      "what are the financial projections for Q3",
      [
        { text: "Employee handbook section 4.2 covers dress code policies.", metadata: {} },
        { text: "Please submit PTO requests two weeks in advance.", metadata: {} },
      ],
      "en",
    );
    expect(result.evidenceStrength).toBe("none");
    expect(result.suggestedAction).toBe("apologize");
  });

  test("returns weak (not none) when overlap is between 0.10 and 0.20", () => {
    const service = new EvidenceGateService();
    const result = service.checkEvidence(
      "summarize the report findings",
      [{ text: "The report header shows the company logo and title page.", metadata: {} }],
      "en",
    );
    expect(result.evidenceStrength).toBe("weak");
  });

  test("returns weak when overlap is low but rich content exists", () => {
    const service = new EvidenceGateService();
    const longText = Array(260).fill("word").join(" ");
    const result = service.checkEvidence(
      "what are the financial projections",
      [{ text: longText, metadata: {} }],
      "en",
    );
    expect(["weak", "moderate", "strong"]).toContain(result.evidenceStrength);
  });
});
