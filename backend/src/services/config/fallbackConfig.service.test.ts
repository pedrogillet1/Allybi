import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../core/banks/bankLoader.service";
import { FallbackConfigService } from "./fallbackConfig.service";

const mockGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("FallbackConfigService", () => {
  test("loads fallback_router rules and resolves actions without scenarios[]", async () => {
    mockGetOptionalBank.mockReturnValue({
      config: {
        enabled: true,
        defaults: {
          action: "ask_one_question",
          telemetryReason: "UNKNOWN",
        },
      },
      rules: [
        {
          id: "fr_no_docs_indexed",
          when: { reasonCodeIn: ["no_docs_indexed"] },
          do: { action: "route_to_discovery", telemetryReason: "NO_EVIDENCE" },
        },
        {
          id: "fr_default",
          when: {},
          do: { action: "ask_one_question", telemetryReason: "UNKNOWN" },
        },
      ],
    } as any);

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const svc = new FallbackConfigService(undefined, logger);
    await svc.loadFallbacks();

    expect(svc.isReady()).toBe(true);
    expect(svc.getRouterDecision("no_docs_indexed")).toEqual({
      action: "route_to_discovery",
      telemetryReason: "NO_EVIDENCE",
    });
    expect(svc.getRouterDecision("unknown_reason")).toEqual({
      action: "ask_one_question",
      telemetryReason: "UNKNOWN",
    });
  });
});
