import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import type { IntentDecisionOutput } from "../../services/config/intentConfig.service";

function makeCtx(
  messageText: string,
  locale: "en" | "pt" | "es" = "en",
): TurnContext {
  return {
    userId: "user-1",
    messageText,
    locale,
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
            patterns: {
              en: ["\\bsummarize\\b"],
              pt: ["\\bresumir\\b"],
              es: ["\\bresumir\\b"],
            },
          },
          open: {
            intentFamily: "navigation",
            priority: 89,
            minConfidence: 0.7,
            patterns: {
              en: ["\\bopen\\b"],
              pt: ["\\babrir\\b"],
              es: ["\\babrir\\b"],
            },
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
  test.each([
    { locale: "en" as const, query: "open the file and summarize it" },
    { locale: "pt" as const, query: "abrir o arquivo e resumir" },
    { locale: "es" as const, query: "abrir el archivo y resumir" },
  ])("signal collision suppresses calc and keeps navigation route ($locale)", ({ locale, query }) => {
    const router = makeRouter();
    const route = router.decide(makeCtx(query, locale));
    expect(route).toBe("KNOWLEDGE");
  });

  test.each([
    { locale: "en" as const, query: "open the file and summarize it" },
    { locale: "pt" as const, query: "abrir o arquivo e resumir" },
    { locale: "es" as const, query: "abrir el archivo y resumir" },
  ])("decision is deterministic across repeated mixed-intent prompts ($locale)", ({ locale, query }) => {
    const router = makeRouter();
    const observed = new Set<string>();
    for (let i = 0; i < 120; i++) {
      observed.add(router.decide(makeCtx(query, locale)));
    }
    expect([...observed]).toEqual(["KNOWLEDGE"]);
  });

  test("write certification gate report", () => {
    const failures: string[] = [];
    const router = makeRouter();

    const localeQueries = [
      { locale: "en" as const, query: "open the file and summarize it" },
      { locale: "pt" as const, query: "abrir o arquivo e resumir" },
      { locale: "es" as const, query: "abrir el archivo y resumir" },
    ];

    let checks = 0;
    for (const probe of localeQueries) {
      const observed = new Set<string>();
      for (let i = 0; i < 120; i++) {
        observed.add(router.decide(makeCtx(probe.query, probe.locale)));
      }
      checks += 1;
      if (!(observed.size === 1 && observed.has("KNOWLEDGE"))) {
        failures.push(`NON_DETERMINISTIC_MIXED_INTENT_ROUTE_${probe.locale}`);
      }
    }

    writeCertificationGateReport("collision-cross-family-tiebreak", {
      passed: failures.length === 0,
      metrics: {
        iterations: 120,
        localeCases: checks,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
