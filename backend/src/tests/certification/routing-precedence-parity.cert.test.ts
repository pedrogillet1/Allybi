import { describe, expect, test, jest } from "@jest/globals";

import type { TurnContext } from "../../services/chat/chat.types";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { IntentSignals } from "../../services/config/intentConfig.service";
import { ROUTING_PRECEDENCE_CONTRACT } from "../../services/chat/routingPrecedence.contract";
import { writeCertificationGateReport } from "./reporting";

function makeCtx(messageText: string, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "routing-precedence-cert-user",
    messageText,
    locale: "en",
    now: new Date("2026-03-05T00:00:00.000Z"),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "routing-precedence-cert-user",
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

describe("Certification: routing precedence parity", () => {
  test("runtime behavior matches routing precedence contract", () => {
    const failures: string[] = [];

    const captureFollowupSource = (params: {
      ctx: TurnContext;
      bankProvider: (bankId: string) => any | null;
    }): string => {
      let capturedSignals: IntentSignals | undefined;
      const router = new TurnRouterService(
        { isConnectorTurn: () => false },
        {
          decide: (input: { signals?: IntentSignals }) => {
            capturedSignals = input.signals;
            return baseDecision();
          },
        } as any,
        (() => null) as any,
        params.bankProvider,
      );
      router.decideWithIntent(params.ctx);
      return String(capturedSignals?.followupSource || "none");
    };

    const universalPatternBank = {
      config: { enabled: true, matching: {} },
      overlays: {
        followupIndicators: {
          en: ["^(and|also|now|continue)\\b"],
        },
      },
      operators: {},
    };

    const contextSource = captureFollowupSource({
      ctx: makeCtx("and also", {
        request: {
          userId: "routing-precedence-cert-user",
          message: "and also",
          context: {
            signals: {
              isFollowup: false,
              followupConfidence: 0.15,
            },
          },
        },
      }),
      bankProvider: (bankId) => {
        if (bankId === "intent_patterns") return universalPatternBank;
        if (bankId === "followup_indicators") {
          return {
            config: {
              enabled: true,
              actionsContract: { thresholds: { followupScoreMin: 0.65 } },
            },
            rules: [
              {
                id: "continuation_markers",
                triggerPatterns: { en: ["\\b(and|also|now|continue)\\b"] },
                action: { type: "add_followup_score", score: 0.7 },
              },
            ],
          };
        }
        return null;
      },
    });
    if (contextSource !== "context") {
      failures.push(`followup_priority_context_expected_context_got_${contextSource}`);
    }

    const bankSource = captureFollowupSource({
      ctx: makeCtx("and also"),
      bankProvider: (bankId) => {
        if (bankId === "intent_patterns") return universalPatternBank;
        if (bankId === "followup_indicators") {
          return {
            config: {
              enabled: true,
              actionsContract: { thresholds: { followupScoreMin: 0.65 } },
            },
            rules: [
              {
                id: "continuation_markers",
                triggerPatterns: { en: ["\\b(and|also|now|continue)\\b"] },
                action: { type: "add_followup_score", score: 0.7 },
              },
            ],
          };
        }
        return null;
      },
    });
    if (bankSource !== "followup_indicators") {
      failures.push(
        `followup_priority_bank_expected_followup_indicators_got_${bankSource}`,
      );
    }

    const patternSource = captureFollowupSource({
      ctx: makeCtx("and also"),
      bankProvider: (bankId) => {
        if (bankId === "intent_patterns") return universalPatternBank;
        if (bankId === "followup_indicators") {
          return { config: { enabled: false }, rules: [] };
        }
        return null;
      },
    });
    if (patternSource !== "intent_patterns") {
      failures.push(
        `followup_priority_pattern_expected_intent_patterns_got_${patternSource}`,
      );
    }

    const noneSource = captureFollowupSource({
      ctx: makeCtx("hello"),
      bankProvider: (bankId) => {
        if (bankId === "intent_patterns") {
          return {
            config: { enabled: true, matching: {} },
            overlays: { followupIndicators: { en: ["^__never_match__$"] } },
            operators: {},
          };
        }
        if (bankId === "followup_indicators") {
          return { config: { enabled: false }, rules: [] };
        }
        return null;
      },
    });
    if (noneSource !== "none") {
      failures.push(`followup_priority_none_expected_none_got_${noneSource}`);
    }

    const resolveConnectorDecision = jest.fn(() => ({
      intentId: "connectors",
      intentFamily: "connectors",
      operatorId: "CONNECTOR_STATUS",
      domainId: "connectors",
      confidence: 0.9,
      providerId: "gmail",
      requiresConfirmation: false,
      decisionNotes: ["connector:policy"],
    }));
    const isConnectorTurn = jest.fn(() => true);
    const connectorRouter = new TurnRouterService(
      {
        resolveConnectorDecision,
        isConnectorTurn,
      } as any,
      { decide: () => baseDecision() } as any,
    );
    const connectorDecision = connectorRouter.decideWithIntent(
      makeCtx("check gmail status"),
    );
    if (connectorDecision.route !== "CONNECTOR") {
      failures.push(`connector_precedence_expected_CONNECTOR_got_${connectorDecision.route}`);
    }
    if (!connectorDecision.intentDecision) {
      failures.push("connector_precedence_expected_explicit_decision");
    }
    if (isConnectorTurn.mock.calls.length > 0) {
      failures.push("connector_precedence_isConnectorTurn_called_before_resolve");
    }

    const navCalls: string[] = [];
    let navCandidateScore = 0;
    const navRouter = new TurnRouterService(
      { isConnectorTurn: () => false },
      {
        decide: (input: { candidates?: Array<{ intentFamily?: string; score?: number }> }) => {
          const candidate = (input.candidates || []).find(
            (item) => String(item.intentFamily || "") === "file_actions",
          );
          navCandidateScore = Number(candidate?.score || 0);
          return baseDecision();
        },
      } as any,
      (() => null) as any,
      (bankId) => {
        navCalls.push(bankId);
        if (bankId === "intent_patterns") return { config: { enabled: false } };
        if (bankId === "followup_indicators") return { config: { enabled: false } };
        if (bankId === "nav_intents_en") return { config: { enabled: true } };
        return null;
      },
    );
    navRouter.decideWithIntent(
      makeCtx("open the file", {
        locale: "es",
      }),
    );
    const idxLocale = navCalls.indexOf("nav_intents_es");
    const idxEn = navCalls.indexOf("nav_intents_en");
    if (idxLocale < 0 || idxEn < 0 || idxLocale > idxEn) {
      failures.push("nav_fallback_priority_expected_locale_then_en");
    }
    if (!(navCandidateScore > 0.82)) {
      failures.push(`nav_fallback_expected_en_boost_candidate_score_gt_0.82_got_${navCandidateScore}`);
    }

    writeCertificationGateReport("routing-precedence-parity", {
      passed: failures.length === 0,
      metrics: {
        contractVersion: ROUTING_PRECEDENCE_CONTRACT.version,
        followupSourcePriority:
          ROUTING_PRECEDENCE_CONTRACT.followupSourcePriority.join(">"),
        connectorDecisionPriority:
          ROUTING_PRECEDENCE_CONTRACT.connectorDecisionPriority.join(">"),
        navIntentBankFallbackPriority:
          ROUTING_PRECEDENCE_CONTRACT.navIntentBankFallbackPriority.join(">"),
        observedContextSource: contextSource,
        observedBankSource: bankSource,
        observedPatternSource: patternSource,
        observedNoneSource: noneSource,
      },
      thresholds: {
        expectedFollowupPriority:
          "context>followup_indicators>intent_patterns>none",
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
