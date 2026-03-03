import { describe, expect, jest, test } from "@jest/globals";
import { TurnRouterService } from "../services/chat/turnRouter.service";
import type { TurnContext } from "../services/chat/chat.types";

function makeContext(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "user-1",
    messageText: "move report to archive",
    locale: "en",
    now: new Date(),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "user-1",
      message: "move report to archive",
    },
    ...overrides,
  };
}

function makeDecisionPayload(intentFamily: string, operatorId: string) {
  return {
    intentId: intentFamily,
    intentFamily,
    operatorId,
    domainId: "general",
    confidence: 0.78,
    decisionNotes: [],
    persistable: {
      intentId: intentFamily,
      intentFamily,
      operatorId,
      domainId: "general",
      confidence: 0.78,
    },
  };
}

function makeFileActionBank(detectionRules: unknown[]) {
  return {
    config: {
      operatorDetection: {
        enabled: true,
        useRegex: true,
        caseInsensitive: true,
        stripDiacritics: true,
        collapseWhitespace: true,
        minConfidence: 0.55,
        maxCandidatesPerMessage: 3,
        guards: {
          mustNotContain: {
            en: ["^\\s*hello\\s*$"],
            pt: ["^\\s*olá\\s*$"],
          },
        },
      },
    },
    detectionRules,
  };
}

describe("patternWiringProof", () => {
  test("file_action_operators bank mutations alter routing outcome", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<boolean, []>().mockReturnValue(false),
    };

    const decisions: Array<{ candidates: Array<{ intentFamily?: string }> }> = [];
    const intentConfig = {
      decide: jest.fn<
        (input: { candidates: Array<{ intentFamily?: string }> }) => any
      >((input) => {
        decisions.push({ candidates: input.candidates || [] });
        const hasFileActions = input.candidates.some(
          (c) => c.intentFamily === "file_actions",
        );
        return hasFileActions
          ? makeDecisionPayload("file_actions", "open")
          : makeDecisionPayload("help", "capabilities");
      }),
    };

    const baselineRouter = new TurnRouterService(
      routePolicy as any,
      intentConfig as any,
      ((bankId: string) =>
        bankId === "file_action_operators"
          ? makeFileActionBank([])
          : null) as any,
      () => null,
    );
    const baselineRoute = baselineRouter.decide(makeContext());

    expect(baselineRoute).toBe("GENERAL");
    expect(
      (decisions.at(-1)?.candidates || []).some(
        (c) => c.intentFamily === "file_actions",
      ),
    ).toBe(false);

    decisions.length = 0;
    const routerWithRule = new TurnRouterService(
      routePolicy as any,
      intentConfig as any,
      ((bankId: string) =>
        bankId === "file_action_operators"
          ? makeFileActionBank([
              {
                id: "FA_0001",
                operator: "open",
                priority: 80,
                confidence: 0.82,
                patterns: {
                  en: ["\\bmove\\b.*\\barchive\\b"],
                  pt: ["\\bmover\\b.*\\barquivo\\b"],
                },
              },
            ])
          : null) as any,
      () => null,
    );
    const routedWithRule = routerWithRule.decide(makeContext());

    expect(routedWithRule).toBe("KNOWLEDGE");
    expect(
      (decisions.at(-1)?.candidates || []).some(
        (c) => c.intentFamily === "file_actions",
      ),
    ).toBe(true);
    expect(baselineRoute).not.toBe(routedWithRule);
    expect(intentConfig.decide).toHaveBeenCalled();
  });
});
