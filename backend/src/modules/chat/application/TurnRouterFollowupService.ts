import type { TurnContext } from "../domain/chat.types";
import type { FollowupDetectionResult } from "./turnRouter.shared";
import {
  getContextSignals,
  getPersistedIntentState,
  normalizeForMatching,
} from "./turnRouter.shared";
import { logger } from "../../../utils/logger";

let followupMisconfigWarned = false;

export class TurnRouterFollowupService {
  constructor(
    private readonly routingBankProvider: (bankId: string) => any | null,
  ) {}

  detectFollowupSignal(
    ctx: TurnContext,
    query: string,
    hasExplicitDocRef: boolean,
  ): FollowupDetectionResult {
    const contextSignals = getContextSignals(ctx);
    if (typeof contextSignals.isFollowup === "boolean") {
      return {
        isFollowup: contextSignals.isFollowup,
        confidence:
          typeof contextSignals.followupConfidence === "number"
            ? contextSignals.followupConfidence
            : null,
        source: "context",
        reasonCodes: [],
      };
    }
    const fromBank = this.detectFollowupFromIndicatorsBank(
      ctx,
      query,
      ctx.locale,
      hasExplicitDocRef,
    );
    if (fromBank.source !== "none") return fromBank;
    return this.detectFollowupFromPatterns(query, ctx.locale);
  }

  private getLocalizedPatterns(
    value: unknown,
    locale: "en" | "pt" | "es",
  ): string[] {
    if (!value || typeof value !== "object") return [];
    const obj = value as Record<string, unknown>;
    return [
      ...(Array.isArray(obj[locale]) ? (obj[locale] as unknown[]) : []),
      ...(Array.isArray(obj.any) ? obj.any : []),
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  private regexMatchesAny(
    text: string,
    patterns: string[],
    opts?: { caseSensitive?: boolean },
  ): boolean {
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, opts?.caseSensitive ? "g" : "gi");
        if (regex.test(text)) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private evaluateFollowupWhenClause(
    clause: Array<{ path?: string; op?: string; value?: unknown }> | undefined,
    runtimeSignals: Record<string, unknown>,
  ): boolean {
    if (!Array.isArray(clause) || clause.length === 0) return true;
    for (const condition of clause) {
      const path = String(condition?.path || "").trim();
      const op = String(condition?.op || "")
        .trim()
        .toLowerCase();
      if (!path.startsWith("signals.")) return false;
      const key = path.slice("signals.".length);
      const current = runtimeSignals[key];
      const expected = condition?.value;
      if (op === "eq") {
        if (current !== expected) return false;
        continue;
      }
      if (op === "neq") {
        if (current === expected) return false;
        continue;
      }
      return false;
    }
    return true;
  }

  private detectFollowupFromPatterns(
    query: string,
    locale: "en" | "pt" | "es",
  ): FollowupDetectionResult {
    const bank = this.routingBankProvider("intent_patterns");
    const matching = bank?.config?.matching || {};
    const normalized = normalizeForMatching(query, {
      caseInsensitive: matching.caseSensitive !== true,
      stripDiacritics: matching.stripDiacriticsForMatching !== false,
      collapseWhitespace: matching.collapseWhitespace !== false,
    });
    if (!normalized) {
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }
    const overlayPatterns = this.getLocalizedPatterns(
      bank?.overlays?.followupIndicators || {},
      locale,
    );
    if (overlayPatterns.length === 0) {
      if (!followupMisconfigWarned) {
        followupMisconfigWarned = true;
        logger.warn(
          "[turn-router] followup detection disabled: overlayPatterns is empty for locale",
          {
            locale,
          },
        );
      }
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }
    const matched = this.regexMatchesAny(normalized, overlayPatterns);
    return {
      isFollowup: matched,
      confidence: matched ? 0.64 : null,
      source: matched ? "intent_patterns" : "none",
      reasonCodes: matched ? ["followup_overlay_pattern"] : [],
    };
  }

  private detectFollowupFromIndicatorsBank(
    ctx: TurnContext,
    query: string,
    locale: "en" | "pt" | "es",
    hasExplicitDocRef: boolean,
  ): FollowupDetectionResult {
    const bank = this.routingBankProvider("followup_indicators");
    if (!bank?.config?.enabled) {
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }
    const normalized = normalizeForMatching(query, {
      caseInsensitive: true,
      stripDiacritics: true,
      collapseWhitespace: true,
    });
    if (!normalized) {
      return {
        isFollowup: false,
        confidence: null,
        source: "none",
        reasonCodes: [],
      };
    }

    const contextSignals = getContextSignals(ctx);
    const runtimeSignals: Record<string, unknown> = {
      hasActiveDoc: Boolean(ctx.activeDocument || ctx.viewer?.documentId),
      explicitDocRef:
        contextSignals.explicitDocRef === true || hasExplicitDocRef,
      hasPriorTurn: Boolean(
        getPersistedIntentState(ctx)?.lastRoutingDecision ||
          contextSignals.hasPriorTurn === true,
      ),
    };

    let score = 0;
    let overrideNewTurn = false;
    const reasonCodes: string[] = [];
    for (const rule of Array.isArray(bank?.rules) ? bank.rules : []) {
      const patterns = this.getLocalizedPatterns(
        rule?.triggerPatterns || {},
        locale,
      );
      if (patterns.length === 0) continue;
      if (!this.regexMatchesAny(normalized, patterns)) continue;
      const whenAll = Array.isArray(rule?.when?.all) ? rule.when.all : [];
      if (!this.evaluateFollowupWhenClause(whenAll, runtimeSignals)) continue;
      const actionType = String(rule?.action?.type || "").trim();
      if (actionType === "add_followup_score") {
        score += Number(rule?.action?.score || 0);
        reasonCodes.push(String(rule?.reasonCode || "followup_rule_match"));
      } else if (actionType === "set_followup_override") {
        if (String(rule?.action?.override || "").trim() === "new_turn") {
          overrideNewTurn = true;
          reasonCodes.push(String(rule?.reasonCode || "followup_override"));
        }
      }
    }

    const minScore = Number(
      bank?.config?.actionsContract?.thresholds?.followupScoreMin ?? 0.65,
    );
    const capped = Math.max(0, Math.min(1, score));
    const isFollowup = !overrideNewTurn && capped >= minScore;
    return {
      isFollowup,
      confidence: capped > 0 ? capped : null,
      source: "followup_indicators",
      reasonCodes,
    };
  }
}
