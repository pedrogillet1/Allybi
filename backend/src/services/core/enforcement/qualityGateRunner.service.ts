/**
 * QualityGateRunner — Orchestrates quality validation gates for responses.
 *
 * Runs a pipeline of quality checks before finalizing answers. Loads gate
 * configuration from the quality_gates data bank and executes each gate
 * in the configured order.
 */

import { injectable } from "tsyringe";
import type { SlotContract } from "../retrieval/slotResolver.service";
import type { ExtractionResult } from "../compose/extractionCompiler.service";
import { resolveOutputTokenBudget } from "./tokenBudget.service";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../banks/documentIntelligenceBanks.service";
import { getOptionalBank } from "../banks/bankLoader.service";
import { evaluateRuleBooleanExpression } from "./qualityGateRunner.expression";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityGateResult {
  passed: boolean;
  gateName: string;
  score?: number;
  issues?: string[];
  actionOnFail?: string;
  sourceBankId?: string;
}

export interface QualityRunResult {
  allPassed: boolean;
  results: QualityGateResult[];
  finalScore: number;
}

export interface QualityGateContext {
  answerMode?: string;
  answerClass?: string;
  domainHint?: string;
  docTypeId?: string;
  operator?: string;
  intentFamily?: string;
  slotContract?: SlotContract | null;
  extractionResult?: ExtractionResult | null;
  evidenceItems?: Array<{ snippet?: string; docId?: string }>;
  language?: string;
  docLockEnabled?: boolean;
  discoveryMode?: boolean;
  requiresClarification?: boolean;
  explicitDocRef?: boolean;
  sourceButtonsCount?: number;
  userRequestedShort?: boolean;
  diPolicyContext?: Record<string, unknown>;
  diPolicyOutput?: Record<string, unknown>;
  diPolicyAttachments?: Record<string, unknown>;
  diPolicySource?: Record<string, unknown>;
  diPolicyConfig?: (Record<string, unknown> & {
    limits?: {
      maxSourcesButtonsHard?: number;
    };
  }) | null;
}

type QualityGatesBank = {
  _meta?: { id?: string; version?: string };
  config?: {
    enabled?: boolean;
    modes?: {
      byEnv?: Record<string, { strictness?: string; failClosed?: boolean }>;
    };
    limits?: {
      maxSourcesButtonsHard?: number;
    };
    integrationHooks?: Record<string, string>;
  };
  gateOrder?: string[];
};

type ValidationDomainArg = Parameters<
  NonNullable<DocumentIntelligenceBanksService["getValidationPolicies"]>
>[0];

type SafetyDomainArg = Parameters<
  NonNullable<DocumentIntelligenceBanksService["getRedactionAndSafetyRules"]>
>[0];

type HookBank = {
  _meta?: { id?: string; version?: string };
  config?: Record<string, unknown> & { enabled?: boolean };
  rules?: Array<Record<string, unknown>>;
  checks?: Array<Record<string, unknown>>;
  bannedPhrases?: string[];
  bannedPatterns?: string[];
  piiPatterns?: string[];
};

type DocumentIntelligenceRule = {
  id?: string;
  trigger?: string;
  check?: string;
  failureAction?: string;
  severity?: string;
};

type DocumentIntelligenceQualityBank = {
  _meta?: { id?: string; version?: string };
  config?: { enabled?: boolean };
  rules?: DocumentIntelligenceRule[];
};

type DocumentIntelligenceScope = {
  answerMode: string;
  context: Record<string, unknown>;
  output: Record<string, unknown>;
  attachments: Record<string, unknown>;
  source: Record<string, unknown>;
  config: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Gate implementations
// ---------------------------------------------------------------------------

type GateFn = (response: string, ctx: QualityGateContext) => QualityGateResult;

function gateRequestedSlotCovered(
  response: string,
  ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "requested_slot_covered";
  if (!ctx.slotContract) {
    return { passed: true, gateName, score: 1.0 };
  }

  const lower = response.toLowerCase();
  const anchors = ctx.slotContract.anchorLabels || [];

  const found = anchors.some((a) =>
    lower.includes(String(a || "").toLowerCase()),
  );

  const hasCandidateEntity =
    ctx.extractionResult?.candidates?.some((c) =>
      lower.includes(c.entityText.toLowerCase()),
    ) ?? false;

  const passed = found || hasCandidateEntity;

  return {
    passed,
    gateName,
    score: passed ? 1.0 : 0.0,
    issues: passed
      ? undefined
      : [
          `Answer does not mention target role '${ctx.slotContract.targetRoleId}' or its anchor labels`,
        ],
  };
}

function gateForbiddenAdjacentRoleAbsent(
  response: string,
  ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "forbidden_adjacent_role_absent";
  if (!ctx.slotContract || !ctx.extractionResult) {
    return { passed: true, gateName, score: 1.0 };
  }

  const lower = response.toLowerCase();
  const forbidden = ctx.extractionResult.forbiddenMentions || [];
  const issues: string[] = [];

  for (const f of forbidden) {
    if (lower.includes(f.entityText.toLowerCase())) {
      issues.push(
        `Answer mentions forbidden-role entity '${f.entityText}' (role: ${f.role})`,
      );
    }
  }

  const passed = issues.length === 0;
  return {
    passed,
    gateName,
    score: passed ? 1.0 : Math.max(0, 1.0 - issues.length * 0.3),
    issues: passed ? undefined : issues,
  };
}

function gateEntityRoleConsistency(
  response: string,
  ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "entity_role_consistency";
  if (!ctx.slotContract || !ctx.extractionResult) {
    return { passed: true, gateName, score: 1.0 };
  }

  const lower = response.toLowerCase();
  const candidates = ctx.extractionResult.candidates || [];
  const issues: string[] = [];

  if (candidates.length > 0) {
    const anyMatch = candidates.some((c) =>
      lower.includes(c.entityText.toLowerCase()),
    );
    if (!anyMatch) {
      issues.push(
        "Answer does not contain any of the extracted target-role entity candidates",
      );
    }
  }

  const passed = issues.length === 0;
  return {
    passed,
    gateName,
    score: passed ? 1.0 : 0.3,
    issues: passed ? undefined : issues,
  };
}

function gateBrevityCheck(
  response: string,
  ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "brevity_and_constraints";
  const hardOutputTokens = resolveOutputTokenBudget({
    answerMode: ctx.answerMode || "general_answer",
    outputLanguage: ctx.language || "en",
    routeStage: "final",
    hasTables:
      ctx.answerMode === "doc_grounded_table" ||
      ctx.answerMode === "doc_grounded_multi",
    evidenceItems: Array.isArray(ctx.evidenceItems)
      ? ctx.evidenceItems.length
      : 0,
  }).hardOutputTokens;
  const maxChars = Math.max(1800, Math.ceil(hardOutputTokens * 4.5));
  const passed = response.length <= maxChars;
  return {
    passed,
    gateName,
    score: passed ? 1.0 : 0.5,
    issues: passed
      ? undefined
      : [`Response length ${response.length} exceeds max ${maxChars} chars`],
  };
}

function gateMarkdownSanity(
  response: string,
  _ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "markdown_sanity";
  const issues: string[] = [];

  const backtickCount = (response.match(/```/g) || []).length;
  if (backtickCount % 2 !== 0) {
    issues.push("Unclosed code block (odd number of ``` delimiters)");
  }

  const passed = issues.length === 0;
  return {
    passed,
    gateName,
    score: passed ? 1.0 : 0.7,
    issues: passed ? undefined : issues,
  };
}

function gateNoJsonOutput(
  response: string,
  _ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "no_raw_json";
  const trimmed = response.trim();
  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  const passed = !looksLikeJson;
  return {
    passed,
    gateName,
    score: passed ? 1.0 : 0.0,
    issues: passed ? undefined : ["Response appears to be raw JSON output"],
  };
}

const GATE_REGISTRY: Record<string, GateFn> = {
  requested_slot_covered: gateRequestedSlotCovered,
  forbidden_adjacent_role_absent: gateForbiddenAdjacentRoleAbsent,
  entity_role_consistency: gateEntityRoleConsistency,
  brevity_and_constraints: gateBrevityCheck,
  markdown_sanity: gateMarkdownSanity,
  no_raw_json: gateNoJsonOutput,
};

const DEFAULT_GATE_ORDER = [
  "brevity_and_constraints",
  "markdown_sanity",
  "no_raw_json",
];

const EXTRACTION_GATE_ORDER = [
  "requested_slot_covered",
  "forbidden_adjacent_role_absent",
  "entity_role_consistency",
];

const REQUIRED_QUALITY_HOOK_KEYS = [
  "docGroundingChecksBankId",
  "hallucinationGuardsBankId",
  "dedupeBankId",
  "privacyMinimalRulesBankId",
  "piiLabelsBankId",
] as const;

function resolveRuntimeEnv(): "production" | "staging" | "dev" | "local" {
  const raw = String(
    process.env.RUNTIME_ENV ||
      process.env.APP_ENV ||
      process.env.NODE_ENV ||
      "",
  )
    .trim()
    .toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage") return "staging";
  if (raw === "local") return "local";
  return "dev";
}

function splitSentences(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectRepeatedSentence(text: string): boolean {
  const sentences = splitSentences(text).map((s) => s.toLowerCase());
  const seen = new Set<string>();
  for (const sentence of sentences) {
    if (seen.has(sentence)) return true;
    seen.add(sentence);
  }
  return false;
}

function detectMissingUnitWithNumber(response: string): boolean {
  const hasNumericFact = /\b\d[\d.,]*\b/.test(response);
  if (!hasNumericFact) return false;
  const hasUnitOrCurrency =
    /\b(?:usd|eur|brl|gbp|dollars?|euros?|reais|hours?|hrs?|dias?|days?|months?|meses?|m2|sqm|sqft|%)\b|[$€£]|r\$/i.test(
      response,
    );
  return !hasUnitOrCurrency;
}

function normalizeDomain(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function firstFiniteNumber(values: unknown[]): number | null {
  for (const value of values) {
    const num = toFiniteNumber(value);
    if (num !== null) return num;
  }
  return null;
}

function extractComparable(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, "id")) return record.id;
  if (Object.prototype.hasOwnProperty.call(record, "docId")) return record.docId;
  if (Object.prototype.hasOwnProperty.call(record, "value")) return record.value;
  return value;
}

function diAny(value: unknown, predicate: unknown): boolean {
  if (!Array.isArray(value) || typeof predicate !== "function") return false;
  try {
    return value.some((item, idx) => {
      try {
        return Boolean((predicate as (item: unknown, idx: number) => unknown)(
          item,
          idx,
        ));
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function diCount(value: unknown): number {
  if (Array.isArray(value) || typeof value === "string") return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function diDistinctCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  const set = new Set<string>();
  for (const raw of value) {
    const comparable = extractComparable(raw);
    const key =
      comparable && typeof comparable === "object"
        ? JSON.stringify(comparable)
        : String(comparable);
    set.add(key);
  }
  return set.size;
}

function diIn(value: unknown, candidates: unknown): boolean {
  if (!Array.isArray(candidates)) return false;
  const probe = extractComparable(value);
  return candidates.some((candidate) => extractComparable(candidate) === probe);
}

function diStartsWith(value: unknown, prefix: unknown): boolean {
  const raw = String(value ?? "");
  const needle = String(prefix ?? "");
  return raw.startsWith(needle);
}

function compileDiPattern(rawPattern: unknown, rawFlags: unknown): RegExp | null {
  let pattern = String(rawPattern ?? "");
  const extractedFlags = pattern.match(/^\(\?([a-z]+)\)/i);
  let flags = String(rawFlags ?? "");
  if (extractedFlags) {
    pattern = pattern.slice(extractedFlags[0].length);
    flags = `${flags}${extractedFlags[1]}`;
  }
  const normalizedFlags = Array.from(
    new Set(
      flags
        .split("")
        .filter((flag) => "dgimsuvy".includes(flag.toLowerCase()))
        .map((flag) => flag.toLowerCase()),
    ),
  ).join("");
  try {
    return new RegExp(pattern, normalizedFlags);
  } catch {
    return null;
  }
}

function diMatchesPattern(
  candidate: unknown,
  rawPattern: unknown,
  rawFlags?: unknown,
): boolean {
  const regex = compileDiPattern(rawPattern, rawFlags);
  if (!regex) return false;
  if (typeof candidate === "string") return regex.test(candidate);
  const fallback =
    candidate && typeof candidate === "object"
      ? String((candidate as Record<string, unknown>).text ?? "")
      : String(candidate ?? "");
  return regex.test(fallback);
}

function diIncludes(container: unknown, item: unknown): boolean {
  if (Array.isArray(container)) {
    const probe = extractComparable(item);
    return container.some((entry) => extractComparable(entry) === probe);
  }
  if (typeof container === "string") {
    return container.includes(String(item ?? ""));
  }
  if (container && typeof container === "object") {
    return Object.prototype.hasOwnProperty.call(container, String(item ?? ""));
  }
  return false;
}

function diSum(values: unknown): number {
  if (!Array.isArray(values)) return 0;
  return values.reduce((sum, value) => {
    const num = Number(value);
    return Number.isFinite(num) ? sum + num : sum;
  }, 0);
}

function diLog10(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return Number.NEGATIVE_INFINITY;
  return Math.log10(num);
}

function normalizeRuleExpression(rawExpression: string): string {
  let expression = String(rawExpression || "").trim();
  if (!expression) return expression;
  expression = expression.replace(/\bAND\b/g, "&&").replace(/\bOR\b/g, "||");
  expression = expression.replace(
    /source\.valueSemantic == 'cumulative' && output\.valueSemantic == 'incremental' \|\| vice versa/g,
    "(source.valueSemantic == 'cumulative' && output.valueSemantic == 'incremental') || (source.valueSemantic == 'incremental' && output.valueSemantic == 'cumulative')",
  );
  expression = expression.replace(
    /source\.yearType == 'fiscal' && output\.yearType == 'calendar' \|\| vice versa/g,
    "(source.yearType == 'fiscal' && output.yearType == 'calendar') || (source.yearType == 'calendar' && output.yearType == 'fiscal')",
  );
  expression = expression.replace(
    /([A-Za-z0-9_.\]\[]+)\.distinct\.count/g,
    "diDistinctCount($1)",
  );
  expression = expression.replace(/([A-Za-z0-9_.\]\[]+)\.count/g, "diCount($1)");
  expression = expression.replace(/([A-Za-z0-9_.\]\[]+)\.any\(/g, "diAny($1,");
  expression = expression.replace(/([A-Za-z0-9_.\]\[]+)\.in\(/g, "diIn($1,");
  expression = expression.replace(
    /([A-Za-z0-9_.\]\[]+)\.startsWith\(/g,
    "diStartsWith($1,",
  );
  expression = expression.replace(
    /([A-Za-z0-9_.\]\[]+)\.matchesPattern\(/g,
    "diMatchesPattern($1,",
  );
  expression = expression.replace(
    /([A-Za-z0-9_.\]\[]+)\.includes\(/g,
    "diIncludes($1,",
  );
  expression = expression.replace(/\bsum\(/g, "diSum(");
  expression = expression.replace(/\blog10\(/g, "diLog10(");
  return expression;
}

function extractDocIdsFromEvidence(
  evidenceItems: Array<{ snippet?: string; docId?: string }> | undefined,
): string[] {
  if (!Array.isArray(evidenceItems)) return [];
  return Array.from(
    new Set(
      evidenceItems
        .map((item) => String(item?.docId || "").trim())
        .filter(Boolean),
    ),
  );
}

function mergeDeep(baseValue: unknown, overrideValue: unknown): unknown {
  if (Array.isArray(overrideValue)) {
    return overrideValue.slice();
  }
  if (
    baseValue &&
    typeof baseValue === "object" &&
    !Array.isArray(baseValue) &&
    overrideValue &&
    typeof overrideValue === "object" &&
    !Array.isArray(overrideValue)
  ) {
    const out: Record<string, unknown> = {
      ...(baseValue as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(
      overrideValue as Record<string, unknown>,
    )) {
      out[key] = mergeDeep(out[key], value);
    }
    return out;
  }
  if (overrideValue === undefined) return baseValue;
  return overrideValue;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@injectable()
export class QualityGateRunnerService {
  constructor(
    private readonly documentIntelligenceBanks: Pick<
      DocumentIntelligenceBanksService,
      "getQualityGateBank"
    > &
      Partial<
        Pick<
          DocumentIntelligenceBanksService,
          "getValidationPolicies" | "getRedactionAndSafetyRules"
        >
      > = getDocumentIntelligenceBanksInstance(),
  ) {}

  private getQualityBank(): QualityGatesBank | null {
    return getOptionalBank<QualityGatesBank>("quality_gates");
  }

  private isStrictFailClosedMode(
    qualityBank: QualityGatesBank | null,
  ): boolean {
    const env = resolveRuntimeEnv();
    const byEnv = qualityBank?.config?.modes?.byEnv;
    const configured = byEnv?.[env];
    if (typeof configured?.failClosed === "boolean") {
      return configured.failClosed;
    }
    return env === "production" || env === "staging";
  }

  private validateRequiredHookBanks(
    qualityBank: QualityGatesBank | null,
    strictFailClosed: boolean,
  ): QualityGateResult[] {
    const results: QualityGateResult[] = [];
    const hooks = qualityBank?.config?.integrationHooks || {};

    for (const key of REQUIRED_QUALITY_HOOK_KEYS) {
      const hookBankId = String(hooks[key] || "").trim();
      if (!hookBankId) continue;
      const bank = getOptionalBank<HookBank>(hookBankId);
      if (bank) continue;

      const issue = `Required quality integration hook bank missing: ${hookBankId}`;
      if (strictFailClosed) {
        throw new Error(issue);
      }

      results.push({
        gateName: "quality_integration_hook_presence",
        passed: false,
        score: 0,
        issues: [issue],
        sourceBankId: "quality_gates",
      });
    }

    return results;
  }

  private evaluateConfiguredGate(
    gateId: string,
    response: string,
    ctx: QualityGateContext,
    qualityBank: QualityGatesBank | null,
  ): QualityGateResult | null {
    const gateName = String(gateId || "").trim();
    if (!gateName) return null;

    if (GATE_REGISTRY[gateName]) {
      return GATE_REGISTRY[gateName](response, ctx);
    }

    const normalizedAnswerMode = String(ctx.answerMode || "")
      .trim()
      .toLowerCase();

    if (gateName === "explicit_doc_enforcement") {
      const explicit = Boolean(ctx.explicitDocRef);
      const lockConflict = explicit && Boolean(ctx.discoveryMode);
      return {
        gateName,
        passed: !lockConflict,
        score: lockConflict ? 0 : 1,
        issues: lockConflict
          ? ["Explicit doc reference cannot run in discovery mode."]
          : undefined,
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "nav_pills_enforcement") {
      const inNavMode = normalizedAnswerMode === "nav_pills";
      if (!inNavMode) {
        return {
          gateName,
          passed: true,
          score: 1,
          sourceBankId: qualityBank?._meta?.id || "quality_gates",
        };
      }
      const hasSourcesHeader = /\b(sources|fontes|fuentes)\s*:/i.test(response);
      const hasInlineFileList =
        /\.(pdf|xlsx?|pptx?|docx?|csv|txt|jpg|jpeg|png)\b/i.test(response);
      const missingButtons = Number(ctx.sourceButtonsCount || 0) < 1;
      const sentenceCount = splitSentences(response).length;
      const failed =
        hasSourcesHeader ||
        hasInlineFileList ||
        missingButtons ||
        sentenceCount > 1;
      return {
        gateName,
        passed: !failed,
        score: failed ? 0 : 1,
        issues: failed
          ? [
              hasSourcesHeader
                ? "Navigation mode cannot render Sources label in body."
                : "",
              hasInlineFileList
                ? "Navigation mode cannot render inline filenames in body."
                : "",
              missingButtons ? "Navigation mode requires source buttons." : "",
              sentenceCount > 1
                ? "Navigation mode body must be a single sentence intro."
                : "",
            ].filter(Boolean)
          : undefined,
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "bad_fallback_replacement") {
      const badFallback =
        /no relevant information found|no relevant info found|nothing found|i couldn't find relevant content|i could not find relevant content|nao encontrei informacao relevante|no encontre informacion relevante/i.test(
          response,
        );
      return {
        gateName,
        passed: !badFallback,
        score: badFallback ? 0 : 1,
        issues: badFallback
          ? [
              "Generic fallback phrase detected; adaptive fallback should be used.",
            ]
          : undefined,
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "numeric_integrity") {
      const hasPartialNumber = /\d+\.$|\d+,$|\d+\*+$/m.test(response);
      return {
        gateName,
        passed: !hasPartialNumber,
        score: hasPartialNumber ? 0.2 : 1,
        issues: hasPartialNumber
          ? ["Potential truncated numeric token detected."]
          : undefined,
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "format_and_structure_hygiene") {
      const jsonCheck = gateNoJsonOutput(response, ctx);
      return {
        gateName,
        passed: jsonCheck.passed,
        score: jsonCheck.score,
        issues: jsonCheck.issues,
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "doc_grounding_minimums") {
      const mode = String(ctx.answerMode || "");
      const requiresGrounding =
        mode.startsWith("doc_grounded") || mode === "help_steps";
      const evidenceCount = Array.isArray(ctx.evidenceItems)
        ? ctx.evidenceItems.length
        : 0;
      const hasMinimum = !requiresGrounding || evidenceCount > 0;
      return {
        gateName,
        passed: hasMinimum,
        score: hasMinimum ? 1 : 0,
        issues: hasMinimum
          ? undefined
          : ["Doc-grounded output is missing grounding evidence items."],
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "hallucination_risk") {
      const mode = String(ctx.answerMode || "");
      const requiresGrounding = mode.startsWith("doc_grounded");
      const evidenceCount = Array.isArray(ctx.evidenceItems)
        ? ctx.evidenceItems.length
        : 0;
      const speculative = /\b(i think|maybe|probably|likely|guess)\b/i.test(
        response,
      );
      const highRisk =
        requiresGrounding && (evidenceCount === 0 || speculative);
      return {
        gateName,
        passed: !highRisk,
        score: highRisk ? 0.2 : 1,
        issues: highRisk
          ? [
              "High hallucination risk: grounded mode output lacks sufficient hard-evidence confidence.",
            ]
          : undefined,
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "repetition_and_banned_phrases") {
      const hooks = qualityBank?.config?.integrationHooks || {};
      const dedupeBankId = String(hooks.dedupeBankId || "").trim();
      const dedupeBank = dedupeBankId
        ? getOptionalBank<HookBank>(dedupeBankId)
        : null;
      const patterns = [
        ...(Array.isArray(dedupeBank?.bannedPhrases)
          ? dedupeBank!.bannedPhrases!
          : []),
        ...(Array.isArray(dedupeBank?.bannedPatterns)
          ? dedupeBank!.bannedPatterns!
          : []),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const hasBannedPhrase = patterns.some((phrase) => {
        try {
          return new RegExp(phrase, "i").test(response);
        } catch {
          return response.toLowerCase().includes(phrase.toLowerCase());
        }
      });
      const repeatedSentence = detectRepeatedSentence(response);
      const failed = hasBannedPhrase || repeatedSentence;
      return {
        gateName,
        passed: !failed,
        score: failed ? 0.5 : 1,
        issues: failed
          ? [
              hasBannedPhrase
                ? "Banned/repetitive phrase pattern detected in response."
                : "",
              repeatedSentence
                ? "Exact repeated sentence detected in response output."
                : "",
            ].filter(Boolean)
          : undefined,
        sourceBankId: dedupeBankId || qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "privacy_minimal") {
      const hooks = qualityBank?.config?.integrationHooks || {};
      const piiLabelsBankId = String(hooks.piiLabelsBankId || "").trim();
      const piiBank = piiLabelsBankId
        ? getOptionalBank<HookBank>(piiLabelsBankId)
        : null;
      const piiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
        /\b(?:cpf|cnpj|tax\s*id|tin)\b/i,
      ];
      for (const pattern of piiPatterns) {
        if (pattern.test(response)) {
          return {
            gateName,
            passed: false,
            score: 0,
            issues: ["Potential PII leak detected in response content."],
            sourceBankId:
              piiLabelsBankId || qualityBank?._meta?.id || "quality_gates",
          };
        }
      }
      if (Array.isArray(piiBank?.piiPatterns)) {
        for (const raw of piiBank.piiPatterns) {
          try {
            if (new RegExp(String(raw), "i").test(response)) {
              return {
                gateName,
                passed: false,
                score: 0,
                issues: [
                  "PII pattern match detected by pii_field_labels bank.",
                ],
                sourceBankId: piiLabelsBankId,
              };
            }
          } catch {
            // ignore invalid regex from bank
          }
        }
      }
      return {
        gateName,
        passed: true,
        score: 1,
        sourceBankId:
          piiLabelsBankId || qualityBank?._meta?.id || "quality_gates",
      };
    }

    if (gateName === "final_consistency") {
      const empty = String(response || "").trim().length === 0;
      const inNavMode = normalizedAnswerMode === "nav_pills";
      const tooManySentences = inNavMode && splitSentences(response).length > 1;
      const failed = empty || tooManySentences;
      return {
        gateName,
        passed: !failed,
        score: failed ? 0 : 1,
        issues: failed
          ? [
              empty ? "Answer text is empty after quality enforcement." : "",
              tooManySentences
                ? "Navigation mode must return only one intro sentence."
                : "",
            ].filter(Boolean)
          : undefined,
        sourceBankId: qualityBank?._meta?.id || "quality_gates",
      };
    }

    return null;
  }

  private buildDocumentIntelligenceScope(
    response: string,
    ctx: QualityGateContext,
    qualityBank: QualityGatesBank | null,
  ): DocumentIntelligenceScope {
    const responseText = String(response || "");
    const evidenceDocIds = extractDocIdsFromEvidence(ctx.evidenceItems);
    const citations = responseText.match(/\[[^\]]+\]/g) || [];
    const sentenceCount = splitSentences(responseText).length;
    const pageRefs = Array.from(
      responseText.matchAll(/\b(?:page|p\.)\s*(\d+)\b/gi),
    )
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value));
    const sourceSectionIndex = asArray(ctx.diPolicySource?.sectionIndex).map(
      (value) => String(value),
    );
    const sourceButtons = asArray(
      ctx.diPolicyAttachments?.source_buttons ??
        ctx.diPolicyAttachments?.sourceButtons,
    )
      .map((entry) => asRecord(entry))
      .filter((entry) => Object.keys(entry).length > 0);
    const messageActions = asArray(
      ctx.diPolicyAttachments?.messageActions ??
        ctx.diPolicyAttachments?.message_actions,
    );
    const outputSourceDocs = asArray(ctx.diPolicyOutput?.sourceDocs);
    const derivedSourceDocs =
      outputSourceDocs.length > 0
        ? outputSourceDocs
        : evidenceDocIds.length > 0
          ? evidenceDocIds
          : sourceButtons
              .map((button) => String(button.docId || "").trim())
              .filter(Boolean);
    const normalizedMode = String(ctx.answerMode || "")
      .trim()
      .toLowerCase();
    const firstCurrencyMatch =
      responseText.match(/(?:R\$|\$|€|£)\s*[-+]?\d[\d.,]*/i)?.[0] ?? null;
    const firstPercentMatch = responseText.match(/[-+]?\d[\d.,]*\s*%/i)?.[0];
    const parsedPercentValue = firstFiniteNumber([
      firstPercentMatch?.replace(/[%\s]/g, ""),
      ctx.diPolicyOutput?.percentValue,
    ]);
    const numericMatches = responseText.match(/[-+]?\d+(?:[.,]\d+)?/g) || [];
    const outputNumber = firstFiniteNumber([
      ctx.diPolicyOutput?.numericValue,
      numericMatches[0]?.replace(",", "."),
    ]);

    const baseContext = {
      explicitDocRef: {
        present: Boolean(ctx.explicitDocRef),
        id:
          String(ctx.diPolicyContext?.explicitDocRefId || "").trim() ||
          (evidenceDocIds.length === 1 ? evidenceDocIds[0] : null),
        exactMatch:
          ctx.diPolicyContext?.explicitDocRefExactMatch === true
            ? true
            : false,
      },
      chosenDocs: {
        count: evidenceDocIds.length,
        allMatchExplicit: Boolean(ctx.explicitDocRef)
          ? evidenceDocIds.length <= 1
          : true,
      },
      state: {
        activeDocRef: {
          present: Boolean(ctx.explicitDocRef),
          matchesExplicit: true,
        },
      },
      docLock: {
        active: Boolean(ctx.docLockEnabled),
        docId:
          String(ctx.diPolicyContext?.docLockDocId || "").trim() ||
          (evidenceDocIds.length === 1 ? evidenceDocIds[0] : null),
        docExists:
          ctx.diPolicyContext?.docLockDocExists === false ? false : true,
      },
      queryFilenameRef: {
        present: Boolean(ctx.explicitDocRef),
        matchInCorpus:
          ctx.diPolicyContext?.queryFilenameMatchInCorpus === false
            ? false
            : true,
        partialMatch:
          ctx.diPolicyContext?.queryFilenamePartialMatch === true ? true : false,
        id:
          String(ctx.diPolicyContext?.queryFilenameId || "").trim() ||
          (evidenceDocIds.length === 1 ? evidenceDocIds[0] : null),
        candidates: asArray(ctx.diPolicyContext?.queryFilenameCandidates),
      },
      currentQuery: {
        filenameRef: ctx.explicitDocRef ? "explicit" : null,
      },
      conversationContinued:
        ctx.diPolicyContext?.conversationContinued === true ? true : false,
      queryIntent:
        String(ctx.diPolicyContext?.queryIntent || ctx.intentFamily || "")
          .trim()
          .toLowerCase() || "unknown",
      queryBroadScope: Boolean(ctx.discoveryMode),
      wrongDocConfidence: Number(ctx.diPolicyContext?.wrongDocConfidence ?? 0),
      similarFilenames: asArray(ctx.diPolicyContext?.similarFilenames),
      queryDocType:
        ctx.diPolicyContext?.queryDocType !== undefined
          ? ctx.diPolicyContext?.queryDocType
          : null,
      answerDocType:
        ctx.diPolicyContext?.answerDocType !== undefined
          ? ctx.diPolicyContext?.answerDocType
          : null,
      crossDocPermission:
        ctx.diPolicyContext?.crossDocPermission === true ? true : false,
      docVersionSuffixes: asArray(ctx.diPolicyContext?.docVersionSuffixes),
      versionRef:
        ctx.diPolicyContext?.versionRef !== undefined
          ? ctx.diPolicyContext?.versionRef
          : null,
      dateSuffixedDocs: asArray(ctx.diPolicyContext?.dateSuffixedDocs),
      dateRef:
        ctx.diPolicyContext?.dateRef !== undefined
          ? ctx.diPolicyContext?.dateRef
          : null,
      openTab: {
        docId:
          ctx.diPolicyContext?.openTabDocId !== undefined
            ? ctx.diPolicyContext?.openTabDocId
            : null,
      },
      queryDocRef:
        ctx.diPolicyContext?.queryDocRef !== undefined
          ? ctx.diPolicyContext?.queryDocRef
          : null,
      sheetTabRef: {
        present: ctx.diPolicyContext?.sheetTabRefPresent === true,
        name:
          ctx.diPolicyContext?.sheetTabRefName !== undefined
            ? ctx.diPolicyContext?.sheetTabRefName
            : null,
      },
      slideRef: {
        present: ctx.diPolicyContext?.slideRefPresent === true,
        number:
          ctx.diPolicyContext?.slideRefNumber !== undefined
            ? ctx.diPolicyContext?.slideRefNumber
            : null,
      },
      docAliasUsed: ctx.diPolicyContext?.docAliasUsed === true,
      resolvedDocId:
        ctx.diPolicyContext?.resolvedDocId !== undefined
          ? ctx.diPolicyContext?.resolvedDocId
          : null,
      expectedDocId:
        ctx.diPolicyContext?.expectedDocId !== undefined
          ? ctx.diPolicyContext?.expectedDocId
          : null,
      editOperations: asArray(ctx.diPolicyContext?.editOperations),
      impliedDocRef: {
        confidence: Number(ctx.diPolicyContext?.impliedDocRefConfidence ?? 0),
      },
      requestedDocs: asArray(ctx.diPolicyContext?.requestedDocs),
      currentWorkspaceId:
        ctx.diPolicyContext?.currentWorkspaceId !== undefined
          ? ctx.diPolicyContext?.currentWorkspaceId
          : null,
      attachedDocsOnly: ctx.diPolicyContext?.attachedDocsOnly === true,
      attachedDocIds: asArray(ctx.diPolicyContext?.attachedDocIds),
      explicitDocsResolved: asArray(ctx.diPolicyContext?.explicitDocsResolved),
      matchedEntities: asArray(ctx.diPolicyContext?.matchedEntities),
      metricRef: asRecord(ctx.diPolicyContext?.metricRef),
      pronounRef: asRecord(ctx.diPolicyContext?.pronounRef),
      conversationHistory: asRecord(ctx.diPolicyContext?.conversationHistory),
      docVersions: asRecord(ctx.diPolicyContext?.docVersions),
      currencies: asArray(ctx.diPolicyContext?.currencies),
      matchedDocs: asArray(ctx.diPolicyContext?.matchedDocs),
      narrowingSignals: asArray(ctx.diPolicyContext?.narrowingSignals),
      retrievedPassages: asRecord(ctx.diPolicyContext?.retrievedPassages),
      nameRef: asRecord(ctx.diPolicyContext?.nameRef),
      timeSensitiveQuery: ctx.diPolicyContext?.timeSensitiveQuery === true,
      periodRef:
        ctx.diPolicyContext?.periodRef !== undefined
          ? ctx.diPolicyContext?.periodRef
          : null,
      availablePeriods: asArray(ctx.diPolicyContext?.availablePeriods),
      abbreviationRef: asRecord(ctx.diPolicyContext?.abbreviationRef),
      sectionRef: asRecord(ctx.diPolicyContext?.sectionRef),
      comparisonIntent: ctx.diPolicyContext?.comparisonIntent === true,
      comparisonTargets: asArray(ctx.diPolicyContext?.comparisonTargets),
      subjectiveQualifier: asRecord(ctx.diPolicyContext?.subjectiveQualifier),
      thresholdDefined: ctx.diPolicyContext?.thresholdDefined === true,
      columnRef: asRecord(ctx.diPolicyContext?.columnRef),
      tableRef:
        ctx.diPolicyContext?.tableRef !== undefined
          ? ctx.diPolicyContext?.tableRef
          : null,
      queryLang:
        ctx.diPolicyContext?.queryLang !== undefined
          ? ctx.diPolicyContext?.queryLang
          : null,
      docLang:
        ctx.diPolicyContext?.docLang !== undefined
          ? ctx.diPolicyContext?.docLang
          : null,
      translationAmbiguity:
        ctx.diPolicyContext?.translationAmbiguity === true,
      conditionalClause: asRecord(ctx.diPolicyContext?.conditionalClause),
      conditionStatus:
        ctx.diPolicyContext?.conditionStatus !== undefined
          ? ctx.diPolicyContext?.conditionStatus
          : null,
      aggregationAmbiguity:
        ctx.diPolicyContext?.aggregationAmbiguity === true,
      aggregationLevel:
        ctx.diPolicyContext?.aggregationLevel !== undefined
          ? ctx.diPolicyContext?.aggregationLevel
          : null,
      docTypeRef: asRecord(ctx.diPolicyContext?.docTypeRef),
      disambiguators: asArray(ctx.diPolicyContext?.disambiguators),
      pageRef: asRecord(ctx.diPolicyContext?.pageRef),
      formulaRef: asRecord(ctx.diPolicyContext?.formulaRef),
      booleanQuestion: ctx.diPolicyContext?.booleanQuestion === true,
      requiredContextMissing: ctx.diPolicyContext?.requiredContextMissing === true,
      relativeRef: asRecord(ctx.diPolicyContext?.relativeRef),
      validAnswerCount: Number(ctx.diPolicyContext?.validAnswerCount ?? 0),
      disambiguationNeeded: ctx.diPolicyContext?.disambiguationNeeded === true,
      unitAmbiguity: ctx.diPolicyContext?.unitAmbiguity === true,
      unitRef:
        ctx.diPolicyContext?.unitRef !== undefined
          ? ctx.diPolicyContext?.unitRef
          : null,
      partyRoleRef: asRecord(ctx.diPolicyContext?.partyRoleRef),
      statusRef: asRecord(ctx.diPolicyContext?.statusRef),
      dataGranularity: asRecord(ctx.diPolicyContext?.dataGranularity),
      requestedGranularity:
        ctx.diPolicyContext?.requestedGranularity !== undefined
          ? ctx.diPolicyContext?.requestedGranularity
          : null,
      negation: asRecord(ctx.diPolicyContext?.negation),
      chartSource: asRecord(ctx.diPolicyContext?.chartSource),
      tableSource: asRecord(ctx.diPolicyContext?.tableSource),
      valuesConflict: ctx.diPolicyContext?.valuesConflict === true,
      implicitFilter: asRecord(ctx.diPolicyContext?.implicitFilter),
      explicitFilter:
        ctx.diPolicyContext?.explicitFilter !== undefined
          ? ctx.diPolicyContext?.explicitFilter
          : null,
      geoRef: asRecord(ctx.diPolicyContext?.geoRef),
      debugMode: ctx.diPolicyContext?.debugMode === true,
      metadataRequested: ctx.diPolicyContext?.metadataRequested === true,
      systemMessage: ctx.diPolicyContext?.systemMessage === true,
      evidenceStrength:
        ctx.diPolicyContext?.evidenceStrength !== undefined
          ? ctx.diPolicyContext?.evidenceStrength
          : "strong",
      synthesizedDocCount: Number(ctx.diPolicyContext?.synthesizedDocCount ?? 0),
      docNameMap: asRecord(ctx.diPolicyContext?.docNameMap),
      docVersionsLatest: Number(ctx.diPolicyContext?.docVersionsLatest ?? 0),
      conversionRequested: ctx.diPolicyContext?.conversionRequested === true,
      calculationRequested: ctx.diPolicyContext?.calculationRequested === true,
      arithmeticCheck: ctx.diPolicyContext?.arithmeticCheck === true,
      precisionSignificant:
        ctx.diPolicyContext?.precisionSignificant === true,
      timeConversionRequested:
        ctx.diPolicyContext?.timeConversionRequested === true,
      currencyConversionRequested:
        ctx.diPolicyContext?.currencyConversionRequested === true,
      queryCurrencyRef:
        ctx.diPolicyContext?.queryCurrencyRef !== undefined
          ? ctx.diPolicyContext?.queryCurrencyRef
          : null,
      explicitVersionRef:
        ctx.diPolicyContext?.explicitVersionRef !== undefined
          ? ctx.diPolicyContext?.explicitVersionRef
          : null,
      dateRefCandidates: asArray(ctx.diPolicyContext?.dateRefCandidates),
      retrievedDocs:
        asArray(ctx.diPolicyContext?.retrievedDocs).length > 0
          ? asArray(ctx.diPolicyContext?.retrievedDocs)
          : evidenceDocIds,
    };

    const sourceButtonsHasDuplicateDocIds =
      sourceButtons.length > 1 &&
      new Set(
        sourceButtons
          .map((button) => String(button.docId || "").trim())
          .filter(Boolean),
      ).size < sourceButtons.length;
    const explicitDocId = String(baseContext.explicitDocRef.id || "").trim();
    const containsNonExplicit =
      Boolean(explicitDocId) &&
      sourceButtons.some(
        (button) => String(button.docId || "").trim() !== explicitDocId,
      );
    const sourceButtonsOrderedByRelevance = sourceButtons.every(
      (button, index, list) => {
        const current = Number(button.relevanceScore ?? button.score ?? 0);
        const next = Number((list[index + 1] || {}).relevanceScore ?? 0);
        if (index === list.length - 1) return true;
        if (!Number.isFinite(current) || !Number.isFinite(next)) return true;
        return current >= next;
      },
    );

    const currencyValues =
      responseText.match(/(?:R\$|\$|€|£)\s*[-+]?\d[\d.,]*/g)?.map((raw) => {
        const digits = raw.replace(/\D+/g, "");
        return {
          raw,
          digitCount: digits.length,
        };
      }) || [];
    const percentValues = (
      responseText.match(/[-+]?\d[\d.,]*\s*%/g) || []
    ).map((raw) => ({
      raw,
      symbolPresent: raw.includes("%"),
    }));
    const citationFormats: string[] = [];
    if (citations.length > 0) citationFormats.push("bracket");
    if (/\(\s*source\s*:/i.test(responseText)) {
      citationFormats.push("parenthetical");
    }
    if (/\b(?:sources|fontes|fuentes)\s*:/i.test(responseText)) {
      citationFormats.push("section_label");
    }
    const sourceSectionMatch = responseText.match(
      /\b(?:sources|fontes|fuentes)\s*:/i,
    );
    const sourcesSectionPosition =
      sourceSectionMatch && sourceSectionMatch.index !== undefined
        ? sourceSectionMatch.index >= responseText.length * 0.6
          ? "end"
          : "middle"
        : null;
    const qualifyingLanguage =
      /\b(approximately|approx\.?|around|about|roughly|estimate|estimated|may|might|could)\b/i.test(
        responseText,
      );

    const baseOutput = {
      text: responseText,
      charCount: responseText.length,
      sentenceCount,
      citationCount: citations.length,
      hasCurrency: currencyValues.length > 0,
      currencyValues,
      currencySymbol:
        firstCurrencyMatch?.match(/R\$|\$|€|£/)?.[0] ?? null,
      numberFormat: {
        separatorConvention:
          /\d{1,3}\.\d{3},\d{2}/.test(responseText) &&
          !/\d{1,3},\d{3}\.\d{2}/.test(responseText)
            ? "pt_br"
            : /\d{1,3},\d{3}\.\d{2}/.test(responseText)
              ? "en_us"
              : "unknown",
      },
      percentValues,
      percentValue: parsedPercentValue,
      unitPresent:
        /\b(?:kg|g|mg|lb|lbs|km|mi|miles|hours?|hrs?|days?|months?|years?|%|usd|eur|brl|gbp)\b/i.test(
          responseText,
        ) || /(R\$|\$|€|£)/.test(responseText),
      unit:
        firstCurrencyMatch?.match(/R\$|\$|€|£/)?.[0] ??
        responseText.match(/\b(?:kg|g|mg|lb|lbs|km|mi|hours?|days?|months?|years?)\b/i)?.[0] ??
        null,
      numericValue: outputNumber,
      approximationMarker:
        /\b(approximately|approx\.?|around|about|roughly|~)\b/i.test(
          responseText,
        ),
      dateValue: {
        day: toFiniteNumber(ctx.diPolicyOutput?.dateDay),
        month: toFiniteNumber(ctx.diPolicyOutput?.dateMonth),
      },
      signPositive:
        outputNumber !== null ? outputNumber > 0 : !/\(-?\d/.test(responseText),
      periodLabel:
        ctx.diPolicyOutput?.periodLabel !== undefined
          ? ctx.diPolicyOutput.periodLabel
          : null,
      rawDigitCount: (responseText.match(/\d/g) || []).length,
      digitSequence:
        responseText.match(/\d+/g)?.join("") ||
        String(ctx.diPolicyOutput?.digitSequence || ""),
      digitSet: Array.from(
        new Set((responseText.match(/\d/g) || []).map((value) => String(value))),
      ).sort(),
      tableRef: {
        row:
          ctx.diPolicyOutput?.tableRow !== undefined
            ? ctx.diPolicyOutput.tableRow
            : null,
        column:
          ctx.diPolicyOutput?.tableColumn !== undefined
            ? ctx.diPolicyOutput.tableColumn
            : null,
      },
      statedParts: asArray(ctx.diPolicyOutput?.statedParts),
      statedTotal:
        toFiniteNumber(ctx.diPolicyOutput?.statedTotal) ?? outputNumber ?? 0,
      scaleLabels: asArray(ctx.diPolicyOutput?.scaleLabels),
      scaleLabelExplicit: ctx.diPolicyOutput?.scaleLabelExplicit === true,
      value:
        ctx.diPolicyOutput?.value !== undefined ? ctx.diPolicyOutput.value : null,
      scientificNotation: asRecord(ctx.diPolicyOutput?.scientificNotation),
      decimalEquivalent:
        toFiniteNumber(ctx.diPolicyOutput?.decimalEquivalent) ??
        toFiniteNumber(numericMatches[0]?.replace(",", ".")),
      fractionValue: toFiniteNumber(ctx.diPolicyOutput?.fractionValue),
      trailingZeros: Number(ctx.diPolicyOutput?.trailingZeros ?? 0),
      indexBase: toFiniteNumber(ctx.diPolicyOutput?.indexBase),
      timeUnit:
        ctx.diPolicyOutput?.timeUnit !== undefined ? ctx.diPolicyOutput.timeUnit : null,
      isRate: ctx.diPolicyOutput?.isRate === true,
      valueSemantic:
        ctx.diPolicyOutput?.valueSemantic !== undefined
          ? ctx.diPolicyOutput.valueSemantic
          : null,
      currency:
        ctx.diPolicyOutput?.currency !== undefined
          ? ctx.diPolicyOutput.currency
          : firstCurrencyMatch?.match(/R\$|\$|€|£/)?.[0] ?? null,
      isInterpolated: ctx.diPolicyOutput?.isInterpolated === true,
      interpolationMarker:
        ctx.diPolicyOutput?.interpolationMarker === true ||
        /\b(interpolated|estimated|projected|approx(?:imately)?)\b/i.test(
          responseText,
        ),
      treatedAsPercentChange:
        ctx.diPolicyOutput?.treatedAsPercentChange === true,
      yearType:
        ctx.diPolicyOutput?.yearType !== undefined
          ? ctx.diPolicyOutput.yearType
          : null,
      numberWord: asRecord(ctx.diPolicyOutput?.numberWord),
      changeDirection:
        ctx.diPolicyOutput?.changeDirection !== undefined
          ? ctx.diPolicyOutput.changeDirection
          : null,
      containsInlineSources:
        /\b(?:sources|fontes|fuentes)\s*:/i.test(responseText) ||
        /\.(pdf|xlsx?|pptx?|docx?|csv|txt|jpg|jpeg|png)\b/i.test(responseText),
      citedDocs:
        asArray(ctx.diPolicyOutput?.citedDocs).length > 0
          ? asArray(ctx.diPolicyOutput?.citedDocs)
          : evidenceDocIds,
      pageRefs,
      sourceDocs: derivedSourceDocs,
      citationFormats,
      sourcesSectionPosition,
      sourcesSectionPresent: Boolean(sourceSectionMatch),
      sectionRefs: asArray(ctx.diPolicyOutput?.sectionRefs),
      attributions: asArray(ctx.diPolicyOutput?.attributions),
      qualifyingLanguage,
      citedDocCount:
        asArray(ctx.diPolicyOutput?.citedDocs).length > 0
          ? asArray(ctx.diPolicyOutput?.citedDocs).length
          : evidenceDocIds.length,
      citedVersion:
        toFiniteNumber(ctx.diPolicyOutput?.citedVersion) ??
        Number.MIN_SAFE_INTEGER,
      distinctDocsReferenced:
        asArray(ctx.diPolicyOutput?.distinctDocsReferenced).length > 0
          ? asArray(ctx.diPolicyOutput?.distinctDocsReferenced).length
          : new Set(
              derivedSourceDocs.map((doc) => String(extractComparable(doc))),
            ).size,
      sourceSheet:
        ctx.diPolicyOutput?.sourceSheet !== undefined
          ? ctx.diPolicyOutput.sourceSheet
          : null,
      sourceSlide:
        ctx.diPolicyOutput?.sourceSlide !== undefined
          ? ctx.diPolicyOutput.sourceSlide
          : null,
      facts: asArray(ctx.diPolicyOutput?.facts),
      attachments: asArray(ctx.diPolicyOutput?.attachments),
      matchesPattern: (pattern: unknown, flags?: unknown) =>
        diMatchesPattern(responseText, pattern, flags),
    };

    const baseSource = {
      pageCount: Number(ctx.diPolicySource?.pageCount ?? 0),
      sectionIndex: sourceSectionIndex,
      matchingValue: asRecord(ctx.diPolicySource?.matchingValue),
      currencySymbol:
        ctx.diPolicySource?.currencySymbol !== undefined
          ? ctx.diPolicySource.currencySymbol
          : null,
      numberFormat: asRecord(ctx.diPolicySource?.numberFormat),
      percentSymbolPresent:
        ctx.diPolicySource?.percentSymbolPresent === true ? true : false,
      percentValue: toFiniteNumber(ctx.diPolicySource?.percentValue),
      unitPresent: ctx.diPolicySource?.unitPresent === true,
      unit:
        ctx.diPolicySource?.unit !== undefined ? ctx.diPolicySource.unit : null,
      numericValue: toFiniteNumber(ctx.diPolicySource?.numericValue),
      parentheticalNegative:
        ctx.diPolicySource?.parentheticalNegative === true,
      periodLabel:
        ctx.diPolicySource?.periodLabel !== undefined
          ? ctx.diPolicySource.periodLabel
          : null,
      rawDigitCount: Number(ctx.diPolicySource?.rawDigitCount ?? 0),
      digitSequence:
        ctx.diPolicySource?.digitSequence !== undefined
          ? ctx.diPolicySource.digitSequence
          : null,
      digitSet:
        asArray(ctx.diPolicySource?.digitSet).length > 0
          ? asArray(ctx.diPolicySource?.digitSet)
          : [],
      tableRef: asRecord(ctx.diPolicySource?.tableRef),
      value:
        ctx.diPolicySource?.value !== undefined ? ctx.diPolicySource.value : null,
      scientificNotation: asRecord(ctx.diPolicySource?.scientificNotation),
      isFraction: ctx.diPolicySource?.isFraction === true,
      fractionValue: toFiniteNumber(ctx.diPolicySource?.fractionValue),
      trailingZeros: Number(ctx.diPolicySource?.trailingZeros ?? 0),
      indexBase: toFiniteNumber(ctx.diPolicySource?.indexBase),
      timeUnit:
        ctx.diPolicySource?.timeUnit !== undefined ? ctx.diPolicySource.timeUnit : null,
      isRate: ctx.diPolicySource?.isRate === true,
      valueSemantic:
        ctx.diPolicySource?.valueSemantic !== undefined
          ? ctx.diPolicySource.valueSemantic
          : null,
      currency:
        ctx.diPolicySource?.currency !== undefined
          ? ctx.diPolicySource.currency
          : null,
      isPercentagePoint: ctx.diPolicySource?.isPercentagePoint === true,
      yearType:
        ctx.diPolicySource?.yearType !== undefined
          ? ctx.diPolicySource.yearType
          : null,
      changeDirection:
        ctx.diPolicySource?.changeDirection !== undefined
          ? ctx.diPolicySource.changeDirection
          : null,
      docContaining: (fact: unknown) => {
        const map = asRecord(ctx.diPolicySource?.docContainingMap);
        const key = String(fact ?? "");
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
      },
    };

    const baseAttachments = {
      source_buttons: {
        count:
          sourceButtons.length > 0
            ? sourceButtons.length
            : Number(ctx.sourceButtonsCount ?? 0),
        containsNonExplicit,
        hasDuplicateDocIds: sourceButtonsHasDuplicateDocIds,
        isOrderedByRelevance: sourceButtonsOrderedByRelevance,
        any: (predicate: unknown) => diAny(sourceButtons, predicate),
      },
      messageActions: {
        count: messageActions.length,
      },
    };

    const baseConfig = {
      limits: {
        maxSourcesButtonsHard:
          Number(
            ctx.diPolicyConfig?.limits?.maxSourcesButtonsHard ??
              qualityBank?.config?.limits?.maxSourcesButtonsHard ??
              8,
          ) || 8,
      },
    };

    const scope: DocumentIntelligenceScope = {
      answerMode: normalizedMode,
      context: mergeDeep(baseContext, ctx.diPolicyContext),
      output: mergeDeep(baseOutput, ctx.diPolicyOutput),
      attachments: mergeDeep(baseAttachments, ctx.diPolicyAttachments),
      source: mergeDeep(baseSource, ctx.diPolicySource),
      config: mergeDeep(baseConfig, ctx.diPolicyConfig),
    };

    return scope;
  }

  private evaluateDocumentIntelligenceRuleExpression(
    expression: string,
    scope: DocumentIntelligenceScope,
  ): { triggered: boolean; error?: string } {
    const normalizedExpression = normalizeRuleExpression(expression);
    if (!normalizedExpression) return { triggered: false };

    try {
      return {
        triggered: evaluateRuleBooleanExpression({
          normalizedExpression,
          scope: {
            context: scope.context,
            output: scope.output,
            attachments: scope.attachments,
            source: scope.source,
            config: scope.config,
            answerMode: scope.answerMode,
          },
          helpers: {
            diAny,
            diCount,
            diDistinctCount,
            diIn,
            diStartsWith,
            diMatchesPattern,
            diIncludes,
            diSum,
            diLog10,
          },
        }),
      };
    } catch (error) {
      return {
        triggered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private runDocumentIntelligenceRuleBank(
    bankId: string,
    bank: DocumentIntelligenceQualityBank,
    scope: DocumentIntelligenceScope,
  ): { failures: QualityGateResult[]; errors: string[] } {
    const failures: QualityGateResult[] = [];
    const errors: string[] = [];
    const rules = Array.isArray(bank.rules) ? bank.rules : [];

    for (const rule of rules) {
      const ruleId = String(rule?.id || "").trim();
      const check = String(rule?.check || "").trim();
      if (!ruleId || !check) continue;

      const evaluation = this.evaluateDocumentIntelligenceRuleExpression(
        check,
        scope,
      );
      if (evaluation.error) {
        errors.push(`${ruleId}: ${evaluation.error}`);
        continue;
      }
      if (!evaluation.triggered) continue;

      failures.push({
        gateName: ruleId,
        passed: false,
        score: 0,
        actionOnFail: String(rule?.failureAction || "").trim() || undefined,
        issues: [
          String(rule?.trigger || "").trim() || "Document intelligence rule triggered.",
          `Rule check: ${check}`,
        ],
        sourceBankId: bank._meta?.id || bankId,
      });
    }

    return { failures, errors };
  }

  private runDocumentIntelligencePolicyGates(
    response: string,
    ctx: QualityGateContext,
    qualityBank: QualityGatesBank | null,
  ): QualityGateResult[] {
    const results: QualityGateResult[] = [];
    const responseText = String(response || "");
    const domain = this.resolveDomainForQuality(ctx, responseText);
    const scope = this.buildDocumentIntelligenceScope(response, ctx, qualityBank);

    const sourcePolicyBank =
      this.documentIntelligenceBanks.getQualityGateBank(
        "source_policy",
      ) as DocumentIntelligenceQualityBank | null;
    if (sourcePolicyBank?.config?.enabled) {
      const sourcePolicy = this.runDocumentIntelligenceRuleBank(
        "source_policy",
        sourcePolicyBank,
        scope,
      );
      results.push(...sourcePolicy.failures);
      const inNavMode =
        String(ctx.answerMode || "").trim().toLowerCase() === "nav_pills";
      const navOnlyFailures = sourcePolicy.failures.filter((failure) =>
        failure.gateName.startsWith("SRC_"),
      );
      const hasTableCitation =
        /\|/.test(responseText) && /\[[^\]]+\]/.test(responseText);
      const failed =
        inNavMode && (navOnlyFailures.length > 0 || hasTableCitation);
      results.push({
        gateName: "source_policy_navigation_mode",
        passed: !failed,
        score: failed ? 0 : 1,
        issues: failed
          ? [
              ...(hasTableCitation
                ? ["Navigation mode forbids citations inside tables."]
                : []),
              ...navOnlyFailures.flatMap((failure) => failure.issues || []),
            ]
          : sourcePolicy.errors.length > 0
            ? sourcePolicy.errors
            : undefined,
        sourceBankId: sourcePolicyBank._meta?.id || "source_policy",
      });
    }

    const numericIntegrityBank =
      this.documentIntelligenceBanks.getQualityGateBank(
        "numeric_integrity",
      ) as DocumentIntelligenceQualityBank | null;
    if (numericIntegrityBank?.config?.enabled) {
      const numericIntegrity = this.runDocumentIntelligenceRuleBank(
        "numeric_integrity",
        numericIntegrityBank,
        scope,
      );
      results.push(...numericIntegrity.failures);
      results.push({
        gateName: "numeric_integrity_currency_consistency",
        passed: numericIntegrity.failures.length === 0,
        score: numericIntegrity.failures.length === 0 ? 1 : 0.4,
        issues:
          numericIntegrity.failures.length > 0
            ? numericIntegrity.failures
                .map((failure) => failure.issues || [])
                .flat()
            : numericIntegrity.errors.length > 0
              ? numericIntegrity.errors
              : undefined,
        sourceBankId: numericIntegrityBank._meta?.id || "numeric_integrity",
      });

      const strictNumericDomains = new Set([
        "billing",
        "banking",
        "housing",
        "hr_payroll",
        "medical",
      ]);
      if (
        strictNumericDomains.has(domain) &&
        detectMissingUnitWithNumber(responseText)
      ) {
        results.push({
          gateName: "numeric_integrity_domain_unit_required",
          passed: false,
          score: 0.25,
          issues: [
            `Numeric output for ${domain} requires explicit units/currency context.`,
          ],
          sourceBankId: numericIntegrityBank._meta?.id || "numeric_integrity",
        });
      }

      const equation = responseText.match(
        /(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/,
      );
      if (equation) {
        const lhs = Number(equation[1]) + Number(equation[2]);
        const rhs = Number(equation[3]);
        const reconciles =
          Number.isFinite(lhs) &&
          Number.isFinite(rhs) &&
          Math.abs(lhs - rhs) < 1e-9;
        results.push({
          gateName: "numeric_integrity_totals_reconciliation",
          passed: reconciles,
          score: reconciles ? 1 : 0.1,
          issues: reconciles
            ? undefined
            : [
                "Stated numeric equation does not reconcile in the response output.",
              ],
          sourceBankId: numericIntegrityBank._meta?.id || "numeric_integrity",
        });
      }
    }

    const wrongDocLockBank =
      this.documentIntelligenceBanks.getQualityGateBank(
        "wrong_doc_lock",
      ) as DocumentIntelligenceQualityBank | null;
    if (wrongDocLockBank?.config?.enabled) {
      const wrongDoc = this.runDocumentIntelligenceRuleBank(
        "wrong_doc_lock",
        wrongDocLockBank,
        scope,
      );
      results.push(...wrongDoc.failures);
      const explicitDocLockConflict = Boolean(ctx.docLockEnabled && ctx.discoveryMode);
      const failed = explicitDocLockConflict || wrongDoc.failures.length > 0;
      results.push({
        gateName: "wrong_doc_lock_enforcement",
        passed: !failed,
        score: failed ? 0 : 1,
        issues: failed
          ? [
              ...(explicitDocLockConflict
                ? ["Doc lock is enabled while discovery mode is requested."]
                : []),
              ...wrongDoc.failures.map((failure) => failure.issues || []).flat(),
              ...wrongDoc.errors,
            ]
          : undefined,
        sourceBankId: wrongDocLockBank._meta?.id || "wrong_doc_lock",
      });
    }

    const ambiguityBank = this.documentIntelligenceBanks.getQualityGateBank(
      "ambiguity_questions",
    ) as DocumentIntelligenceQualityBank | null;
    if (ambiguityBank?.config?.enabled) {
      const ambiguity = this.runDocumentIntelligenceRuleBank(
        "ambiguity_questions",
        ambiguityBank,
        scope,
      );
      results.push(...ambiguity.failures);
      const questionMarks = (responseText.match(/\?/g) || []).length;
      const tooManyClarifiers =
        Boolean(ctx.requiresClarification) && questionMarks > 1;
      const failed = tooManyClarifiers || ambiguity.failures.length > 0;
      results.push({
        gateName: "ambiguity_single_question_policy",
        passed: !failed,
        score: failed ? 0.3 : 1,
        issues: failed
          ? [
              ...(tooManyClarifiers
                ? ["Clarification response violates single-question policy."]
                : []),
              ...ambiguity.failures.map((failure) => failure.issues || []).flat(),
              ...ambiguity.errors,
            ]
          : undefined,
        sourceBankId: ambiguityBank._meta?.id || "ambiguity_questions",
      });
    }

    if (new Set(["identity", "tax", "banking"]).has(domain)) {
      const piiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/,
        /\b(?:cpf|cnpj|tax\s*id|tin)\s*[:#-]?\s*[A-Z0-9./-]{8,20}\b/i,
        /\b(?:passport|passaporte|license|licenca|cnh|rg)\s*(?:no\.?|number|#)?\s*[:#-]?\s*[A-Z0-9-]{6,20}\b/i,
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
      ];
      const hasUnredactedPii = piiPatterns.some((pattern) =>
        pattern.test(responseText),
      );
      if (hasUnredactedPii) {
        results.push({
          gateName: "redaction_default_pii_identity_tax_banking",
          passed: false,
          score: 0,
          issues: [
            `PII detected in ${domain} response; default behavior requires redaction.`,
          ],
        });
      }
    }

    if (domain === "medical") {
      const hardDiagnosisLanguage =
        /\b(definitive diagnosis|you have|you are diagnosed|prescribe(?:d)?\s+\w+)\b/i.test(
          responseText,
        );
      const hasSafetyQualifier =
        /\b(consult|seek|professional|doctor|physician|medical advice|nao substitui|procure)\b/i.test(
          responseText,
        );
      if (hardDiagnosisLanguage && !hasSafetyQualifier) {
        results.push({
          gateName: "medical_safety_boundaries",
          passed: false,
          score: 0.1,
          issues: [
            "Medical response contains diagnosis/prescription language without safety qualifier.",
          ],
        });
      }
    }

    return results;
  }

  private runDomainSpecificOverrideGates(
    response: string,
    ctx: QualityGateContext,
  ): QualityGateResult[] {
    const results: QualityGateResult[] = [];
    const domain = this.resolveDomainForQuality(ctx, response);
    const supportedDomains = new Set([
      "finance",
      "legal",
      "medical",
      "ops",
      "accounting",
      "banking",
      "billing",
      "education",
      "housing",
      "hr_payroll",
      "identity",
      "insurance",
      "tax",
      "travel",
    ]);
    if (!supportedDomains.has(domain)) {
      return results;
    }

    if (
      typeof this.documentIntelligenceBanks.getValidationPolicies === "function"
    ) {
      const validationBank =
        this.documentIntelligenceBanks.getValidationPolicies(
          domain as ValidationDomainArg,
        );
      if (
        validationBank?.config?.enabled &&
        Array.isArray(validationBank?.policies)
      ) {
        const checks = new Set(
          validationBank.policies
            .map((policy: unknown) => String((policy as Record<string, unknown>)?.check || "").trim())
            .filter(Boolean),
        );

        if (
          checks.has("units_present_for_numeric") &&
          detectMissingUnitWithNumber(response)
        ) {
          results.push({
            gateName: "domain_validation_units_present_for_numeric",
            passed: false,
            score: 0.2,
            issues: [
              "Domain validation policy requires units for numeric values.",
            ],
            sourceBankId: validationBank?._meta?.id,
          });
        }

        if (checks.has("no_diagnosis_or_treatment_advice")) {
          const diagnosisLike =
            /\b(diagnosis|diagnose|treatment|prescribe|medication recommendation)\b/i.test(
              response,
            );
          if (diagnosisLike) {
            results.push({
              gateName: "domain_validation_no_diagnosis_or_treatment_advice",
              passed: false,
              score: 0,
              issues: [
                "Domain validation policy forbids diagnosis or treatment recommendation language.",
              ],
              sourceBankId: validationBank?._meta?.id,
            });
          }
        }
      }
    }

    if (
      typeof this.documentIntelligenceBanks.getRedactionAndSafetyRules ===
      "function"
    ) {
      const safetyBank =
        this.documentIntelligenceBanks.getRedactionAndSafetyRules(
          domain as SafetyDomainArg,
        );
      if (
        safetyBank?.config?.enabled &&
        Array.isArray(safetyBank?.redactionRules)
      ) {
        for (const rule of safetyBank.redactionRules) {
          const pattern = String(rule?.pattern || "").trim();
          if (!pattern) continue;
          try {
            if (new RegExp(pattern, "i").test(response)) {
              results.push({
                gateName: "domain_redaction_rule_violation",
                passed: false,
                score: 0,
                issues: [
                  `Domain redaction policy matched sensitive pattern (${String(rule?.id || "rule")}).`,
                ],
                sourceBankId: safetyBank?._meta?.id,
              });
              break;
            }
          } catch {
            // ignore invalid regex in bank
          }
        }
      }
    }

    return results;
  }

  private resolveDomainForQuality(
    ctx: QualityGateContext,
    responseText: string,
  ): string {
    const hinted = normalizeDomain(ctx.domainHint);
    if (hinted) return hinted;

    const lower = responseText.toLowerCase();
    const domainSignals: Array<{ domain: string; patterns: RegExp[] }> = [
      {
        domain: "medical",
        patterns: [
          /\bdiagnosis\b/i,
          /\bmedication\b/i,
          /\blab\b/i,
          /\bpaciente\b/i,
        ],
      },
      {
        domain: "identity",
        patterns: [
          /\bpassport\b/i,
          /\bdriver license\b/i,
          /\bcnh\b/i,
          /\bproof of address\b/i,
        ],
      },
      {
        domain: "tax",
        patterns: [/\btax\b/i, /\birpf\b/i, /\bdarf\b/i, /\bimposto\b/i],
      },
      {
        domain: "banking",
        patterns: [/\bbank statement\b/i, /\bloan\b/i, /\bextrato bancario\b/i],
      },
      {
        domain: "billing",
        patterns: [/\binvoice\b/i, /\bbill\b/i, /\bfatura\b/i, /\bboleto\b/i],
      },
      {
        domain: "housing",
        patterns: [/\blease\b/i, /\brent\b/i, /\biptu\b/i, /\bproperty\b/i],
      },
      {
        domain: "hr_payroll",
        patterns: [
          /\bpayroll\b/i,
          /\bsalary\b/i,
          /\bholerite\b/i,
          /\bbenefits?\b/i,
        ],
      },
    ];
    for (const signal of domainSignals) {
      if (signal.patterns.some((pattern) => pattern.test(lower))) {
        return signal.domain;
      }
    }
    return "general";
  }

  async runGates(
    response: string,
    context: unknown,
  ): Promise<QualityRunResult> {
    const ctx = (context || {}) as QualityGateContext;
    const results: QualityGateResult[] = [];

    const qualityBank = this.getQualityBank();
    const strictFailClosed = this.isStrictFailClosedMode(qualityBank);
    results.push(
      ...this.validateRequiredHookBanks(qualityBank, strictFailClosed),
    );

    const configuredGateOrder = Array.isArray(qualityBank?.gateOrder)
      ? qualityBank!
          .gateOrder!.map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];

    const gateOrder = configuredGateOrder.length
      ? configuredGateOrder
      : [...DEFAULT_GATE_ORDER];

    for (const gateName of gateOrder) {
      const gateResult = this.evaluateConfiguredGate(
        gateName,
        response,
        ctx,
        qualityBank,
      );
      if (gateResult) results.push(gateResult);
    }

    if (!gateOrder.includes("no_raw_json")) {
      results.push(gateNoJsonOutput(response, ctx));
    }

    if (ctx.slotContract) {
      for (const gateName of EXTRACTION_GATE_ORDER) {
        const gateFn = GATE_REGISTRY[gateName];
        if (!gateFn) continue;
        results.push(gateFn(response, ctx));
      }
    }

    results.push(
      ...this.runDocumentIntelligencePolicyGates(response, ctx, qualityBank),
    );
    results.push(...this.runDomainSpecificOverrideGates(response, ctx));

    const allPassed = results.every((r) => r.passed);
    const finalScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + (r.score ?? 0), 0) / results.length
        : 1.0;

    return { allPassed, results, finalScore };
  }

  async runGate(
    gateName: string,
    response: string,
    context: unknown,
  ): Promise<QualityGateResult> {
    const ctx = (context || {}) as QualityGateContext;
    const gateFn = GATE_REGISTRY[gateName];
    if (!gateFn) {
      return {
        passed: true,
        gateName,
        score: 1.0,
        issues: [`Gate '${gateName}' not found`],
      };
    }
    return gateFn(response, ctx);
  }

  getAvailableGates(): string[] {
    return Object.keys(GATE_REGISTRY);
  }
}
