import { describe, expect, jest, test } from "@jest/globals";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import type { IntentDecisionOutput } from "../../services/config/intentConfig.service";
import { writeCertificationGateReport } from "./reporting";

function makeCtx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "user-1",
    messageText: "hello",
    locale: "en",
    now: new Date(),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "user-1",
      message: "hello",
      context: {},
    },
    ...overrides,
  } as TurnContext;
}

function makeDecision(intentFamily: string): IntentDecisionOutput {
  return {
    intentId: intentFamily,
    intentFamily,
    operatorId: "op",
    domainId: "general",
    confidence: 0.8,
    decisionNotes: [],
    persistable: {
      intentId: intentFamily,
      intentFamily,
      operatorId: "op",
      domainId: "general",
      confidence: 0.8,
    },
  };
}

describe("Certification: routing-family-precision", () => {
  test("fallback candidates include calc/navigation/editing/integrations families", () => {
    const routePolicy = { isConnectorTurn: () => false };
    const captured: Array<string[]> = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string }> }) => {
        captured.push(
          input.candidates
            .map((candidate) => String(candidate.intentFamily || ""))
            .filter(Boolean),
        );
        return makeDecision("help");
      }),
    };
    const router = new TurnRouterService(
      routePolicy as any,
      intentConfig as any,
      (() => null) as any,
      (() => null) as any,
    );

    router.decide(makeCtx({ messageText: "calculate total revenue" }));
    router.decide(makeCtx({ messageText: "open budget report" }));
    router.decide(makeCtx({ messageText: "calcular receita total", locale: "pt" as const }));
    router.decide(
      makeCtx({
        messageText: "edit paragraph 2",
        attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      }),
    );
    router.decide(makeCtx({ messageText: "sync gmail inbox now" }));
    router.decide(makeCtx({ messageText: "sincronizar gmail agora", locale: "pt" as const }));

    expect(captured[0]).toContain("calc");
    expect(captured[1]).toContain("navigation");
    expect(captured[2]).toContain("calc");
    expect(captured[3]).toContain("editing");
    expect(captured[4]).toContain("integrations");
    expect(captured[5]).toContain("integrations");
  });

  test("integrations family maps to CONNECTOR route", () => {
    const routePolicy = { isConnectorTurn: () => false };
    const intentConfig = {
      decide: jest.fn(() => makeDecision("integrations")),
    };
    const router = new TurnRouterService(routePolicy as any, intentConfig as any);
    expect(router.decide(makeCtx({ messageText: "sync gmail inbox now" }))).toBe(
      "CONNECTOR",
    );
  });

  test("write certification gate report", () => {
    const failures: string[] = [];
    const routePolicy = { isConnectorTurn: () => false };
    const captured: Array<string[]> = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string }> }) => {
        captured.push(
          input.candidates
            .map((candidate) => String(candidate.intentFamily || ""))
            .filter(Boolean),
        );
        return makeDecision("help");
      }),
    };
    const router = new TurnRouterService(
      routePolicy as any,
      intentConfig as any,
      (() => null) as any,
      (() => null) as any,
    );
    router.decide(makeCtx({ messageText: "calculate total revenue" }));
    router.decide(makeCtx({ messageText: "open budget report" }));
    router.decide(makeCtx({ messageText: "calcular receita total", locale: "pt" as const }));
    router.decide(
      makeCtx({
        messageText: "edit paragraph 2",
        attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      }),
    );
    router.decide(makeCtx({ messageText: "sync gmail inbox now" }));
    router.decide(makeCtx({ messageText: "sincronizar gmail agora", locale: "pt" as const }));

    if (!captured[0]?.includes("calc")) failures.push("MISSING_CALC_FAMILY");
    if (!captured[1]?.includes("navigation")) {
      failures.push("MISSING_NAVIGATION_FAMILY");
    }
    if (!captured[2]?.includes("calc")) failures.push("MISSING_CALC_FAMILY_PT");
    if (!captured[3]?.includes("editing")) failures.push("MISSING_EDITING_FAMILY");
    if (!captured[4]?.includes("integrations")) {
      failures.push("MISSING_INTEGRATIONS_FAMILY");
    }
    if (!captured[5]?.includes("integrations")) {
      failures.push("MISSING_INTEGRATIONS_FAMILY_PT");
    }

    writeCertificationGateReport("routing-family-precision", {
      passed: failures.length === 0,
      metrics: {
        scenarios: 6,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
