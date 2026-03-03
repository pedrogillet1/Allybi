import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("./policyBankResolver.service", () => ({
  resolvePolicyBank: jest.fn(),
}));

import { resolvePolicyBank } from "./policyBankResolver.service";
import { ViewerLockedChatPolicyService } from "./viewerLockedChatPolicy.service";

const mockedResolvePolicyBank = resolvePolicyBank as jest.MockedFunction<
  typeof resolvePolicyBank
>;

describe("ViewerLockedChatPolicyService", () => {
  beforeEach(() => {
    mockedResolvePolicyBank.mockReset();
  });

  test("returns defaults when bank is unavailable", () => {
    mockedResolvePolicyBank.mockReturnValue(null as any);
    const service = new ViewerLockedChatPolicyService();
    const config = service.resolve();
    expect(config.defaultViewerIntent).toBe("qa_locked");
    expect(config.defaultAnswerMode).toBe("doc_grounded_single");
  });

  test("reads configured values from bank", () => {
    mockedResolvePolicyBank.mockReturnValue({
      config: {
        enabled: true,
        strict: true,
      },
      policy: {
        defaultViewerIntent: "qa_locked",
        defaultAnswerMode: "doc_grounded_single",
        scope: {
          lockToActiveDocument: true,
          emitScopeSignals: ["explicitDocLock", "hardScopeActive"],
        },
      },
    } as any);

    const service = new ViewerLockedChatPolicyService();
    const config = service.resolve();

    expect(config.lockToActiveDocument).toBe(true);
    expect(config.emitScopeSignals).toEqual([
      "explicitDocLock",
      "hardScopeActive",
    ]);
  });
});
