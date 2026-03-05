import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import { writeCertificationGateReport } from "./reporting";

const FIRST_CLASS_FAMILIES = [
  "documents",
  "editing",
  "calc",
  "navigation",
  "integrations",
] as const;

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

function makeCtx(messageText: string, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "routing-family-conformance-user",
    messageText,
    locale: "en",
    now: new Date("2026-03-05T00:00:00.000Z"),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "routing-family-conformance-user",
      message: messageText,
      context: {},
      meta: {},
    },
    ...overrides,
  };
}

function makeDecision(intentFamily: string) {
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

describe("Certification: routing-family-conformance", () => {
  test("first-class families are declared in intent_config and intent_patterns", () => {
    const intentConfig = readJson("routing/intent_config.any.json");
    const intentPatterns = readJson("routing/intent_patterns.any.json");

    const configFamilies = new Set(
      (Array.isArray(intentConfig?.intentFamilies) ? intentConfig.intentFamilies : [])
        .map((entry: any) => String(entry?.id || "").trim()),
    );
    const patternFamilies = new Set(
      Object.keys(
        intentPatterns?.intentFamilies &&
          typeof intentPatterns.intentFamilies === "object"
          ? intentPatterns.intentFamilies
          : {},
      ).map((entry) => String(entry || "").trim()),
    );

    for (const familyId of FIRST_CLASS_FAMILIES) {
      expect(configFamilies.has(familyId)).toBe(true);
      expect(patternFamilies.has(familyId)).toBe(true);
    }
  });

  test("runtime emits first-class family candidates for representative scenarios", () => {
    const observedFamilies = new Map<string, Set<string>>();
    const intentConfig = {
      decide: (input: { candidates: Array<{ intentFamily?: string }> }) => {
        const families = new Set(
          input.candidates.map((candidate) => String(candidate.intentFamily || "")),
        );
        const key = String((input as any).__scenarioKey || "");
        if (key) observedFamilies.set(key, families);
        const top = String(input.candidates[0]?.intentFamily || "help");
        return makeDecision(top);
      },
    };

    const routingBankProvider = (bankId: string) => {
      if (bankId === "intent_patterns") {
        return { config: { enabled: false } };
      }
      if (bankId === "nav_intents_en") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "NAV_CONFORMANCE_PROBE",
              en: ["locate file budget report from current context"],
              pt: ["localizar arquivo relatorio de orcamento no contexto atual"],
              negatives: [],
            },
          ],
        };
      }
      if (bankId === "nav_intents_pt") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "NAV_CONFORMANCE_PROBE_PT",
              en: ["locate file budget report from current context"],
              pt: ["localizar arquivo relatorio de orcamento no contexto atual"],
              negatives: [],
            },
          ],
        };
      }
      if (bankId === "connect_intents_en") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "INTEGRATION_CONFORMANCE_PROBE",
              en: ["mailbox heartbeat probe"],
              pt: ["conectar gmail agora"],
              negatives: [],
            },
          ],
        };
      }
      if (bankId === "connect_intents_pt") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "INTEGRATION_CONFORMANCE_PROBE_PT",
              en: ["mailbox heartbeat probe"],
              pt: ["conectar gmail agora"],
              negatives: [],
            },
          ],
        };
      }
      return null;
    };

    const router = new TurnRouterService(
      { isConnectorTurn: () => false } as any,
      {
        decide: (input: { candidates: Array<{ intentFamily?: string }> }) =>
          intentConfig.decide(input),
      } as any,
      (() => null) as any,
      routingBankProvider as any,
    );

    const scenarios: Array<{
      id: string;
      expectedFamily: string;
      ctx: TurnContext;
    }> = [
      {
        id: "documents",
        expectedFamily: "documents",
        ctx: makeCtx("where in the document is clause 4?", {
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "editing",
        expectedFamily: "editing",
        ctx: makeCtx("edit paragraph 2", {
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "calc",
        expectedFamily: "calc",
        ctx: makeCtx("calculate total revenue for q3"),
      },
      {
        id: "navigation",
        expectedFamily: "navigation",
        ctx: makeCtx("locate file budget report from current context"),
      },
      {
        id: "integrations",
        expectedFamily: "integrations",
        ctx: makeCtx("mailbox heartbeat probe"),
      },
      {
        id: "documents_pt",
        expectedFamily: "documents",
        ctx: makeCtx("onde no documento esta a clausula 4?", {
          locale: "pt",
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "editing_pt",
        expectedFamily: "editing",
        ctx: makeCtx("editar paragrafo 2", {
          locale: "pt",
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "calc_pt",
        expectedFamily: "calc",
        ctx: makeCtx("calcular receita total do q3", { locale: "pt" }),
      },
      {
        id: "navigation_pt",
        expectedFamily: "navigation",
        ctx: makeCtx("localizar arquivo relatorio de orcamento no contexto atual", {
          locale: "pt",
        }),
      },
      {
        id: "integrations_pt",
        expectedFamily: "integrations",
        ctx: makeCtx("conectar gmail agora", { locale: "pt" }),
      },
    ];

    for (const scenario of scenarios) {
      const ctx = {
        ...scenario.ctx,
        request: {
          ...scenario.ctx.request,
          context: {
            ...(scenario.ctx.request?.context || {}),
            __scenarioKey: scenario.id,
          },
        },
      } as TurnContext;
      const proxyIntentConfig = {
        decide: (input: { candidates: Array<{ intentFamily?: string }> }) => {
          return intentConfig.decide({
            ...input,
            __scenarioKey: scenario.id,
          } as any);
        },
      };
      const scenarioRouter = new TurnRouterService(
        { isConnectorTurn: () => false } as any,
        proxyIntentConfig as any,
        (() => null) as any,
        routingBankProvider as any,
      );
      scenarioRouter.decide(ctx);
      const families = observedFamilies.get(scenario.id) || new Set<string>();
      expect(families.has(scenario.expectedFamily)).toBe(true);
    }

    router.decide(makeCtx("hello"));
  });

  test("write certification gate report", () => {
    const failures: string[] = [];
    const intentConfig = readJson("routing/intent_config.any.json");
    const intentPatterns = readJson("routing/intent_patterns.any.json");
    const configFamilies = new Set(
      (Array.isArray(intentConfig?.intentFamilies) ? intentConfig.intentFamilies : [])
        .map((entry: any) => String(entry?.id || "").trim()),
    );
    const patternFamilies = new Set(
      Object.keys(
        intentPatterns?.intentFamilies &&
          typeof intentPatterns.intentFamilies === "object"
          ? intentPatterns.intentFamilies
          : {},
      ).map((entry) => String(entry || "").trim()),
    );
    for (const familyId of FIRST_CLASS_FAMILIES) {
      if (!configFamilies.has(familyId)) failures.push(`MISSING_CONFIG_FAMILY_${familyId}`);
      if (!patternFamilies.has(familyId)) failures.push(`MISSING_PATTERN_FAMILY_${familyId}`);
    }

    const scenarioFamilies = new Map<string, Set<string>>();
    const routingBankProvider = (bankId: string) => {
      if (bankId === "intent_patterns") return { config: { enabled: false } };
      if (bankId === "nav_intents_en") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "NAV_CONFORMANCE_PROBE",
              en: ["locate file budget report from current context"],
              pt: ["localizar arquivo relatorio de orcamento no contexto atual"],
              negatives: [],
            },
          ],
        };
      }
      if (bankId === "nav_intents_pt") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "NAV_CONFORMANCE_PROBE_PT",
              en: ["locate file budget report from current context"],
              pt: ["localizar arquivo relatorio de orcamento no contexto atual"],
              negatives: [],
            },
          ],
        };
      }
      if (bankId === "connect_intents_en") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "INTEGRATION_CONFORMANCE_PROBE",
              en: ["mailbox heartbeat probe"],
              pt: ["conectar gmail agora"],
              negatives: [],
            },
          ],
        };
      }
      if (bankId === "connect_intents_pt") {
        return {
          config: {
            enabled: true,
            deterministic: true,
            matching: {
              caseInsensitive: true,
              stripDiacritics: true,
              collapseWhitespace: true,
            },
          },
          patterns: [
            {
              id: "INTEGRATION_CONFORMANCE_PROBE_PT",
              en: ["mailbox heartbeat probe"],
              pt: ["conectar gmail agora"],
              negatives: [],
            },
          ],
        };
      }
      return null;
    };

    const scenarios: Array<{ id: string; expectedFamily: string; ctx: TurnContext }> = [
      {
        id: "documents",
        expectedFamily: "documents",
        ctx: makeCtx("where in the document is clause 4?", {
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "editing",
        expectedFamily: "editing",
        ctx: makeCtx("edit paragraph 2", {
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "calc",
        expectedFamily: "calc",
        ctx: makeCtx("calculate total revenue for q3"),
      },
      {
        id: "navigation",
        expectedFamily: "navigation",
        ctx: makeCtx("locate file budget report from current context"),
      },
      {
        id: "integrations",
        expectedFamily: "integrations",
        ctx: makeCtx("mailbox heartbeat probe"),
      },
      {
        id: "documents_pt",
        expectedFamily: "documents",
        ctx: makeCtx("onde no documento esta a clausula 4?", {
          locale: "pt",
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "editing_pt",
        expectedFamily: "editing",
        ctx: makeCtx("editar paragrafo 2", {
          locale: "pt",
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "calc_pt",
        expectedFamily: "calc",
        ctx: makeCtx("calcular receita total do q3", { locale: "pt" }),
      },
      {
        id: "navigation_pt",
        expectedFamily: "navigation",
        ctx: makeCtx("localizar arquivo relatorio de orcamento no contexto atual", {
          locale: "pt",
        }),
      },
      {
        id: "integrations_pt",
        expectedFamily: "integrations",
        ctx: makeCtx("conectar gmail agora", { locale: "pt" }),
      },
    ];

    for (const scenario of scenarios) {
      const localIntentConfig = {
        decide: (input: { candidates: Array<{ intentFamily?: string }> }) => {
          scenarioFamilies.set(
            scenario.id,
            new Set(input.candidates.map((candidate) => String(candidate.intentFamily || ""))),
          );
          const top = String(input.candidates[0]?.intentFamily || "help");
          return makeDecision(top);
        },
      };
      const router = new TurnRouterService(
        { isConnectorTurn: () => false } as any,
        localIntentConfig as any,
        (() => null) as any,
        routingBankProvider as any,
      );
      router.decide(scenario.ctx);
      const families = scenarioFamilies.get(scenario.id) || new Set<string>();
      if (!families.has(scenario.expectedFamily)) {
        failures.push(`SCENARIO_MISSING_FAMILY_${scenario.id}_${scenario.expectedFamily}`);
      }
    }

    writeCertificationGateReport("routing-family-conformance", {
      passed: failures.length === 0,
      metrics: {
        firstClassFamilies: FIRST_CLASS_FAMILIES.length,
        scenarios: scenarios.length,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
