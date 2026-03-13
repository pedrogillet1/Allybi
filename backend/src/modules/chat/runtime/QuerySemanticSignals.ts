import { RuntimePolicyError } from "./runtimePolicyError";
import { asObject } from "./chatMemoryShared";
import type {
  MemoryRuntimeConfigProvider,
  SemanticSignalKey,
} from "./chatMemory.types";

export class QuerySemanticSignals {
  constructor(private readonly configProvider: MemoryRuntimeConfigProvider) {}

  collectSemanticSignals(
    queryText: string,
    contextSignals: Record<string, unknown>,
  ): Record<SemanticSignalKey, boolean> {
    const keys: SemanticSignalKey[] = [
      "hasQuotedText",
      "hasFilename",
      "userAskedForTable",
      "userAskedForQuote",
      "sheetHintPresent",
      "rangeExplicit",
      "timeConstraintsPresent",
      "explicitYearOrQuarterComparison",
      "tableExpected",
    ];
    const out = {} as Record<SemanticSignalKey, boolean>;
    for (const key of keys) {
      out[key] = contextSignals[key] === true || this.detectSemanticSignal(key, queryText);
    }
    return out;
  }

  extractQueryKeywords(queryText: string): string[] {
    const cfg = this.configProvider.getMemoryRuntimeTuning();
    const stopWords = new Set([
      ...(Array.isArray(cfg.queryStopWords?.any) ? cfg.queryStopWords.any : []),
      ...(Array.isArray(cfg.queryStopWords?.pt) ? cfg.queryStopWords.pt : []),
      ...(Array.isArray(cfg.queryStopWords?.es) ? cfg.queryStopWords.es : []),
    ]);
    return String(queryText || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(
        (term) =>
          term.length >= cfg.queryKeywordMinLength && !stopWords.has(term),
      )
      .slice(0, cfg.queryKeywordMaxTerms);
  }

  private resolveSemanticSignalRegexFlags(): string {
    const flags = String(
      this.configProvider.getMemoryRuntimeTuning().semanticSignals?.regexFlags || "",
    ).trim();
    if (!flags) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticSignals.regexFlags is required",
      );
    }
    return flags;
  }

  private resolveSemanticSignalPatterns(signal: SemanticSignalKey): string[] {
    const patterns =
      this.configProvider.getMemoryRuntimeTuning().semanticSignals?.patterns?.[signal];
    if (!Array.isArray(patterns) || patterns.length === 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        `memory_policy.config.runtimeTuning.semanticSignals.patterns.${signal} is required`,
      );
    }
    return patterns;
  }

  private detectSemanticSignal(
    signal: SemanticSignalKey,
    text: string,
  ): boolean {
    const input = String(text || "");
    if (!input.trim()) return false;
    const flags = this.resolveSemanticSignalRegexFlags();
    const patterns = this.resolveSemanticSignalPatterns(signal);
    return patterns.some((pattern) => {
      try {
        return new RegExp(pattern, flags).test(input);
      } catch {
        throw new RuntimePolicyError(
          "RUNTIME_POLICY_INVALID",
          `Invalid regex in memory_policy semanticSignals for ${signal}: ${pattern}`,
        );
      }
    });
  }
}
