import { describe, expect, test, jest } from "@jest/globals";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../core/banks/bankLoader.service";
import { AnswerModeRouterService } from "./answerModeRouter.service";

const mockGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("AnswerModeRouterService", () => {
  test("returns action_receipt for prompt tasks", () => {
    mockGetOptionalBank.mockReturnValue(null);
    const svc = new AnswerModeRouterService();
    const out = svc.decide({ promptTask: "tool_call" });
    expect(out.answerMode).toBe("action_receipt");
  });

  test("returns rank_disambiguate when clarification is required", () => {
    mockGetOptionalBank.mockReturnValue(null);
    const svc = new AnswerModeRouterService();
    const out = svc.decide({ needsClarification: true });
    expect(out.answerMode).toBe("rank_disambiguate");
  });

  test("uses operator family hint default mode when available", () => {
    mockGetOptionalBank.mockReturnValue({
      families: [
        {
          id: "email",
          operators: ["EMAIL_EXPLAIN_LATEST"],
          defaultAnswerMode: "action_receipt",
          operatorHints: {
            EMAIL_EXPLAIN_LATEST: { defaultMode: "general_answer" },
          },
        },
      ],
    } as any);
    const svc = new AnswerModeRouterService();
    const out = svc.decide({
      operator: "EMAIL_EXPLAIN_LATEST",
      intentFamily: "email",
    });
    expect(out.answerMode).toBe("general_answer");
  });

  test("falls back to evidence-based doc mode when no explicit routing is set", () => {
    mockGetOptionalBank.mockReturnValue(null);
    const svc = new AnswerModeRouterService();
    const out = svc.decide({ evidenceDocCount: 2 });
    expect(out.answerMode).toBe("doc_grounded_multi");
  });
});
