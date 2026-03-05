import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const getOptionalBankMock = jest.fn();
const plannerMock = jest.fn();
const rolloutEnabledMock = jest.fn();
const getDiOntologyMock = jest.fn();

jest.mock("./bankLoader.service", () => ({
  getOptionalBank: (bankId: string) => getOptionalBankMock(bankId),
}));

jest.mock("./bankLoadPlanner.service", () => ({
  getBankLoadPlannerInstance: () => ({
    plan: plannerMock,
  }),
}));

jest.mock("./bankRollout.service", () => ({
  getBankRolloutInstance: () => ({
    isEnabled: rolloutEnabledMock,
  }),
}));

jest.mock("./documentIntelligenceBanks.service", () => {
  const actual = jest.requireActual("./documentIntelligenceBanks.service");
  return {
    ...actual,
    getDocumentIntelligenceBanksInstance: () => ({
      getDiOntology: getDiOntologyMock,
    }),
  };
});

import { BankSelectionPlannerService } from "./bankSelectionPlanner.service";

describe("BankSelectionPlannerService", () => {
  beforeEach(() => {
    getOptionalBankMock.mockReset();
    plannerMock.mockReset();
    rolloutEnabledMock.mockReset();
    getDiOntologyMock.mockReset();

    plannerMock.mockReturnValue({
      orderedBankIds: [],
      expandedBankIds: [],
      missingBankIds: [],
      hasCycles: false,
    });
    rolloutEnabledMock.mockReturnValue(false);
    getDiOntologyMock.mockReturnValue({
      config: {
        canonicalDomainIds: [
          "accounting",
          "banking",
          "billing",
          "education",
          "everyday",
          "finance",
          "housing",
          "hr_payroll",
          "identity",
          "insurance",
          "legal",
          "medical",
          "ops",
          "tax",
          "travel",
        ],
      },
    });

    getOptionalBankMock.mockImplementation((bankId: string) => {
      if (bankId === "document_intelligence_bank_map") {
        return { requiredCoreBankIds: [], optionalBankIds: [] };
      }
      if (bankId === "doc_type_confusion_matrix") {
        return {
          config: { enabled: true },
          rules: [
            {
              id: "CTM_003",
              docTypeA: "every_electricity_bill",
              docTypeB: "billing_electricity_bill",
              winner: "billing_electricity_bill",
              confidenceBoost: 0.3,
            },
          ],
        };
      }
      if (bankId === "cross_domain_tiebreak_policy") {
        return { config: { enabled: false }, rules: [] };
      }
      return null;
    });
  });

  test("applies doc_type_confusion_matrix and flips winner for ambiguous doc type", () => {
    const service = new BankSelectionPlannerService();

    const withoutDocType = service.plan({
      query: "everyday household bill",
      locale: "en",
    });
    expect(withoutDocType.domainId).toBe("everyday");

    const withDocType = service.plan({
      query: "everyday household bill",
      docTypeId: "every_electricity_bill",
      locale: "en",
    });
    expect(withDocType.domainId).toBe("billing");
    expect(withDocType.reasons).toContain("doc_type_confusion_matrix_applied");
    expect(withDocType.reasons).toContain("doc_type_confusion_rule:CTM_003:billing");
  });

  test("does not apply confusion rule when winner/loser domains are not both in candidates", () => {
    const service = new BankSelectionPlannerService();
    const result = service.plan({
      query: "everyday household personal",
      docTypeId: "every_electricity_bill",
      locale: "en",
    });

    expect(result.domainId).toBe("everyday");
    expect(result.reasons).not.toContain("doc_type_confusion_matrix_applied");
  });

  test("rejects inferred domain if not present in DI ontology canonical domain list", () => {
    getDiOntologyMock.mockReturnValue({
      config: {
        canonicalDomainIds: ["legal"],
      },
    });

    const service = new BankSelectionPlannerService();
    const result = service.plan({
      query: "everyday household bill",
      docTypeId: "every_electricity_bill",
      locale: "en",
    });

    expect(result.domainId).toBeNull();
    expect(result.reasons).toContain("domain:rejected_by_di_ontology:billing");
  });
});

