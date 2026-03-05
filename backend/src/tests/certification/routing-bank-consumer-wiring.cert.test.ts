import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import type { IntentDecisionOutput } from "../../services/config/intentConfig.service";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

function listSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        if (/\.test\./.test(entry.name)) continue;
        out.push(full);
      }
    }
  }
  return out;
}

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
      meta: {},
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

function buildIntegrationPatternBank(locale: "en" | "pt"): any {
  const localePattern =
    locale === "pt" ? String.raw`\bsincronizar\b` : String.raw`\bsync\b`;
  return {
    config: {
      enabled: true,
      matching: {
        caseInsensitive: true,
        stripDiacritics: true,
        collapseWhitespace: true,
      },
    },
    patterns: [
      {
        id: `bank_pattern_${locale}`,
        [locale]: [localePattern],
        negatives: [],
      },
    ],
  };
}

describe("Certification: routing-bank-consumer-wiring", () => {
  const manifest = readJson("manifest/bank_registry.any.json");
  const runtimeRoots = [
    path.resolve(__dirname, "../../services"),
    path.resolve(__dirname, "../../modules"),
  ];
  const runtimeFiles = runtimeRoots.flatMap((root) => listSourceFiles(root));
  const runtimeSources = runtimeFiles.map((file) =>
    fs.readFileSync(file, "utf8"),
  );

  const REQUIRED_BANK_IDS = [
    "connect_intents_en",
    "connect_intents_pt",
    "search_intents_en",
    "search_intents_pt",
    "send_intents_en",
    "send_intents_pt",
    "sync_intents_en",
    "sync_intents_pt",
  ] as const;

  test("required integration intent banks exist in registry", () => {
    const ids = new Set(
      (Array.isArray(manifest?.banks) ? manifest.banks : [])
        .map((entry: any) => String(entry?.id || "").trim())
        .filter(Boolean),
    );
    for (const bankId of REQUIRED_BANK_IDS) {
      expect(ids.has(bankId)).toBe(true);
    }
  });

  test("required integration intent banks have runtime consumer markers", () => {
    for (const bankId of REQUIRED_BANK_IDS) {
      const hasConsumer = runtimeSources.some((src) => src.includes(bankId));
      expect(hasConsumer).toBe(true);
    }
  });

  test("viewer_assistant_routing is executable in viewer mode", () => {
    const routePolicy = { isConnectorTurn: () => false };
    const intentConfig = {
      decide: () => makeDecision("help"),
    };
    const router = new TurnRouterService(
      routePolicy as any,
      intentConfig as any,
      (() => null) as any,
      ((bankId: string) => {
        if (bankId !== "viewer_assistant_routing") return null;
        return {
          config: { enabled: true },
          rules: [
            {
              id: "viewer_intent_qa_locked_forces_qa_path",
              priority: 100,
              when: { "meta.viewerIntent": "qa_locked" },
              then: { path: "qa" },
            },
          ],
        };
      }) as any,
    );

    const route = router.decide(
      makeCtx({
        viewer: { mode: true } as any,
        locale: "en",
        messageText: "what does this page say?",
        request: {
          userId: "user-1",
          message: "what does this page say?",
          context: {},
          meta: { viewerIntent: "qa_locked" },
        },
      }),
    );
    expect(route).toBe("KNOWLEDGE");
  });

  test.each([
    {
      bankId: "connect_intents_en",
      locale: "en" as const,
      query: "sync gmail inbox now",
    },
    {
      bankId: "search_intents_en",
      locale: "en" as const,
      query: "sync gmail inbox now",
    },
    {
      bankId: "send_intents_en",
      locale: "en" as const,
      query: "sync gmail inbox now",
    },
    {
      bankId: "sync_intents_en",
      locale: "en" as const,
      query: "sync gmail inbox now",
    },
    {
      bankId: "connect_intents_pt",
      locale: "pt" as const,
      query: "sincronizar gmail agora",
    },
    {
      bankId: "search_intents_pt",
      locale: "pt" as const,
      query: "sincronizar gmail agora",
    },
    {
      bankId: "send_intents_pt",
      locale: "pt" as const,
      query: "sincronizar gmail agora",
    },
    {
      bankId: "sync_intents_pt",
      locale: "pt" as const,
      query: "sincronizar gmail agora",
    },
  ])(
    "runtime executes integration routing via $bankId",
    ({ bankId, locale, query }) => {
      const routePolicy = { isConnectorTurn: () => false };
      const intentConfig = {
        decide: (input: { candidates: Array<{ intentFamily?: string }> }) => {
          const hasIntegration = input.candidates.some(
            (candidate) => String(candidate.intentFamily || "") === "integrations",
          );
          return hasIntegration ? makeDecision("integrations") : makeDecision("help");
        },
      };
      const router = new TurnRouterService(
        routePolicy as any,
        intentConfig as any,
        (() => null) as any,
        ((requestedBankId: string) => {
          if (requestedBankId === bankId) {
            return buildIntegrationPatternBank(locale);
          }
          return null;
        }) as any,
      );

      const route = router.decide(
        makeCtx({
          messageText: query,
          locale,
          request: {
            userId: "user-1",
            message: query,
            context: {},
            meta: {},
          },
        }),
      );
      expect(route).toBe("CONNECTOR");
    },
  );

  test("write certification gate report", () => {
    const failures: string[] = [];
    const ids = new Set(
      (Array.isArray(manifest?.banks) ? manifest.banks : [])
        .map((entry: any) => String(entry?.id || "").trim())
        .filter(Boolean),
    );
    for (const bankId of REQUIRED_BANK_IDS) {
      if (!ids.has(bankId)) failures.push(`MISSING_REGISTRY_ENTRY_${bankId}`);
      const hasConsumer = runtimeSources.some((src) => src.includes(bankId));
      if (!hasConsumer) failures.push(`MISSING_RUNTIME_CONSUMER_${bankId}`);
    }

    // Executable probe: viewer bank influences runtime route in viewer mode.
    const viewerRouter = new TurnRouterService(
      { isConnectorTurn: () => false } as any,
      { decide: () => makeDecision("help") } as any,
      (() => null) as any,
      ((bankId: string) => {
        if (bankId !== "viewer_assistant_routing") return null;
        return {
          config: { enabled: true },
          rules: [
            {
              id: "viewer_intent_qa_locked_forces_qa_path",
              priority: 100,
              when: { "meta.viewerIntent": "qa_locked" },
              then: { path: "qa" },
            },
          ],
        };
      }) as any,
    );
    const viewerRoute = viewerRouter.decide(
      makeCtx({
        viewer: { mode: true } as any,
        locale: "en",
        messageText: "what does this page say?",
        request: {
          userId: "user-1",
          message: "what does this page say?",
          context: {},
          meta: { viewerIntent: "qa_locked" },
        },
      }),
    );
    if (viewerRoute !== "KNOWLEDGE") failures.push("VIEWER_BANK_NOT_EXECUTABLE");

    // Executable probe: each required integration bank can trigger integration routing.
    for (const probe of [
      {
        bankId: "connect_intents_en",
        locale: "en" as const,
        query: "sync gmail inbox now",
      },
      {
        bankId: "search_intents_en",
        locale: "en" as const,
        query: "sync gmail inbox now",
      },
      {
        bankId: "send_intents_en",
        locale: "en" as const,
        query: "sync gmail inbox now",
      },
      {
        bankId: "sync_intents_en",
        locale: "en" as const,
        query: "sync gmail inbox now",
      },
      {
        bankId: "connect_intents_pt",
        locale: "pt" as const,
        query: "sincronizar gmail agora",
      },
      {
        bankId: "search_intents_pt",
        locale: "pt" as const,
        query: "sincronizar gmail agora",
      },
      {
        bankId: "send_intents_pt",
        locale: "pt" as const,
        query: "sincronizar gmail agora",
      },
      {
        bankId: "sync_intents_pt",
        locale: "pt" as const,
        query: "sincronizar gmail agora",
      },
    ]) {
      const router = new TurnRouterService(
        { isConnectorTurn: () => false } as any,
        {
          decide: (input: { candidates: Array<{ intentFamily?: string }> }) => {
            const hasIntegration = input.candidates.some(
              (candidate) => String(candidate.intentFamily || "") === "integrations",
            );
            return hasIntegration ? makeDecision("integrations") : makeDecision("help");
          },
        } as any,
        (() => null) as any,
        ((bankId: string) => {
          if (bankId === probe.bankId) return buildIntegrationPatternBank(probe.locale);
          return null;
        }) as any,
      );
      const route = router.decide(
        makeCtx({
          messageText: probe.query,
          locale: probe.locale,
          request: {
            userId: "user-1",
            message: probe.query,
            context: {},
            meta: {},
          },
        }),
      );
      if (route !== "CONNECTOR") {
        failures.push(`BANK_NOT_EXECUTABLE_${probe.bankId}`);
      }
    }

    writeCertificationGateReport("routing-bank-consumer-wiring", {
      passed: failures.length === 0,
      metrics: {
        requiredBanks: REQUIRED_BANK_IDS.length,
        runtimeFilesScanned: runtimeFiles.length,
        executableChecks: 1 + REQUIRED_BANK_IDS.length,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
