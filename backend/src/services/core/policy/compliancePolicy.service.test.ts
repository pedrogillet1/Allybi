import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../banks/bankLoader.service";
import { CompliancePolicyService } from "./compliancePolicy.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("CompliancePolicyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetOptionalBank.mockReturnValue(null);
  });

  test("is fail-open when compliance policy bank is missing", () => {
    const service = new CompliancePolicyService();
    expect(service.decide({ meta: {}, context: {} })).toEqual({
      blocked: false,
    });
  });

  test("blocks when compliance is required and user consent is missing", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: { enabled: true },
      rules: [
        {
          id: "COMP_900_missing_consent",
          priority: 900,
          when: {
            all: [
              { path: "signals.complianceRequired", op: "eq", value: true },
              { path: "signals.userConsent", op: "neq", value: true },
            ],
          },
          then: { action: "block", userMessage: "Consent required." },
          reasonCode: "compliance_missing_consent",
          terminal: true,
        },
      ],
    });

    const service = new CompliancePolicyService();
    const result = service.decide({
      meta: { compliance: { required: true, userConsent: false } },
      context: {},
    });

    expect(result.blocked).toBe(true);
    expect(result.reasonCode).toBe("compliance_missing_consent");
    expect(result.message).toBe("Consent required.");
  });

  test("does not block when compliance consent is satisfied", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: { enabled: true },
      rules: [
        {
          id: "COMP_900_missing_consent",
          priority: 900,
          when: {
            all: [
              { path: "signals.complianceRequired", op: "eq", value: true },
              { path: "signals.userConsent", op: "neq", value: true },
            ],
          },
          then: { action: "block", userMessage: "Consent required." },
          reasonCode: "compliance_missing_consent",
          terminal: true,
        },
      ],
    });

    const service = new CompliancePolicyService();
    const result = service.decide({
      meta: { compliance: { required: true, userConsent: true } },
      context: {},
    });

    expect(result).toEqual({ blocked: false });
  });
});
