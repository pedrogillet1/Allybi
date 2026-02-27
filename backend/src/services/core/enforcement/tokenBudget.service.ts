import { getOptionalBank } from "../banks/bankLoader.service";

export type BudgetComplexity = "low" | "medium" | "high";

export interface OutputTokenBudgetInput {
  answerMode?: string | null;
  outputLanguage?: string | null;
  routeStage?: "draft" | "final" | string | null;
  operator?: string | null;
  userText?: string | null;
  evidenceItems?: number | null;
  hasTables?: boolean;
  requestedOverride?: number | null;
}

export interface OutputTokenBudgetResult {
  maxOutputTokens: number;
  softOutputTokens: number;
  hardOutputTokens: number;
  complexity: BudgetComplexity;
}

export interface TokenTrimOptions {
  preserveSentenceBoundary?: boolean;
  suffix?: string;
  minimumChars?: number;
}

export interface TokenTrimResult {
  text: string;
  truncated: boolean;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  method: "none" | "tokenizer" | "heuristic";
}

type TokenizerRuntime = {
  encode: (input: string) => number[];
  decode: (input: number[]) => string;
};

let tokenizerRuntime: TokenizerRuntime | null | undefined;
let modeMaxBankCache: Record<string, number> | null | undefined;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, min), max);
}

function toPositiveNumber(input: unknown): number | null {
  const num = Number(input);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function readModeMaxFromBank(answerMode: string): number | null {
  if (modeMaxBankCache === undefined) {
    modeMaxBankCache = null;
    try {
      const bank = getOptionalBank<any>("truncation_and_limits");
      const rawLimits = bank?.answerModeLimits;
      if (rawLimits && typeof rawLimits === "object") {
        const next: Record<string, number> = {};
        for (const [mode, value] of Object.entries(
          rawLimits as Record<string, unknown>,
        )) {
          const asObject =
            value && typeof value === "object"
              ? (value as Record<string, unknown>)
              : null;
          if (!asObject) continue;
          const tokenLimit =
            toPositiveNumber(asObject.maxOutputTokens) ??
            toPositiveNumber(asObject.maxOutputTokensDefault) ??
            toPositiveNumber(asObject.maxTokens) ??
            toPositiveNumber(asObject.maxTokensDefault);
          if (tokenLimit) next[String(mode)] = Math.round(tokenLimit);
        }
        modeMaxBankCache = next;
      }
    } catch {
      // Bank loader may not be initialized in narrow unit tests.
      modeMaxBankCache = null;
    }
  }

  if (!modeMaxBankCache) return null;
  const value = modeMaxBankCache[answerMode];
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readTokenizerRuntime(): TokenizerRuntime | null {
  if (tokenizerRuntime !== undefined) return tokenizerRuntime;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("gpt-tokenizer") as {
      encode?: (input: string) => number[];
      decode?: (input: number[]) => string;
    };
    if (
      typeof loaded.encode === "function" &&
      typeof loaded.decode === "function"
    ) {
      tokenizerRuntime = {
        encode: loaded.encode,
        decode: loaded.decode,
      };
      return tokenizerRuntime;
    }
  } catch {
    // Fallback to heuristic estimator.
  }
  tokenizerRuntime = null;
  return tokenizerRuntime;
}

function resolveModeMin(answerMode: string): number {
  if (answerMode === "nav_pills") return 80;
  if (answerMode === "rank_disambiguate") return 120;
  if (answerMode === "doc_grounded_quote") return 320;
  if (answerMode === "no_docs" || answerMode === "refusal") return 140;
  return 220;
}

function resolveModeMax(answerMode: string): number {
  const bankModeMax = readModeMaxFromBank(answerMode);
  if (bankModeMax) return bankModeMax;

  if (answerMode === "nav_pills") return 220;
  if (answerMode === "rank_disambiguate") return 260;
  if (answerMode === "doc_grounded_table") return 4000;
  if (answerMode === "doc_grounded_multi") return 3400;
  if (answerMode === "doc_grounded_single") return 3200;
  if (answerMode === "doc_grounded_quote") return 1200;
  if (answerMode === "help_steps") return 1600;
  if (answerMode === "no_docs" || answerMode === "refusal") return 320;
  return 3400;
}

function resolveBaseBudget(
  answerMode: string,
  routeStage: "draft" | "final",
): number {
  if (answerMode === "nav_pills") return 180;
  if (answerMode === "rank_disambiguate") return 220;
  if (answerMode === "doc_grounded_table")
    return routeStage === "final" ? 4000 : 2400;
  if (answerMode === "doc_grounded_multi") return 3000;
  if (answerMode === "doc_grounded_single") return 2800;
  if (answerMode === "doc_grounded_quote") return 900;
  if (answerMode === "help_steps") return 1200;
  if (answerMode === "no_docs") return 280;
  if (answerMode === "refusal") return 220;
  return routeStage === "final" ? 2200 : 1600;
}

function detectComplexity(params: {
  answerMode: string;
  operator?: string | null;
  userText: string;
  evidenceItems: number;
  hasTables: boolean;
}): BudgetComplexity {
  let score = 0;
  const words = params.userText
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;

  if (words >= 18) score += 1;
  if (words >= 40) score += 1;

  if (params.evidenceItems >= 6) score += 1;
  if (params.evidenceItems >= 12) score += 1;

  if (params.hasTables) score += 2;
  if (params.answerMode === "doc_grounded_multi") score += 1;
  if (params.answerMode === "doc_grounded_table") score += 1;

  if (params.operator === "quote") score += 1;
  if (params.operator === "locate_docs") score -= 1;

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function applyComplexityBoost(
  base: number,
  complexity: BudgetComplexity,
): number {
  if (complexity === "high") return base + 260;
  if (complexity === "medium") return base + 120;
  return base;
}

function applyLanguageMultiplier(
  tokens: number,
  language?: string | null,
): number {
  const normalized = String(language || "")
    .trim()
    .toLowerCase();
  if (normalized === "pt" || normalized === "es") {
    return Math.round(tokens * 1.15);
  }
  return tokens;
}

function trimAtBoundary(
  text: string,
  preserveSentenceBoundary: boolean,
  minimumChars: number,
): string {
  const value = text.trim();
  if (!value) return "";

  if (preserveSentenceBoundary) {
    const sentence = /[.!?](?=\s|$)|\n/g;
    let sentenceCut = -1;
    let match = sentence.exec(value);
    while (match) {
      sentenceCut = match.index;
      match = sentence.exec(value);
    }
    if (sentenceCut >= minimumChars) {
      return value.slice(0, sentenceCut + 1).trim();
    }
  }

  const fallback = /[;,:](?=\s|$)|\n/g;
  let fallbackCut = -1;
  let match = fallback.exec(value);
  while (match) {
    fallbackCut = match.index;
    match = fallback.exec(value);
  }
  if (fallbackCut >= minimumChars) {
    return value.slice(0, fallbackCut + 1).trim();
  }

  const lastSpace = value.lastIndexOf(" ");
  if (lastSpace >= minimumChars) return value.slice(0, lastSpace).trim();
  return value;
}

export function estimateTokenCount(text: string): number {
  const value = String(text || "").trim();
  if (!value) return 0;

  const tokenizer = readTokenizerRuntime();
  if (tokenizer) {
    try {
      return tokenizer.encode(value).length;
    } catch {
      // Fallback below.
    }
  }

  const chars = value.length;
  const nonAscii = value.replace(/[\x00-\x7F]/g, "").length;
  const nonAsciiRatio = chars > 0 ? nonAscii / chars : 0;
  const charsPerToken = nonAsciiRatio > 0.35 ? 2.2 : 3.8;
  return Math.max(1, Math.ceil(chars / charsPerToken));
}

export function trimTextToTokenBudget(
  text: string,
  tokenLimit: number,
  options?: TokenTrimOptions,
): TokenTrimResult {
  const value = String(text || "").trim();
  const budget = Math.floor(tokenLimit);
  const estimatedTokensBefore = estimateTokenCount(value);
  const minChars = clampInt(Number(options?.minimumChars ?? 24), 12, 200);
  const preserveSentenceBoundary = options?.preserveSentenceBoundary !== false;

  if (!value || estimatedTokensBefore <= budget) {
    return {
      text: value,
      truncated: false,
      estimatedTokensBefore,
      estimatedTokensAfter: estimatedTokensBefore,
      method: "none",
    };
  }
  if (budget <= 0) {
    return {
      text: "",
      truncated: value.length > 0,
      estimatedTokensBefore,
      estimatedTokensAfter: 0,
      method: "heuristic",
    };
  }

  const tokenizer = readTokenizerRuntime();
  if (tokenizer) {
    try {
      const encoded = tokenizer.encode(value);
      if (encoded.length <= budget) {
        return {
          text: value,
          truncated: false,
          estimatedTokensBefore: encoded.length,
          estimatedTokensAfter: encoded.length,
          method: "none",
        };
      }
      const decoded = tokenizer.decode(encoded.slice(0, budget)).trim();
      let bounded = trimAtBoundary(decoded, preserveSentenceBoundary, minChars);
      if (!bounded) bounded = decoded;
      if (options?.suffix && bounded && bounded !== value) {
        bounded = `${bounded}${options.suffix}`;
      }
      return {
        text: bounded.trim(),
        truncated: true,
        estimatedTokensBefore: encoded.length,
        estimatedTokensAfter: estimateTokenCount(bounded),
        method: "tokenizer",
      };
    } catch {
      // Heuristic fallback below.
    }
  }

  const charBudget = Math.max(minChars, Math.floor(budget * 4));
  const roughSlice = value.slice(0, charBudget).trim();
  let bounded = trimAtBoundary(roughSlice, preserveSentenceBoundary, minChars);
  if (!bounded) bounded = roughSlice;
  if (options?.suffix && bounded && bounded !== value) {
    bounded = `${bounded}${options.suffix}`;
  }
  return {
    text: bounded.trim(),
    truncated: true,
    estimatedTokensBefore,
    estimatedTokensAfter: estimateTokenCount(bounded),
    method: "heuristic",
  };
}

export function resolveOutputTokenBudget(
  input: OutputTokenBudgetInput,
): OutputTokenBudgetResult {
  const answerMode = String(input.answerMode || "").trim() || "general_answer";
  const routeStage = input.routeStage === "draft" ? "draft" : "final";
  const userText = String(input.userText || "").trim();
  const evidenceItems = clampInt(Number(input.evidenceItems ?? 0), 0, 50);
  const hasTables = Boolean(input.hasTables);
  const complexity = detectComplexity({
    answerMode,
    operator: input.operator,
    userText,
    evidenceItems,
    hasTables,
  });

  const override = toPositiveNumber(input.requestedOverride);
  const minTokens = resolveModeMin(answerMode);
  const maxTokens = resolveModeMax(answerMode);

  const resolvedMax = override
    ? clampInt(override, minTokens, maxTokens)
    : clampInt(
        applyLanguageMultiplier(
          applyComplexityBoost(
            resolveBaseBudget(answerMode, routeStage),
            complexity,
          ) +
            Math.min(evidenceItems, 12) * 14 +
            (hasTables ? 120 : 0),
          input.outputLanguage,
        ),
        minTokens,
        maxTokens,
      );

  const softOutputTokens = clampInt(
    Math.floor(resolvedMax * 0.9),
    Math.max(80, minTokens - 20),
    resolvedMax,
  );
  const hardOutputTokens = clampInt(
    Math.ceil(resolvedMax * 1.25),
    resolvedMax + 40,
    Math.max(resolvedMax + 40, maxTokens + 320),
  );

  return {
    maxOutputTokens: resolvedMax,
    softOutputTokens,
    hardOutputTokens,
    complexity,
  };
}
