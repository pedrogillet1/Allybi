import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../banks/bankLoader.service";
import { CompliancePhraseResolverService } from "./compliancePhraseResolver.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("CompliancePhraseResolverService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
  });

  test("returns localized compliance text by reason code", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: {
        actionsContract: { thresholds: { maxComplianceChars: 220 } },
      },
      phrases: {
        default: {
          en: "Default block.",
        },
        byReasonCode: {
          compliance_missing_consent: {
            pt: "Preciso de consentimento explicito antes de continuar com esse pedido.",
          },
        },
      },
    } as any);

    const service = new CompliancePhraseResolverService();
    expect(
      service.buildUserFacingText({
        preferredLanguage: "pt",
        reasonCode: "compliance_missing_consent",
      }),
    ).toBe("Preciso de consentimento explicito antes de continuar com esse pedido.");
  });

  test("falls back to default bank copy when reason code is unknown", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: {
        actionsContract: { thresholds: { maxComplianceChars: 220 } },
      },
      phrases: {
        default: {
          en: "Default block.",
        },
        byReasonCode: {},
      },
    } as any);

    const service = new CompliancePhraseResolverService();
    expect(
      service.buildUserFacingText({
        preferredLanguage: "en",
        reasonCode: "unknown_reason",
      }),
    ).toBe("Default block.");
  });
});
