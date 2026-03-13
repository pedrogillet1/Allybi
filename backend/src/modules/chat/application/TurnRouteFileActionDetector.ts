import type { FileActionDetectionResult } from "./turnRouter.shared";
import { asRecord, normalizeForMatching } from "./turnRouter.shared";
import type { FileActionBankProvider } from "./turnRouterCandidate.types";

export class TurnRouteFileActionDetector {
  constructor(
    private readonly fileActionBankProvider: FileActionBankProvider,
    private readonly routingBankProvider: (bankId: string) => unknown | null,
  ) {}

  detectFileAction(query: string): FileActionDetectionResult {
    const bank = this.getFileActionBank() as
      | {
          config?: { operatorDetection?: Record<string, unknown> };
          detectionRules?: unknown[];
        }
      | null;
    const detection = bank?.config?.operatorDetection as
      | Record<string, unknown>
      | undefined;
    if (!bank || !detection?.enabled) return { kind: "none" };

    const normalized = normalizeForMatching(query, {
      caseInsensitive: detection.caseInsensitive !== false,
      stripDiacritics: detection.stripDiacritics !== false,
      collapseWhitespace: detection.collapseWhitespace !== false,
    });
    if (!normalized) return { kind: "none" };

    const isCaseSensitive = detection.caseInsensitive === false;
    const regexOpts = { caseSensitive: isCaseSensitive };
    const matchesAny = (patterns: string[]): boolean =>
      this.regexMatchesAny(normalized, patterns, regexOpts);

    const mustNotContain = this.getPatterns(
      (detection.guards as Record<string, unknown> | undefined)?.mustNotContain,
    );
    if (matchesAny(mustNotContain)) return { kind: "suppressed" };

    const mustNotMatchWholeMessage = this.getPatterns(
      (detection.guards as Record<string, unknown> | undefined)
        ?.mustNotMatchWholeMessage,
    );
    if (matchesAny(mustNotMatchWholeMessage)) return { kind: "suppressed" };

    const minConfidence = Number(detection.minConfidence || 0.55);
    const maxCandidates = Math.max(
      1,
      Number(detection.maxCandidatesPerMessage || 3),
    );
    const rules = Array.isArray(bank?.detectionRules) ? bank.detectionRules : [];
    const matches: Array<{
      operator: string;
      confidence: number;
      priority: number;
    }> = [];

    for (const rule of rules) {
      const ruleRecord = asRecord(rule);
      const operator = String(ruleRecord.operator || "")
        .trim()
        .toLowerCase();
      if (!operator) continue;

      const patterns = this.getPatterns(ruleRecord.patterns || {});
      if (patterns.length === 0 || !matchesAny(patterns)) continue;

      const ruleMustContain = this.getPatterns(ruleRecord.mustContain || {});
      if (ruleMustContain.length > 0 && !matchesAny(ruleMustContain)) continue;

      const ruleMustNotContain = this.getPatterns(ruleRecord.mustNotContain || {});
      if (matchesAny(ruleMustNotContain)) continue;

      const confidence = Math.max(
        minConfidence,
        Number(ruleRecord.confidence || minConfidence),
      );
      const priority = Number(ruleRecord.priority || 0);
      matches.push({ operator, confidence, priority });
    }

    if (matches.length === 0) return { kind: "none" };
    matches.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.operator.localeCompare(b.operator);
    });

    for (const candidate of matches.slice(0, maxCandidates)) {
      if (candidate.confidence < minConfidence) continue;
      if (this.isSuppressedByCollisionMatrix(normalized, candidate.operator, regexOpts)) {
        continue;
      }
      return {
        kind: "matched",
        operatorId: candidate.operator,
        confidence: candidate.confidence,
      };
    }
    return { kind: "suppressed" };
  }

  private getFileActionBank(): unknown | null {
    try {
      if (typeof this.fileActionBankProvider === "function") {
        return this.fileActionBankProvider("file_action_operators");
      }
      return this.fileActionBankProvider.getFileActionOperators();
    } catch {
      return null;
    }
  }

  private getPatterns(value: unknown): string[] {
    if (!value || typeof value !== "object") return [];
    const obj = value as Record<string, unknown>;
    return [
      ...(Array.isArray(obj.en) ? obj.en : []),
      ...(Array.isArray(obj.pt) ? obj.pt : []),
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

  private isSuppressedByCollisionMatrix(
    normalized: string,
    operator: string,
    regexOpts?: { caseSensitive?: boolean },
  ): boolean {
    const collisionBank = this.routingBankProvider("operator_collision_matrix") as
      | { config?: { enabled?: boolean }; rules?: unknown[] }
      | null;
    const collisionEnabled = collisionBank?.config?.enabled !== false;
    const collisionRules = Array.isArray(collisionBank?.rules)
      ? collisionBank.rules
      : [];
    if (!collisionEnabled || collisionRules.length === 0) return false;
    for (const rule of collisionRules) {
      const when = asRecord(asRecord(rule).when);
      const operators = Array.isArray(when.operators)
        ? when.operators.map((value: unknown) =>
            String(value || "").trim().toLowerCase(),
          )
        : [];
      if (operators.length > 0 && !operators.includes(operator)) continue;
      const patterns = this.getPatterns(when.queryRegexAny || {});
      if (patterns.length === 0) continue;
      if (this.regexMatchesAny(normalized, patterns, regexOpts)) return true;
    }
    return false;
  }
}
