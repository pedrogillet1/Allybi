import { describe, expect, test, jest } from "@jest/globals";

import type { TurnContext } from "../../services/chat/chat.types";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { IntentSignals } from "../../services/config/intentConfig.service";
import { writeCertificationGateReport } from "./reporting";

function makeCtx(messageText: string, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "followup-cert-user",
    messageText,
    locale: "en",
    now: new Date("2026-03-05T00:00:00.000Z"),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "followup-cert-user",
      message: messageText,
      context: {},
    },
    ...overrides,
  };
}

function baseDecision() {
  return {
    intentId: "documents",
    intentFamily: "documents",
    operatorId: "extract",
    domainId: "general",
    confidence: 0.8,
    decisionNotes: [],
    persistable: {
      intentId: "documents",
      intentFamily: "documents",
      operatorId: "extract",
      domainId: "general",
      confidence: 0.8,
    },
  };
}

describe("Certification: follow-up source coverage", () => {
  test("router emits all follow-up sources (context, bank, pattern, none)", () => {
    const covered = new Set<string>();
    const failures: string[] = [];

    const runCase = (params: {
      name: string;
      ctx: TurnContext;
      bankProvider: (bankId: string) => any | null;
      expectSource: "context" | "followup_indicators" | "intent_patterns" | "none";
    }) => {
      let capturedSignals: IntentSignals | undefined;
      const intentConfig = {
        decide: jest.fn((input: { signals?: IntentSignals }) => {
          capturedSignals = input.signals;
          return baseDecision();
        }),
      };
      const router = new TurnRouterService(
        { isConnectorTurn: () => false },
        intentConfig as any,
        (() => null) as any,
        params.bankProvider,
      );

      router.decideWithIntent(params.ctx);
      const source = String(capturedSignals?.followupSource || "none");
      covered.add(source);
      if (source !== params.expectSource) {
        failures.push(
          `${params.name}:expected_${params.expectSource}:got_${source || "none"}`,
        );
      }
    };

    runCase({
      name: "context_source",
      expectSource: "context",
      ctx: makeCtx("and also the margin", {
        request: {
          userId: "followup-cert-user",
          message: "and also the margin",
          context: {
            signals: {
              isFollowup: true,
              followupConfidence: 0.92,
            },
          },
        },
      }),
      bankProvider: () => null,
    });

    runCase({
      name: "followup_indicators_source",
      expectSource: "followup_indicators",
      ctx: makeCtx("and also the margin", {
        request: {
          userId: "followup-cert-user",
          message: "and also the margin",
          context: {
            intentState: {
              lastRoutingDecision: { intentFamily: "documents" },
            },
          },
        },
        attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      }),
      bankProvider: (bankId) => {
        if (bankId === "followup_indicators") {
          return {
            config: {
              enabled: true,
              actionsContract: { thresholds: { followupScoreMin: 0.65 } },
            },
            rules: [
              {
                id: "continuation_markers",
                triggerPatterns: { en: ["\\b(and also|also|now|continue)\\b"] },
                action: { type: "add_followup_score", score: 0.7 },
                reasonCode: "followup_continuation_marker",
              },
            ],
          };
        }
        return null;
      },
    });

    runCase({
      name: "intent_patterns_source",
      expectSource: "intent_patterns",
      ctx: makeCtx("and also"),
      bankProvider: (bankId) => {
        if (bankId === "followup_indicators") {
          return { config: { enabled: false }, rules: [] };
        }
        if (bankId === "intent_patterns") {
          return {
            config: {
              enabled: true,
              matching: {
                caseSensitive: false,
                stripDiacriticsForMatching: true,
                collapseWhitespace: true,
              },
            },
            overlays: {
              followupIndicators: {
                en: ["^(and|also|now|then)\\b"],
              },
            },
            operators: {},
          };
        }
        return null;
      },
    });

    runCase({
      name: "none_source",
      expectSource: "none",
      ctx: makeCtx("hello there"),
      bankProvider: (bankId) => {
        if (bankId === "followup_indicators") {
          return { config: { enabled: false }, rules: [] };
        }
        if (bankId === "intent_patterns") {
          return {
            config: { enabled: true, matching: {} },
            overlays: {
              followupIndicators: {
                en: ["^__never_match__$"],
              },
            },
            operators: {},
          };
        }
        return null;
      },
    });

    const expectedSources = [
      "context",
      "followup_indicators",
      "intent_patterns",
      "none",
    ];
    for (const source of expectedSources) {
      if (!covered.has(source)) failures.push(`missing_source:${source}`);
    }

    writeCertificationGateReport("followup-source-coverage", {
      passed: failures.length === 0,
      metrics: {
        coveredSources: Array.from(covered).sort().join(","),
        coveredSourceCount: covered.size,
        expectedSourceCount: expectedSources.length,
      },
      thresholds: {
        expectedSourceCount: expectedSources.length,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
