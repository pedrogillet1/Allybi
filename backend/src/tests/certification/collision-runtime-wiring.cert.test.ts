import { describe, expect, jest, test } from "@jest/globals";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import type { IntentDecisionOutput } from "../../services/config/intentConfig.service";
import { writeCertificationGateReport } from "./reporting";

function makeCtx(messageText: string): TurnContext {
  return {
    userId: "user-1",
    messageText,
    locale: "en",
    now: new Date(),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "user-1",
      message: messageText,
      context: {},
    },
  } as TurnContext;
}

function makeDecision(intentFamily: string): IntentDecisionOutput {
  return {
    intentId: intentFamily,
    intentFamily,
    operatorId: "capabilities",
    domainId: "general",
    confidence: 0.8,
    decisionNotes: [],
    persistable: {
      intentId: intentFamily,
      intentFamily,
      operatorId: "capabilities",
      domainId: "general",
      confidence: 0.8,
    },
  };
}

describe("Certification: collision-runtime-wiring", () => {
  test("signal-only collision rule suppresses runtime candidate", () => {
    const routePolicy = { isConnectorTurn: () => false };
    let capturedCandidates: Array<{ intentFamily?: string; operatorId?: string }> = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string; operatorId?: string }> }) => {
        capturedCandidates = input.candidates;
        return makeDecision("help");
      }),
    };
    const routingBankProvider = (bankId: string) => {
      if (bankId === "intent_patterns") {
        return {
          config: { enabled: true, matching: { minConfidenceFallback: 0.5 } },
          operators: {
            compute: {
              intentFamily: "calc",
              priority: 90,
              minConfidence: 0.7,
              patterns: { en: ["\\bsummarize\\b"] },
            },
          },
        };
      }
      if (bankId === "operator_collision_matrix") {
        return {
          config: { enabled: true },
          rules: [
            {
              id: "CM_SIGNAL_ONLY",
              when: {
                operators: ["compute"],
                signals: ["summarize"],
              },
            },
          ],
        };
      }
      return null;
    };

    const router = new TurnRouterService(
      routePolicy as any,
      intentConfig as any,
      (() => null) as any,
      routingBankProvider as any,
    );
    router.decide(makeCtx("summarize this dataset"));

    const hasSuppressedFamily = capturedCandidates.some(
      (candidate) => candidate.intentFamily === "calc",
    );
    expect(hasSuppressedFamily).toBe(false);
  });

  test("write certification gate report", () => {
    const failures: string[] = [];
    const routePolicy = { isConnectorTurn: () => false };
    let capturedCandidates: Array<{ intentFamily?: string; operatorId?: string }> = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string; operatorId?: string }> }) => {
        capturedCandidates = input.candidates;
        return makeDecision("help");
      }),
    };
    const routingBankProvider = (bankId: string) => {
      if (bankId === "intent_patterns") {
        return {
          config: { enabled: true, matching: { minConfidenceFallback: 0.5 } },
          operators: {
            compute: {
              intentFamily: "calc",
              priority: 90,
              minConfidence: 0.7,
              patterns: { en: ["\\bsummarize\\b"] },
            },
          },
        };
      }
      if (bankId === "operator_collision_matrix") {
        return {
          config: { enabled: true },
          rules: [
            {
              id: "CM_SIGNAL_ONLY",
              when: {
                operators: ["compute"],
                signals: ["summarize"],
              },
            },
          ],
        };
      }
      return null;
    };

    const router = new TurnRouterService(
      routePolicy as any,
      intentConfig as any,
      (() => null) as any,
      routingBankProvider as any,
    );
    router.decide(makeCtx("summarize this dataset"));
    if (capturedCandidates.some((candidate) => candidate.intentFamily === "calc")) {
      failures.push("SIGNAL_COLLISION_NOT_APPLIED");
    }

    writeCertificationGateReport("collision-runtime-wiring", {
      passed: failures.length === 0,
      metrics: {
        candidateCount: capturedCandidates.length,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
