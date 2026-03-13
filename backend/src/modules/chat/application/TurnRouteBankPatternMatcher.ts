import type { RouterCandidate } from "../../../services/config/intentConfig.service";
import { asRecord, low, normalizeForMatching } from "./turnRouter.shared";

export class TurnRouteBankPatternMatcher {
  constructor(
    private readonly routingBankProvider: (bankId: string) => unknown | null,
  ) {}

  detectIntentPatternCandidates(
    query: string,
    locale: "en" | "pt" | "es",
    docsAvailable: boolean,
  ): RouterCandidate[] {
    const bank = this.routingBankProvider("intent_patterns") as
      | {
          config?: {
            enabled?: boolean;
            matching?: Record<string, unknown>;
          };
          operators?: Record<string, unknown>;
        }
      | null;
    if (!bank?.config?.enabled) return [];
    const matching = bank.config.matching || {};
    const normalized = normalizeForMatching(query, {
      caseInsensitive: matching.caseSensitive !== true,
      stripDiacritics: matching.stripDiacriticsForMatching !== false,
      collapseWhitespace: matching.collapseWhitespace !== false,
    });
    if (!normalized) return [];

    const operators =
      bank.operators && typeof bank.operators === "object" ? bank.operators : {};
    const out: RouterCandidate[] = [];
    for (const [operatorId, entry] of Object.entries(operators)) {
      if (!entry || typeof entry !== "object" || operatorId.startsWith("_")) {
        continue;
      }
      const operatorRecord = entry as Record<string, unknown>;
      const positives = this.getLocalizedPatterns(
        operatorRecord.patterns || {},
        locale,
      );
      if (positives.length === 0) continue;
      if (!this.regexMatchesAny(normalized, positives)) continue;
      const negatives = this.getLocalizedPatterns(
        operatorRecord.negatives || {},
        locale,
      );
      if (negatives.length > 0 && this.regexMatchesAny(normalized, negatives)) {
        continue;
      }
      const intentFamily = String(operatorRecord.intentFamily || "")
        .trim()
        .toLowerCase();
      if (!intentFamily) continue;
      const minConfidence = Number(
        operatorRecord.minConfidence ?? matching.minConfidenceFallback ?? 0.5,
      );
      const priority = Number(operatorRecord.priority || 0);
      const priorityBoost = Math.max(0, Math.min(0.18, priority / 600));
      const docBoost = docsAvailable && intentFamily === "documents" ? 0.03 : 0;
      const familyBoost = this.getRoutingPriorityBoost(intentFamily);
      const score = Math.max(
        0,
        Math.min(
          1,
          Math.max(0.35, Number.isFinite(minConfidence) ? minConfidence : 0.5) +
            priorityBoost +
            docBoost +
            familyBoost,
        ),
      );
      out.push({
        intentId: this.mapIntentFamilyToIntentId(intentFamily),
        operatorId,
        intentFamily,
        domainId:
          intentFamily === "email"
            ? "email"
            : intentFamily === "connectors"
              ? "connectors"
              : "general",
        score,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  getRoutingPriorityBoost(intentFamily: string): number {
    const bank = this.routingBankProvider("routing_priority") as
      | { intentFamilyBasePriority?: Record<string, unknown> }
      | null;
    const priorities =
      bank?.intentFamilyBasePriority &&
      typeof bank.intentFamilyBasePriority === "object"
        ? bank.intentFamilyBasePriority
        : {};
    const values = Object.values(priorities)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length === 0) return 0;
    const maxPriority = Math.max(...values);
    const familyPriority = Number(priorities[intentFamily] ?? 0);
    if (!Number.isFinite(familyPriority) || familyPriority <= 0) return 0;
    return Math.max(0, Math.min(0.08, (familyPriority / maxPriority) * 0.08));
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

  private mapIntentFamilyToIntentId(intentFamily: string): string {
    const family = low(intentFamily);
    if (
      family === "documents" ||
      family === "file_actions" ||
      family === "doc_stats" ||
      family === "help" ||
      family === "conversation" ||
      family === "error" ||
      family === "connectors" ||
      family === "email" ||
      family === "editing"
    ) {
      return family;
    }
    return "documents";
  }
}
