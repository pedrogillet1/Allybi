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

    const makeIndicatorsBank = (params: {
      enabled?: boolean;
      score?: number;
      threshold?: number;
      overrideNewTurn?: boolean;
      requirePriorTurn?: boolean;
      requireExplicitDocRef?: boolean;
      pattern?: string;
    }) => {
      if (params.enabled === false) {
        return { config: { enabled: false }, rules: [] };
      }
      const whenAll: Array<{ path: string; op: string; value: unknown }> = [];
      if (params.requirePriorTurn) {
        whenAll.push({ path: "signals.hasPriorTurn", op: "eq", value: true });
      }
      if (params.requireExplicitDocRef) {
        whenAll.push({ path: "signals.explicitDocRef", op: "eq", value: true });
      }
      const pattern = params.pattern || "\\b(and also|also|now|continue|next|then)\\b";
      const rules: Array<Record<string, unknown>> = [
        {
          id: "continuation_markers",
          triggerPatterns: { en: [pattern] },
          ...(whenAll.length > 0 ? { when: { all: whenAll } } : {}),
          action: { type: "add_followup_score", score: params.score ?? 0.7 },
          reasonCode: "followup_continuation_marker",
        },
      ];
      if (params.overrideNewTurn) {
        rules.push({
          id: "new_turn_override",
          triggerPatterns: { en: [pattern] },
          action: { type: "set_followup_override", override: "new_turn" },
          reasonCode: "followup_override_new_turn",
        });
      }
      return {
        config: {
          enabled: true,
          actionsContract: { thresholds: { followupScoreMin: params.threshold ?? 0.65 } },
        },
        rules,
      };
    };

    const makePatternBank = (params: {
      enabled?: boolean;
      en?: string[];
      pt?: string[];
      es?: string[];
    }) => {
      if (params.enabled === false) {
        return { config: { enabled: false }, overlays: {}, operators: {} };
      }
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
            en: params.en ?? ["^(and|also|now|then)\\b"],
            pt: params.pt ?? ["^(e tambem|tambem|agora|entao)\\b"],
            es: params.es ?? ["^(y tambien|tambien|ahora|entonces)\\b"],
          },
        },
        operators: {},
      };
    };

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

    const cases: Array<{
      name: string;
      expectSource: "context" | "followup_indicators" | "intent_patterns" | "none";
      expectIsFollowup: boolean;
      ctx: TurnContext;
      bankProvider: (bankId: string) => any | null;
    }> = [
      {
        name: "context_true_priority",
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
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ score: 0.8 });
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
      {
        name: "context_false_priority",
        expectSource: "context",
        expectIsFollowup: false,
        ctx: makeCtx("and also the margin", {
          request: {
            userId: "followup-cert-user",
            message: "and also the margin",
            context: {
              signals: {
                isFollowup: false,
                followupConfidence: 0.12,
              },
            },
          },
        }),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ score: 0.9 });
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
      {
        name: "followup_indicators_requires_prior_turn_positive",
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
        }),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") {
            return makeIndicatorsBank({
              requirePriorTurn: true,
              score: 0.8,
            });
          }
          if (bankId === "intent_patterns") return makePatternBank({ enabled: false });
          return null;
        },
      },
      {
        name: "followup_indicators_requires_prior_turn_negative",
        expectSource: "followup_indicators",
        expectIsFollowup: false,
        ctx: makeCtx("and also the margin"),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") {
            return makeIndicatorsBank({
              requirePriorTurn: true,
              score: 0.8,
            });
          }
          if (bankId === "intent_patterns") return makePatternBank({ enabled: false });
          return null;
        },
      },
      {
        name: "followup_indicators_requires_explicit_docref_positive",
        expectSource: "followup_indicators",
        expectIsFollowup: true,
        ctx: makeCtx("and also summarize contract.pdf"),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") {
            return makeIndicatorsBank({
              requireExplicitDocRef: true,
              score: 0.8,
            });
          }
          if (bankId === "intent_patterns") return makePatternBank({ enabled: false });
          return null;
        },
      },
      {
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
            return makeIndicatorsBank({
              score: 0.9,
              overrideNewTurn: true,
            });
          }
          if (bankId === "intent_patterns") return makePatternBank({ enabled: false });
          return null;
        },
      },
      {
        name: "followup_indicators_below_threshold",
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
            return makeIndicatorsBank({
              score: 0.5,
              threshold: 0.65,
            });
          }
          if (bankId === "intent_patterns") return makePatternBank({ enabled: false });
          return null;
        },
      },
      {
        name: "intent_patterns_source_en",
        expectSource: "intent_patterns",
        expectIsFollowup: true,
        ctx: makeCtx("and also"),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ enabled: false });
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
      {
        name: "intent_patterns_source_pt",
        expectSource: "intent_patterns",
        expectIsFollowup: true,
        ctx: makeCtx("e tambem", { locale: "pt" }),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ enabled: false });
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
      {
        name: "intent_patterns_source_es",
        expectSource: "intent_patterns",
        expectIsFollowup: true,
        ctx: makeCtx("y tambien", { locale: "es" }),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ enabled: false });
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
      {
        name: "none_source_nonmatch_overlay",
        expectSource: "none",
        expectIsFollowup: false,
        ctx: makeCtx("hello there"),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ enabled: false });
          if (bankId === "intent_patterns") {
            return makePatternBank({
              en: ["^__never_match__$"],
              pt: ["^__never_match__$"],
              es: ["^__never_match__$"],
            });
          }
          return null;
        },
      },
      {
        name: "none_source_overlay_missing",
        expectSource: "none",
        expectIsFollowup: false,
        ctx: makeCtx("and also this one"),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ enabled: false });
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
      },
      {
        name: "none_source_all_detectors_disabled",
        expectSource: "none",
        expectIsFollowup: false,
        ctx: makeCtx("new request unrelated"),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ enabled: false });
          if (bankId === "intent_patterns") return makePatternBank({ enabled: false });
          return null;
        },
      },
      {
        name: "bank_priority_over_patterns",
        expectSource: "followup_indicators",
        expectIsFollowup: true,
        ctx: makeCtx("and also"),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ score: 0.8 });
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
      {
        name: "context_priority_over_bank_new_turn_override",
        expectSource: "context",
        expectIsFollowup: true,
        ctx: makeCtx("and also", {
          request: {
            userId: "followup-cert-user",
            message: "and also",
            context: {
              signals: {
                isFollowup: true,
                followupConfidence: 0.95,
              },
            },
          },
        }),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") {
            return makeIndicatorsBank({
              score: 0.95,
              overrideNewTurn: true,
            });
          }
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
      {
        name: "context_priority_false_over_bank_positive",
        expectSource: "context",
        expectIsFollowup: false,
        ctx: makeCtx("and also", {
          request: {
            userId: "followup-cert-user",
            message: "and also",
            context: {
              signals: {
                isFollowup: false,
                followupConfidence: 0.22,
              },
            },
          },
        }),
        bankProvider: (bankId) => {
          if (bankId === "followup_indicators") return makeIndicatorsBank({ score: 0.9 });
          if (bankId === "intent_patterns") return makePatternBank({});
          return null;
        },
      },
    ];

    for (const testCase of cases) {
      runCase(testCase);
    }

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
    const minCaseCount = 14;

    if (followupPrecision < minFollowupPrecision) {
      failures.push("followup_precision_below_threshold");
    }
    if (followupRecall < minFollowupRecall) {
      failures.push("followup_recall_below_threshold");
    }
    if (followupFalsePositiveRate > maxFollowupFalsePositiveRate) {
      failures.push("followup_false_positive_rate_above_threshold");
    }
    if (cases.length < minCaseCount) {
      failures.push("followup_case_count_below_threshold");
    }

    writeCertificationGateReport("followup-source-coverage", {
      passed: failures.length === 0,
      metrics: {
        caseCount: cases.length,
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
        minCaseCount,
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
