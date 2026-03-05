import { describe, expect, test } from "@jest/globals";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import {
  ScopeGateService,
  type ConversationStateLike,
  type DocMeta,
} from "../../services/core/scope/scopeGate.service";
import { writeCertificationGateReport } from "./reporting";

function makeCtx(
  overrides: Partial<TurnContext> = {},
  locale: "en" | "pt" | "es" = "en",
): TurnContext {
  return {
    locale,
    messageText: "summarize this contract",
    request: { context: {} } as any,
    attachedDocuments: [{ id: "doc-a", mime: "application/pdf" }],
    ...overrides,
  } as TurnContext;
}

function makeState(overrides?: Partial<ConversationStateLike>): ConversationStateLike {
  return {
    session: { env: "dev", userLanguage: "en" },
    persistent: {
      scope: {
        activeDocId: "doc-a",
        hardDocLock: true,
        hardSheetLock: false,
      },
    },
    history: { recentReasonCodes: [] },
    ephemeral: { turn: { turnId: 1 } },
    ...(overrides || {}),
  } as ConversationStateLike;
}

function createScopeService() {
  const docs: DocMeta[] = [
    { docId: "doc-a", filename: "ContractA.pdf", title: "Contract A" },
    { docId: "doc-b", filename: "ContractB.pdf", title: "Contract B" },
  ];
  const bankLoader = {
    getBank: (bankId: string): any => {
      if (bankId === "scope_hints") {
        return {
          config: { actionsContract: { thresholds: { minHintConfidence: 0.75 } } },
        };
      }
      if (bankId === "scope_resolution") {
        return {
          config: {
            enabled: true,
            policy: { preferExplicitDocRefOverState: true },
          },
          resolution: {
            apply_explicit_doc_refs: { enabled: true },
            apply_user_choice: { enabled: true },
            apply_hard_locked_doc: { enabled: true },
            apply_followup_active_doc: { enabled: true },
          },
        };
      }
      return {};
    },
  };
  const docStore = {
    listDocs: async () => docs,
    getDocMeta: async () => null,
  };
  return new ScopeGateService(
    bankLoader as any,
    docStore as any,
    {
      getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.75 } }),
      getDocAliasPhrases: () => [],
      getDocTaxonomy: () => ({ typeDefinitions: [] }),
    } as any,
  );
}

describe("Certification: routing-determinism-runtime-e2e", () => {
  const ITERATIONS = 25;

  test("TurnRouterService decideWithIntent is stable across repeated calls", () => {
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    } as any);

    const scenarios: Array<{ name: string; ctx: TurnContext }> = [
      { name: "en-doc-query", ctx: makeCtx({ messageText: "extract all dates" }, "en") },
      { name: "pt-doc-query", ctx: makeCtx({ messageText: "extrair todas as datas" }, "pt") },
      { name: "es-nav-query", ctx: makeCtx({ messageText: "open budget report" }, "es") },
      {
        name: "connector-query",
        ctx: makeCtx({ messageText: "connect my gmail account", attachedDocuments: [] }, "en"),
      },
    ];

    for (const scenario of scenarios) {
      const baseline = router.decideWithIntent(scenario.ctx);
      const baselineJson = JSON.stringify(baseline);
      for (let i = 0; i < ITERATIONS; i += 1) {
        const next = router.decideWithIntent(scenario.ctx);
        expect(JSON.stringify(next)).toBe(baselineJson);
      }
    }
  });

  test("ScopeGateService evaluate is stable across repeated calls", async () => {
    const scope = createScopeService();
    const state = makeState();
    const input = {
      query: "compare section 1 and section 2",
      env: "dev" as const,
      signals: { intentFamily: "documents", operator: "compare" },
    };

    const baseline = await scope.evaluate(state, input);
    const baselineJson = JSON.stringify(baseline);
    for (let i = 0; i < ITERATIONS; i += 1) {
      const next = await scope.evaluate(state, input);
      expect(JSON.stringify(next)).toBe(baselineJson);
    }
  });

  test("write certification gate report", async () => {
    const failures: string[] = [];
    let assertions = 0;
    const router = new TurnRouterService({ isConnectorTurn: () => false } as any);

    const routerCases: TurnContext[] = [
      makeCtx({ messageText: "quote section 4 verbatim" }, "en"),
      makeCtx({ messageText: "citar a seção 4 literalmente" }, "pt"),
      makeCtx({ messageText: "locate file budget report" }, "es"),
    ];

    for (const ctx of routerCases) {
      const baseline = JSON.stringify(router.decideWithIntent(ctx));
      for (let i = 0; i < ITERATIONS; i += 1) {
        const next = JSON.stringify(router.decideWithIntent(ctx));
        assertions += 1;
        if (next !== baseline) {
          failures.push(`ROUTER_NON_DETERMINISTIC_${ctx.locale}_${i}`);
          break;
        }
      }
    }

    const scope = createScopeService();
    const scopeState = makeState();
    const scopeInputs = [
      {
        query: "show me FY2025 revenue in millions",
        env: "dev" as const,
        signals: { intentFamily: "documents", operator: "compute" },
      },
      {
        query: "go to section 3",
        env: "dev" as const,
        signals: { intentFamily: "documents", operator: "locate_content" },
      },
    ];

    for (const input of scopeInputs) {
      const baseline = JSON.stringify(await scope.evaluate(scopeState, input));
      for (let i = 0; i < ITERATIONS; i += 1) {
        const next = JSON.stringify(await scope.evaluate(scopeState, input));
        assertions += 1;
        if (next !== baseline) {
          failures.push(`SCOPE_NON_DETERMINISTIC_${input.query.slice(0, 16)}_${i}`);
          break;
        }
      }
    }

    writeCertificationGateReport("routing-determinism-runtime-e2e", {
      passed: failures.length === 0,
      metrics: {
        iterations: ITERATIONS,
        routerCaseCount: routerCases.length,
        scopeCaseCount: scopeInputs.length,
        totalAssertions: assertions,
      },
      thresholds: {
        minIterations: 25,
        minAssertions: 100,
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
