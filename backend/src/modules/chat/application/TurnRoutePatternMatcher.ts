import type {
  BankMatch,
  ConnectorDecisionContext,
  Locale,
  RoutingBank,
} from "./turnRoutePolicy.types";
import { TurnRouteProviderResolver } from "./TurnRouteProviderResolver";

function normalizeText(
  input: string,
  opts?: { stripDiacritics?: boolean; collapseWhitespace?: boolean },
): string {
  let value = input;
  if (opts?.stripDiacritics) {
    value = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (opts?.collapseWhitespace) {
    value = value.replace(/\s+/g, " ");
  }
  return value.trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class TurnRoutePatternMatcher {
  constructor(
    private readonly providerResolver = new TurnRouteProviderResolver(),
  ) {}

  resolveBestBankMatch(
    bankId: "connectors_routing" | "email_routing",
    message: string,
    locale: Locale,
    bank: RoutingBank | null,
    context?: ConnectorDecisionContext,
  ): BankMatch | null {
    if (!bank?.config?.enabled) return null;

    const caseSensitive = Boolean(bank.config.matching?.caseSensitive);
    const stripDiacritics = Boolean(
      bank.config.matching?.stripDiacriticsForMatching,
    );
    const collapseWhitespace = Boolean(
      bank.config.matching?.collapseWhitespace,
    );
    const normalized = normalizeText(message, {
      stripDiacritics,
      collapseWhitespace,
    });
    const minConfidence = Math.max(
      0,
      Math.min(1, Number(bank.config?.thresholds?.minConfidence ?? 0.58)),
    );
    const matches: BankMatch[] = [];
    const collectMatches = (
      allowedLocales: Set<string>,
      pass: "strict" | "fallback",
    ) => {
      for (const rule of bank.rules || []) {
        let matched = false;
        let matchedClauseLocale = "any";
        for (const clause of rule.when?.any || []) {
          if (clause.type !== "regex") continue;
          const clauseLocale = String(clause.locale || "any").toLowerCase();
          if (!allowedLocales.has(clauseLocale)) continue;

          for (const pattern of clause.patterns || []) {
            try {
              const regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
              if (regex.test(normalized)) {
                matched = true;
                matchedClauseLocale = clauseLocale;
                break;
              }
            } catch {
              continue;
            }
          }
          if (matched) break;
        }
        if (!matched) continue;
        const operatorId = String(
          rule?.then?.operator || this.defaultOperatorForBank(bankId),
        ).trim();
        if (!operatorId) continue;
        const priority = Number(rule?.priority || 0);
        const confidenceBoost = Number(rule?.confidenceBoost || 0);
        const confidence = Math.max(
          minConfidence,
          Math.min(
            0.99,
            minConfidence + confidenceBoost + Math.max(0, priority) / 1000,
          ),
        );
        const intentFamily = this.normalizeIntentFamily(
          String(rule?.then?.intent || bank?.config?.defaults?.intent || ""),
          bankId,
        );
        if (!intentFamily) continue;
        const domainId =
          String(rule?.then?.domain || bank?.config?.defaults?.domain || "")
            .trim()
            .toLowerCase() ||
          (intentFamily === "email" ? "email" : "connectors");
        const scopeId =
          String(rule?.then?.scope || bank?.config?.defaults?.scope || "")
            .trim()
            .toLowerCase() ||
          (intentFamily === "email" ? "email" : "connectors");
        const providerId = this.providerResolver.resolveProviderForMatch(
          normalized,
          bank,
          operatorId,
          context,
        );
        const requiresConfirmation = this.requiresConfirmation(bank, operatorId);
        matches.push({
          intentId: intentFamily,
          intentFamily,
          operatorId,
          domainId,
          scopeId,
          providerId,
          requiresConfirmation,
          confidence,
          priority,
          decisionNotes: [
            `bank:${bankId}`,
            `rule:${String(rule?.ruleId || "unknown")}`,
            `reason:${String(rule?.reasonCode || "pattern_match")}`,
            ...(pass === "fallback" &&
            matchedClauseLocale !== "any" &&
            matchedClauseLocale !== locale
              ? [`locale_fallback:${matchedClauseLocale}`]
              : []),
            `provider:${providerId || "none"}`,
            ...(requiresConfirmation ? ["requires_confirmation"] : []),
          ],
        });
      }
    };

    collectMatches(new Set(["any", locale]), "strict");
    if (matches.length === 0 && locale !== "en") {
      collectMatches(new Set(["any", "en", "pt", "es"]), "fallback");
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.operatorId.localeCompare(b.operatorId);
    });
    return {
      ...matches[0],
      confidence: clamp01(matches[0].confidence),
    };
  }

  validateRegexPatterns(bankId: string, bank: RoutingBank | null, strict: boolean): void {
    if (!bank) return;
    const caseSensitive = Boolean(bank.config?.matching?.caseSensitive);
    for (const rule of bank.rules || []) {
      for (const clause of rule.when?.any || []) {
        if (clause.type !== "regex") continue;
        for (const pattern of clause.patterns || []) {
          try {
            void new RegExp(pattern, caseSensitive ? "g" : "gi");
          } catch {
            if (strict) {
              throw new Error(
                `[TurnRoutePolicy] Invalid regex in ${bankId}: ${pattern}`,
              );
            }
          }
        }
      }
    }
  }

  private normalizeIntentFamily(
    raw: string,
    bankId: "connectors_routing" | "email_routing",
  ): "connectors" | "email" | null {
    const intent = String(raw || "").trim().toLowerCase();
    if (intent.includes("email")) return "email";
    if (intent.includes("connector")) return "connectors";
    if (bankId === "email_routing") return "email";
    if (bankId === "connectors_routing") return "connectors";
    return null;
  }

  private defaultOperatorForBank(
    bankId: "connectors_routing" | "email_routing",
  ): string {
    return bankId === "connectors_routing"
      ? "CONNECTOR_STATUS"
      : "EMAIL_LATEST";
  }

  private requiresConfirmation(bank: RoutingBank, operatorId: string): boolean {
    const alwaysConfirm = Array.isArray(bank?.operators?.alwaysConfirm)
      ? bank.operators.alwaysConfirm
      : [];
    const wanted = operatorId.trim().toLowerCase();
    return alwaysConfirm.some(
      (operator) => String(operator || "").trim().toLowerCase() === wanted,
    );
  }
}
