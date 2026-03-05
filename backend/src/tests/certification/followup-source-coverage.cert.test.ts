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
  test("router emits all follow-up sources and meets behavior quality thresholds", () => {
    const covered = new Set<string>();
    const failures: string[] = [];
    let truePositives = 0;
    let trueNegatives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    const runCase = (params: {
      name: string;
      ctx: TurnContext;
      bankProvider: (bankId: string) => any | null;
      expectSource: "context" | "followup_indicators" | "intent_patterns" | "none";
      expectIsFollowup: boolean;
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
      const isFollowup = capturedSignals?.isFollowup === true;
      covered.add(source);
      if (source !== params.expectSource) {
        failures.push(
          `${params.name}:expected_${params.expectSource}:got_${source || "none"}`,
        );
      }
      if (isFollowup && params.expectIsFollowup) truePositives += 1;
      if (!isFollowup && !params.expectIsFollowup) trueNegatives += 1;
      if (isFollowup && !params.expectIsFollowup) {
        falsePositives += 1;
        failures.push(`${params.name}:unexpected_followup_true`);
      }
      if (!isFollowup && params.expectIsFollowup) {
        falseNegatives += 1;
        failures.push(`${params.name}:unexpected_followup_false`);
      }
    };

    runCase({
      name: "context_source",
      expectSource: "context",
      expectIsFollowup: true,
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
      expectIsFollowup: true,
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
      name: "followup_indicators_override_new_turn",
      expectSource: "followup_indicators",
      expectIsFollowup: false,
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
                action: { type: "add_followup_score", score: 0.9 },
              },
              {
                id: "new_turn_override",
                triggerPatterns: { en: ["\\b(and also|also|now|continue)\\b"] },
                action: { type: "set_followup_override", override: "new_turn" },
                reasonCode: "followup_override_new_turn",
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
      expectIsFollowup: true,
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
      expectIsFollowup: false,
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

    runCase({
      name: "none_overlay_missing",
      expectSource: "none",
      expectIsFollowup: false,
      ctx: makeCtx("and also this one"),
      bankProvider: (bankId) => {
        if (bankId === "followup_indicators") {
          return { config: { enabled: false }, rules: [] };
        }
        if (bankId === "intent_patterns") {
          return {
            config: { enabled: true, matching: {} },
            overlays: {
              followupIndicators: {
                en: [],
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
    const precisionDenominator = truePositives + falsePositives;
    const recallDenominator = truePositives + falseNegatives;
    const fprDenominator = falsePositives + trueNegatives;
    const followupPrecision =
      precisionDenominator > 0 ? truePositives / precisionDenominator : 0;
    const followupRecall =
      recallDenominator > 0 ? truePositives / recallDenominator : 0;
    const followupFalsePositiveRate =
      fprDenominator > 0 ? falsePositives / fprDenominator : 0;

    const minFollowupPrecision = 0.9;
    const minFollowupRecall = 0.9;
    const maxFollowupFalsePositiveRate = 0.15;

    if (followupPrecision < minFollowupPrecision) {
      failures.push("followup_precision_below_threshold");
    }
    if (followupRecall < minFollowupRecall) {
      failures.push("followup_recall_below_threshold");
    }
    if (followupFalsePositiveRate > maxFollowupFalsePositiveRate) {
      failures.push("followup_false_positive_rate_above_threshold");
    }

    writeCertificationGateReport("followup-source-coverage", {
      passed: failures.length === 0,
      metrics: {
        coveredSources: Array.from(covered).sort().join(","),
        coveredSourceCount: covered.size,
        expectedSourceCount: expectedSources.length,
        followupTruePositives: truePositives,
        followupTrueNegatives: trueNegatives,
        followupFalsePositives: falsePositives,
        followupFalseNegatives: falseNegatives,
        followupPrecision: Number(followupPrecision.toFixed(4)),
        followupRecall: Number(followupRecall.toFixed(4)),
        followupFalsePositiveRate: Number(followupFalsePositiveRate.toFixed(4)),
      },
      thresholds: {
        expectedSourceCount: expectedSources.length,
        minFollowupPrecision,
        minFollowupRecall,
        maxFollowupFalsePositiveRate,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
