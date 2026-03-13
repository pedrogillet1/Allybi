import { getOptionalBank } from "../banks/bankLoader.service";

export type BudgetComplexity = "low" | "medium" | "high";

export interface OutputTokenBudgetInput {
  answerMode?: string | null;
  outputShape?: string | null;
  outputLanguage?: string | null;
  routeStage?: "draft" | "final" | string | null;
  operator?: string | null;
  userText?: string | null;
  evidenceItems?: number | null;
  hasTables?: boolean;
  requestedOverride?: number | null;
  userRequestedShort?: boolean;
  styleMaxChars?: number | null;
}

export interface OutputTokenBudgetResult {
  maxOutputTokens: number;
  softOutputTokens: number;
  hardOutputTokens: number;
  complexity: BudgetComplexity;
}

export interface ResolvedOutputBudget extends OutputTokenBudgetResult {
  minOutputTokens: number;
  maxChars: number;
  profile: string | null;
  paragraphLimits: {
    maxSentencesSoft: number | null;
    maxSentencesHard: number | null;
    maxCharsSoft: number | null;
    maxCharsHard: number | null;
  };
  bulletLimits: {
    maxBulletsSoft: number | null;
    maxBulletsHard: number | null;
    maxSentencesPerBulletSoft: number | null;
    maxSentencesPerBulletHard: number | null;
    maxCharsPerBulletSoft: number | null;
    maxCharsPerBulletHard: number | null;
  };
  tableLimits: {
    maxRowsSoft: number | null;
    maxRowsHard: number | null;
    maxColumnsSoft: number | null;
    maxColumnsHard: number | null;
    maxCellCharsSoft: number | null;
    maxCellCharsHard: number | null;
  };
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

type TruncationAndLimitsBank = {
  budgetDefaults?: {
    minOutputTokens?: number;
    maxOutputTokens?: number;
    baseOutputTokensDraft?: number;
    baseOutputTokensFinal?: number;
    hardOutputMultiplier?: number;
    hardOutputExtraTokens?: number;
    hardOutputMaxExtraTokens?: number;
    evidenceItemTokenStep?: number;
    tableTokenBonus?: number;
    shortModeMaxOutputTokens?: number;
    complexityBoosts?: {
      medium?: number;
      high?: number;
    };
    languageMultipliers?: Record<string, number>;
  };
  profileBudgets?: Record<
    string,
    {
      maxChars?: number;
    }
  >;
  globalLimits?: {
    maxResponseCharsHard?: number;
  };
  answerModeLimits?: Record<
    string,
    {
      maxChars?: number;
      maxCharsDefault?: number;
      maxOutputTokens?: number;
      maxOutputTokensDefault?: number;
      maxTokens?: number;
      maxTokensDefault?: number;
      minOutputTokens?: number;
      baseOutputTokensDraft?: number;
      baseOutputTokensFinal?: number;
      hardOutputTokens?: number;
      hardOutputMultiplier?: number;
      hardOutputExtraTokens?: number;
      docGroundedMinOutputTokens?: number;
      shortModeMaxOutputTokens?: number;
      shortModeMaxChars?: number;
      forceProfile?: string;
      preferProfile?: string;
    }
  >;
  outputShapeLimits?: Record<
    string,
    {
      maxCharsHard?: number;
    }
  >;
  paragraphLimits?: Record<string, unknown>;
  bulletLimits?: Record<string, unknown>;
  tableLimits?: Record<string, unknown>;
};

let tokenizerRuntime: TokenizerRuntime | null | undefined;

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

function readTruncationBank(): TruncationAndLimitsBank | null {
  try {
    return getOptionalBank<TruncationAndLimitsBank>("truncation_and_limits");
  } catch {
    return null;
  }
}

function readModeMaxFromBank(answerMode: string): number | null {
  const bank = readTruncationBank();
  const modeLimits = bank?.answerModeLimits?.[answerMode];
  return (
    toPositiveNumber(modeLimits?.maxOutputTokens) ??
    toPositiveNumber(modeLimits?.maxOutputTokensDefault) ??
    toPositiveNumber(modeLimits?.maxTokens) ??
    toPositiveNumber(modeLimits?.maxTokensDefault)
  );
}

function readBudgetDefaultNumber(
  key: keyof NonNullable<TruncationAndLimitsBank["budgetDefaults"]>,
  fallback: number,
): number {
  const bank = readTruncationBank();
  return toPositiveNumber(bank?.budgetDefaults?.[key]) ?? fallback;
}

function readLanguageMultiplier(language?: string | null): number {
  const normalized = String(language || "")
    .trim()
    .toLowerCase();
  if (!normalized) return 1;
  const bank = readTruncationBank();
  const multiplier = bank?.budgetDefaults?.languageMultipliers?.[normalized];
  return toPositiveNumber(multiplier) ?? 1;
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
  return (
    toPositiveNumber(resolveModeConfig(answerMode)?.minOutputTokens) ??
    readBudgetDefaultNumber("minOutputTokens", 220)
  );
}

function resolveModeMax(answerMode: string): number {
  const bankModeMax = readModeMaxFromBank(answerMode);
  if (bankModeMax) return bankModeMax;
  return readBudgetDefaultNumber("maxOutputTokens", 3000);
}

function resolveBaseBudget(
  answerMode: string,
  routeStage: "draft" | "final",
): number {
  const modeConfig = resolveModeConfig(answerMode);
  const modeBase =
    routeStage === "draft"
      ? toPositiveNumber(modeConfig?.baseOutputTokensDraft)
      : toPositiveNumber(modeConfig?.baseOutputTokensFinal);
  if (modeBase) return modeBase;

  return routeStage === "draft"
    ? readBudgetDefaultNumber("baseOutputTokensDraft", 1200)
    : readBudgetDefaultNumber("baseOutputTokensFinal", 1600);
}

function detectComplexity(params: {
  answerMode: string;
  operator?: string | null;
  userText: string;
  evidenceItems: number;
  hasTables: boolean;
}): BudgetComplexity {
  let score = 0;
  const normalizedUserText = String(params.userText || "").toLowerCase();
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
  if (params.answerMode === "help_steps") score += 1;

  if (params.operator === "quote") score += 1;
  if (params.operator === "locate_docs") score -= 1;

  const deepExtractionCue =
    /\b(extract|extraction|every|all|detailed|detail|deep(er)?|comprehensive|precision|normalize|normaliz|consistency|line\s*item|fact\s*sheet|verification|checklist|dispute)\b/i.test(
      normalizedUserText,
    );
  if (deepExtractionCue) score += 1;

  const structuredOutputCue =
    /\b(table|tabela|matrix|matriz|compare|comparison|differences|audit|reconcile|cross[-\s]?check|validate|validation)\b/i.test(
      normalizedUserText,
    );
  if (structuredOutputCue) score += 1;

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function applyComplexityBoost(
  base: number,
  complexity: BudgetComplexity,
): number {
  const boosts = readTruncationBank()?.budgetDefaults?.complexityBoosts;
  if (complexity === "high") {
    return base + (toPositiveNumber(boosts?.high) ?? 260);
  }
  if (complexity === "medium") {
    return base + (toPositiveNumber(boosts?.medium) ?? 120);
  }
  return base;
}

function applyLanguageMultiplier(
  tokens: number,
  language?: string | null,
): number {
  return Math.round(tokens * readLanguageMultiplier(language));
}

function resolveModeConfig(answerMode: string) {
  return readTruncationBank()?.answerModeLimits?.[answerMode] ?? null;
}

function resolveProfile(answerMode: string): string | null {
  const modeConfig = resolveModeConfig(answerMode);
  return (
    String(modeConfig?.forceProfile || "").trim() ||
    String(modeConfig?.preferProfile || "").trim() ||
    null
  );
}

function resolveOutputShapeCharBudget(outputShape?: string | null): number | null {
  const normalized = String(outputShape || "").trim();
  if (!normalized) return null;
  const shapeConfig = readTruncationBank()?.outputShapeLimits?.[normalized];
  return toPositiveNumber(shapeConfig?.maxCharsHard);
}

function resolveModeCharBudget(answerMode: string): number | null {
  const modeConfig = resolveModeConfig(answerMode);
  return (
    toPositiveNumber(modeConfig?.maxChars) ??
    toPositiveNumber(modeConfig?.maxCharsDefault)
  );
}

function resolveProfileCharBudget(profile: string | null): number | null {
  if (!profile) return null;
  const profileBudget = readTruncationBank()?.profileBudgets?.[profile];
  return toPositiveNumber(profileBudget?.maxChars);
}

function charsPerToken(language?: string | null): number {
  const normalized = String(language || "")
    .trim()
    .toLowerCase();
  if (normalized === "pt" || normalized === "es") return 3.5;
  return 4.0;
}

function readLimitNumber(
  section: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!section) return null;
  return toPositiveNumber(section[key]);
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

export function resolveOutputBudget(
  input: OutputTokenBudgetInput,
): ResolvedOutputBudget {
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
  const modeConfig = resolveModeConfig(answerMode);
  const evidenceItemTokenStep = readBudgetDefaultNumber(
    "evidenceItemTokenStep",
    14,
  );
  const tableTokenBonus = readBudgetDefaultNumber("tableTokenBonus", 120);

  let resolvedMax = override
    ? clampInt(override, minTokens, maxTokens)
    : clampInt(
        applyLanguageMultiplier(
          applyComplexityBoost(
            resolveBaseBudget(answerMode, routeStage),
            complexity,
          ) +
            Math.min(evidenceItems, 12) * evidenceItemTokenStep +
            (hasTables ? tableTokenBonus : 0),
          input.outputLanguage,
        ),
        minTokens,
        maxTokens,
      );

  const docGroundedFloor =
    input.userRequestedShort === true
      ? null
      : toPositiveNumber(modeConfig?.docGroundedMinOutputTokens);
  if (docGroundedFloor) {
    resolvedMax = Math.max(resolvedMax, docGroundedFloor);
  }

  const shortModeCap =
    input.userRequestedShort === true
      ? toPositiveNumber(modeConfig?.shortModeMaxOutputTokens) ??
        toPositiveNumber(resolveModeMax(answerMode)) ??
        readBudgetDefaultNumber("shortModeMaxOutputTokens", 180)
      : null;
  if (shortModeCap) {
    resolvedMax = Math.min(resolvedMax, shortModeCap);
  }

  const styleMaxChars = toPositiveNumber(input.styleMaxChars);
  if (input.userRequestedShort === true && styleMaxChars) {
    const styleTokenCap = Math.max(
      256,
      Math.ceil(styleMaxChars / charsPerToken(input.outputLanguage)),
    );
    resolvedMax = Math.min(resolvedMax, styleTokenCap);
  }

  const softOutputTokens = clampInt(
    Math.floor(resolvedMax * 0.9),
    Math.max(80, minTokens - 20),
    resolvedMax,
  );
  const explicitHardTokens = toPositiveNumber(modeConfig?.hardOutputTokens);
  const hardMultiplier =
    toPositiveNumber(modeConfig?.hardOutputMultiplier) ??
    readBudgetDefaultNumber("hardOutputMultiplier", 1.25);
  const hardExtra =
    toPositiveNumber(modeConfig?.hardOutputExtraTokens) ??
    readBudgetDefaultNumber("hardOutputExtraTokens", 40);
  const hardMaxExtra = readBudgetDefaultNumber("hardOutputMaxExtraTokens", 320);
  const hardOutputTokens = explicitHardTokens
    ? Math.max(resolvedMax, Math.round(explicitHardTokens))
    : clampInt(
        Math.ceil(resolvedMax * hardMultiplier),
        resolvedMax + hardExtra,
        Math.max(resolvedMax + hardExtra, maxTokens + hardMaxExtra),
      );
  const truncationBank = readTruncationBank();
  const resolvedProfile = resolveProfile(answerMode);
  let maxChars =
    clampInt(
      Number(
        resolveModeCharBudget(answerMode) ??
          resolveProfileCharBudget(resolvedProfile) ??
          truncationBank?.globalLimits?.maxResponseCharsHard ??
          Math.ceil(hardOutputTokens * 4.5),
      ),
      120,
      Math.max(
        120,
        Number(
          truncationBank?.globalLimits?.maxResponseCharsHard ??
            Math.ceil(hardOutputTokens * 4.5),
        ),
      ),
    ) || Math.ceil(hardOutputTokens * 4.5);
  const outputShapeMaxChars = resolveOutputShapeCharBudget(input.outputShape);
  if (outputShapeMaxChars) {
    maxChars = Math.min(maxChars, outputShapeMaxChars);
  }
  if (input.userRequestedShort === true) {
    const shortModeMaxChars = toPositiveNumber(modeConfig?.shortModeMaxChars);
    if (shortModeMaxChars) {
      maxChars = Math.min(maxChars, shortModeMaxChars);
    }
  }
  if (styleMaxChars && input.userRequestedShort === true) {
    maxChars = Math.min(maxChars, Math.round(styleMaxChars));
  }
  const paragraphLimits = truncationBank?.paragraphLimits ?? null;
  const bulletLimits = truncationBank?.bulletLimits ?? null;
  const tableLimits = truncationBank?.tableLimits ?? null;

  return {
    maxOutputTokens: resolvedMax,
    softOutputTokens,
    hardOutputTokens,
    complexity,
    minOutputTokens: minTokens,
    maxChars,
    profile: resolvedProfile,
    paragraphLimits: {
      maxSentencesSoft: readLimitNumber(paragraphLimits, "maxSentencesSoft"),
      maxSentencesHard: readLimitNumber(paragraphLimits, "maxSentencesHard"),
      maxCharsSoft: readLimitNumber(paragraphLimits, "maxCharsSoft"),
      maxCharsHard: readLimitNumber(paragraphLimits, "maxCharsHard"),
    },
    bulletLimits: {
      maxBulletsSoft: readLimitNumber(bulletLimits, "maxBulletsSoft"),
      maxBulletsHard: readLimitNumber(bulletLimits, "maxBulletsHard"),
      maxSentencesPerBulletSoft: readLimitNumber(
        bulletLimits,
        "maxSentencesPerBulletSoft",
      ),
      maxSentencesPerBulletHard: readLimitNumber(
        bulletLimits,
        "maxSentencesPerBulletHard",
      ),
      maxCharsPerBulletSoft: readLimitNumber(
        bulletLimits,
        "maxCharsPerBulletSoft",
      ),
      maxCharsPerBulletHard: readLimitNumber(
        bulletLimits,
        "maxCharsPerBulletHard",
      ),
    },
    tableLimits: {
      maxRowsSoft: readLimitNumber(tableLimits, "maxRowsSoft"),
      maxRowsHard: readLimitNumber(tableLimits, "maxRowsHard"),
      maxColumnsSoft: readLimitNumber(tableLimits, "maxColumnsSoft"),
      maxColumnsHard: readLimitNumber(tableLimits, "maxColumnsHard"),
      maxCellCharsSoft: readLimitNumber(tableLimits, "maxCellCharsSoft"),
      maxCellCharsHard: readLimitNumber(tableLimits, "maxCellCharsHard"),
    },
  };
}

export function resolveOutputTokenBudget(
  input: OutputTokenBudgetInput,
): OutputTokenBudgetResult {
  return resolveOutputBudget(input);
}
