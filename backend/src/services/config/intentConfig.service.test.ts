import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../core/banks/bankLoader.service", () => ({
  __esModule: true,
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../core/banks/bankLoader.service";
import { IntentConfigService } from "./intentConfig.service";

const mockGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("IntentConfigService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOptionalBank.mockReturnValue(null);
  });

  test("marks close scores as clarification required", () => {
    const service = new IntentConfigService();
    const decision = service.decide({
      env: "dev",
      language: "en",
      queryText: "summarize this",
      candidates: [
        {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          score: 0.71,
        },
        {
          intentId: "help",
          intentFamily: "help",
          operatorId: "capabilities",
          score: 0.7,
        },
      ],
    });

    expect(decision.requiresClarification).toBe(true);
    expect(decision.clarifyReason).toBe("ambiguous_margin");
  });

  test("marks low confidence top candidate as clarification required", () => {
    const service = new IntentConfigService();
    const decision = service.decide({
      env: "dev",
      language: "en",
      queryText: "do something",
      candidates: [
        {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          score: 0.35,
        },
        {
          intentId: "help",
          intentFamily: "help",
          operatorId: "capabilities",
          score: 0.2,
        },
      ],
    });

    expect(decision.requiresClarification).toBe(true);
    expect(decision.clarifyReason).toBe("low_confidence");
  });

  test("keeps previous intent on sticky follow-up without strong switch signal", () => {
    const service = new IntentConfigService();
    const decision = service.decide({
      env: "dev",
      language: "en",
      queryText: "and also this",
      candidates: [
        {
          intentId: "help",
          intentFamily: "help",
          operatorId: "capabilities",
          score: 0.72,
        },
      ],
      signals: { isFollowup: true, followupConfidence: 0.9 },
      state: {
        lastRoutingDecision: {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          domainId: "general",
          confidence: 0.7,
        },
      },
    });

    expect(decision.intentFamily).toBe("documents");
    expect(decision.operatorId).toBe("extract");
  });

  test("applies nav override deterministically", () => {
    const service = new IntentConfigService();
    const decision = service.decide({
      env: "dev",
      language: "en",
      queryText: "open the file",
      candidates: [
        {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          score: 0.9,
        },
      ],
      signals: { navQuery: true },
    });

    expect(decision.intentFamily).toBe("file_actions");
    expect(decision.operatorId).toBe("open");
    expect(decision.requiresClarification).not.toBe(true);
  });
});
