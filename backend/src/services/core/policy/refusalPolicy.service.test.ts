import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../banks/bankLoader.service";
import { RefusalPolicyService } from "./refusalPolicy.service";
import { RefusalPhraseResolverService } from "./refusalPhraseResolver.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("RefusalPolicyService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
  });

  test("returns blocked decision when refusal rule matches", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: { enabled: true },
      rules: [
        {
          id: "R1",
          priority: 1000,
          when: {
            path: "signals.policy.selfHarm",
            op: "eq",
            value: true,
          },
          then: {
            action: "refuse_and_redirect",
            category: "self_harm",
            responseType: "self_harm_safe",
          },
          reasonCode: "self_harm_blocked",
        },
      ],
    } as any);

    const service = new RefusalPolicyService();
    const decision = service.decide({
      meta: { policy: { selfHarm: true } },
      context: {},
    });

    expect(decision.blocked).toBe(true);
    expect(decision.category).toBe("self_harm");
    expect(decision.reasonCode).toBe("self_harm_blocked");
  });

  test("phrase resolver localizes message and safe alternative", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: {
        enabled: true,
        actionsContract: { thresholds: { maxRefusalChars: 220 } },
      },
      rules: [],
    } as any);

    const service = new RefusalPhraseResolverService();
    const text = service.buildUserFacingText({
      preferredLanguage: "pt",
      decision: {
        blocked: true,
        action: "refuse",
        ruleId: "R1",
        reasonCode: "policy_refusal_required",
        terminal: true,
        category: "other",
        safeAlternatives: ["safe_help"],
      },
    });

    expect(text).toContain("Nao posso");
    expect(text).toContain("alternativa segura");
  });
});
