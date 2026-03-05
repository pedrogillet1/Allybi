import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import type { IntentDecisionOutput } from "../../services/config/intentConfig.service";

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
      meta: {},
    },
  } as TurnContext;
}

function makeDecision(intentFamily: string): IntentDecisionOutput {
  return {
    intentId: intentFamily,
    intentFamily,
    operatorId: intentFamily === "navigation" ? "open" : "compute",
    domainId: "general",
    confidence: 0.8,
    decisionNotes: [],
    persistable: {
      intentId: intentFamily,
      intentFamily,
      operatorId: intentFamily === "navigation" ? "open" : "compute",
      domainId: "general",
      confidence: 0.8,
    },
  };
}

function makeRouter(): TurnRouterService {
  const routePolicy = { isConnectorTurn: () => false };
  const intentConfig = {
    decide: (input: { candidates: Array<{ intentFamily?: string; score?: number }> }) => {
      const sorted = [...input.candidates].sort(
        (a, b) => Number(b.score || 0) - Number(a.score || 0),
      );
      const topFamily = String(sorted[0]?.intentFamily || "help");
      if (topFamily === "navigation") return makeDecision("navigation");
      if (topFamily === "calc") return makeDecision("calc");
      return makeDecision("help");
    },
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
          open: {
            intentFamily: "navigation",
            priority: 89,
            minConfidence: 0.7,
            patterns: { en: ["\\bopen\\b"] },
          },
        },
      };
    }
    if (bankId === "operator_collision_matrix") {
      return {
        config: { enabled: true },
        rules: [
          {
            id: "CM_SIGNAL_SUPPRESS_COMPUTE_ON_SUMMARIZE",
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
  return new TurnRouterService(
    routePolicy as any,
    intentConfig as any,
    (() => null) as any,
    routingBankProvider as any,
  );
}

describe("Certification: collision-cross-family-tiebreak", () => {
  test("signal collision suppresses calc and keeps navigation route", () => {
    const router = makeRouter();
    const route = router.decide(makeCtx("open the file and summarize it"));
    expect(route).toBe("KNOWLEDGE");
  });

  test("decision is deterministic across repeated mixed-intent prompts", () => {
    const router = makeRouter();
    const observed = new Set<string>();
    for (let i = 0; i < 120; i++) {
      observed.add(router.decide(makeCtx("open the file and summarize it")));
    }
    expect([...observed]).toEqual(["KNOWLEDGE"]);
  });

  test("write certification gate report", () => {
    const failures: string[] = [];
    const router = makeRouter();

    const observed = new Set<string>();
    for (let i = 0; i < 120; i++) {
      observed.add(router.decide(makeCtx("open the file and summarize it")));
    }
    if (!(observed.size === 1 && observed.has("KNOWLEDGE"))) {
      failures.push("NON_DETERMINISTIC_MIXED_INTENT_ROUTE");
    }

    writeCertificationGateReport("collision-cross-family-tiebreak", {
      passed: failures.length === 0,
      metrics: {
        iterations: 120,
        uniqueRoutes: observed.size,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
