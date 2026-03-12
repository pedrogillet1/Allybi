import { getOptionalBank } from "../banks/bankLoader.service";
import type { ExtractionResult } from "../compose/extractionCompiler.service";
import type { SlotContract } from "../retrieval/slotResolver.service";

export interface QualityGateResult {
  passed: boolean;
  gateName: string;
  failureCode?: string;
  severity?: "warn" | "block";
  score?: number;
  issues?: string[];
  sourceBankId?: string;
  details?: Record<string, unknown>;
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
}

export type QualityGatesBank = {
  _meta?: { id?: string; version?: string };
  config?: {
    enabled?: boolean;
    modes?: {
      byEnv?: Record<string, { strictness?: string; failClosed?: boolean }>;
    };
    integrationHooks?: Record<string, string>;
    gateSeverityByName?: Record<string, "warn" | "block" | "warning" | "error">;
  };
  gateOrder?: string[];
};

type HookBank = {
  _meta?: { id?: string; version?: string };
  bannedPhrases?: string[];
  bannedPatterns?: string[];
  piiPatterns?: string[];
};

type GateEvaluatorContext = {
  qualityBank: QualityGatesBank | null;
};

type GateEvaluator = (
  response: string,
  ctx: QualityGateContext,
  evalCtx: GateEvaluatorContext,
) => QualityGateResult;

const DEFAULT_GATE_ORDER = [
  "explicit_doc_enforcement",
  "nav_pills_enforcement",
  "numeric_integrity",
  "markdown_sanity",
  "repetition_and_banned_phrases",
  "privacy_minimal",
  "final_consistency",
] as const;

const EXTRACTION_GATE_ORDER = [
  "requested_slot_covered",
  "forbidden_adjacent_role_absent",
  "entity_role_consistency",
] as const;

const REQUIRED_HOOK_BY_GATE: Record<string, string[]> = {
  repetition_and_banned_phrases: ["dedupeBankId"],
  privacy_minimal: ["piiLabelsBankId"],
};

function splitSentences(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectRepeatedSentence(text: string): boolean {
  const seen = new Set<string>();
  for (const sentence of splitSentences(text).map((value) => value.toLowerCase())) {
    if (seen.has(sentence)) return true;
    seen.add(sentence);
  }
  return false;
}

function resolveSeverity(
  gateName: string,
  bank: QualityGatesBank | null,
  fallback: "warn" | "block",
): "warn" | "block" {
  const raw = bank?.config?.gateSeverityByName?.[gateName];
  if (raw === "warn" || raw === "warning") return "warn";
  if (raw === "block" || raw === "error") return "block";
  return fallback;
}

function getHookBank<T>(bankId: string): T | null {
  return getOptionalBank<T>(bankId);
}

function gateRequestedSlotCovered(
  response: string,
  ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "requested_slot_covered";
  if (!ctx.slotContract) return { passed: true, gateName, score: 1 };
  const lower = response.toLowerCase();
  const anchors = ctx.slotContract.anchorLabels || [];
  const found = anchors.some((anchor) =>
    lower.includes(String(anchor || "").toLowerCase()),
  );
  const hasCandidateEntity =
    ctx.extractionResult?.candidates?.some((candidate) =>
      lower.includes(candidate.entityText.toLowerCase()),
    ) ?? false;
  const passed = found || hasCandidateEntity;
  return {
    gateName,
    passed,
    failureCode: passed ? undefined : "REQUESTED_SLOT_NOT_COVERED",
    score: passed ? 1 : 0,
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
    return { passed: true, gateName, score: 1 };
  }
  const lower = response.toLowerCase();
  const issues = (ctx.extractionResult.forbiddenMentions || [])
    .filter((entry) => lower.includes(entry.entityText.toLowerCase()))
    .map(
      (entry) =>
        `Answer mentions forbidden-role entity '${entry.entityText}' (role: ${entry.role})`,
    );
  const passed = issues.length === 0;
  return {
    gateName,
    passed,
    failureCode: passed ? undefined : "FORBIDDEN_ADJACENT_ROLE_PRESENT",
    score: passed ? 1 : Math.max(0, 1 - issues.length * 0.3),
    issues: passed ? undefined : issues,
  };
}

function gateEntityRoleConsistency(
  response: string,
  ctx: QualityGateContext,
): QualityGateResult {
  const gateName = "entity_role_consistency";
  if (!ctx.slotContract || !ctx.extractionResult) {
    return { passed: true, gateName, score: 1 };
  }
  const lower = response.toLowerCase();
  const candidates = ctx.extractionResult.candidates || [];
  const anyMatch =
    candidates.length === 0 ||
    candidates.some((candidate) => lower.includes(candidate.entityText.toLowerCase()));
  return {
    gateName,
    passed: anyMatch,
    failureCode: anyMatch ? undefined : "ENTITY_ROLE_INCONSISTENT",
    score: anyMatch ? 1 : 0.3,
    issues: anyMatch
      ? undefined
      : ["Answer does not contain any extracted target-role candidate."],
  };
}

const VERIFIER_GATES: Record<string, GateEvaluator> = {
  explicit_doc_enforcement: (_response, ctx, evalCtx) => {
    const gateName = "explicit_doc_enforcement";
    const failed = Boolean(ctx.explicitDocRef) && Boolean(ctx.discoveryMode);
    return {
      gateName,
      passed: !failed,
      failureCode: failed ? "EXPLICIT_DOC_DISCOVERY_CONFLICT" : undefined,
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: failed ? 0 : 1,
      issues: failed
        ? ["Explicit doc reference cannot run in discovery mode."]
        : undefined,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  nav_pills_enforcement: (response, ctx, evalCtx) => {
    const gateName = "nav_pills_enforcement";
    const inNavMode = String(ctx.answerMode || "").trim().toLowerCase() === "nav_pills";
    if (!inNavMode) {
      return {
        gateName,
        passed: true,
        severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
        score: 1,
        sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
      };
    }
    const hasSourcesHeader = /\b(sources|fontes|fuentes)\s*:/i.test(response);
    const hasInlineFileList =
      /\.(pdf|xlsx?|pptx?|docx?|csv|txt|jpg|jpeg|png)\b/i.test(response);
    const missingButtons = Number(ctx.sourceButtonsCount || 0) < 1;
    const failed = hasSourcesHeader || hasInlineFileList || missingButtons;
    return {
      gateName,
      passed: !failed,
      failureCode: failed ? "NAV_PILLS_CONTRACT_VIOLATION" : undefined,
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
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
          ].filter(Boolean)
        : undefined,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  numeric_integrity: (response, _ctx, evalCtx) => {
    const gateName = "numeric_integrity";
    const hasPartialNumber = /\d+\.$|\d+,$|\d+\*+$/m.test(response);
    return {
      gateName,
      passed: !hasPartialNumber,
      failureCode: hasPartialNumber ? "NUMERIC_TOKEN_TRUNCATED" : undefined,
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
      score: hasPartialNumber ? 0.2 : 1,
      issues: hasPartialNumber
        ? ["Potential truncated numeric token detected."]
        : undefined,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  markdown_sanity: (response, _ctx, evalCtx) => {
    const gateName = "markdown_sanity";
    const issues: string[] = [];
    const codeFenceCount = (response.match(/```/g) || []).length;
    if (codeFenceCount % 2 !== 0) {
      issues.push("Unclosed code block (odd number of ``` delimiters)");
    }
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "MARKDOWN_INVALID",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
      score: passed ? 1 : 0.7,
      issues: passed ? undefined : issues,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  no_raw_json: (response, _ctx, evalCtx) => {
    const gateName = "no_raw_json";
    const trimmed = response.trim();
    const looksLikeJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));
    return {
      gateName,
      passed: !looksLikeJson,
      failureCode: looksLikeJson ? "MALFORMED_JSON_OUTPUT" : undefined,
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
      score: looksLikeJson ? 0 : 1,
      issues: looksLikeJson
        ? ["Response appears to be raw JSON output."]
        : undefined,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  repetition_and_banned_phrases: (response, _ctx, evalCtx) => {
    const gateName = "repetition_and_banned_phrases";
    const dedupeBankId = String(
      evalCtx.qualityBank?.config?.integrationHooks?.dedupeBankId || "",
    ).trim();
    const dedupeBank = dedupeBankId ? getHookBank<HookBank>(dedupeBankId) : null;
    const patterns = [
      ...(Array.isArray(dedupeBank?.bannedPhrases) ? dedupeBank.bannedPhrases : []),
      ...(Array.isArray(dedupeBank?.bannedPatterns) ? dedupeBank.bannedPatterns : []),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const hasBannedPhrase = patterns.some((pattern) => {
      try {
        return new RegExp(pattern, "i").test(response);
      } catch {
        return response.toLowerCase().includes(pattern.toLowerCase());
      }
    });
    const repeatedSentence = detectRepeatedSentence(response);
    const failed = hasBannedPhrase || repeatedSentence;
    return {
      gateName,
      passed: !failed,
      failureCode: failed ? "REPETITION_OR_BANNED_PHRASE" : undefined,
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
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
      sourceBankId: dedupeBankId || evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  privacy_minimal: (response, _ctx, evalCtx) => {
    const gateName = "privacy_minimal";
    const piiLabelsBankId = String(
      evalCtx.qualityBank?.config?.integrationHooks?.piiLabelsBankId || "",
    ).trim();
    const piiBank = piiLabelsBankId ? getHookBank<HookBank>(piiLabelsBankId) : null;
    const defaultPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
      /\b(?:cpf|cnpj|tax\s*id|tin)\b/i,
    ];
    const bankPatterns = Array.isArray(piiBank?.piiPatterns)
      ? piiBank.piiPatterns
          .map((pattern) => {
            try {
              return new RegExp(String(pattern), "i");
            } catch {
              return null;
            }
          })
          .filter((pattern): pattern is RegExp => pattern !== null)
      : [];
    const matched = [...defaultPatterns, ...bankPatterns].some((pattern) =>
      pattern.test(response),
    );
    return {
      gateName,
      passed: !matched,
      failureCode: matched ? "PII_DETECTED" : undefined,
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: matched ? 0 : 1,
      issues: matched
        ? ["Potential PII leak detected in response content."]
        : undefined,
      sourceBankId: piiLabelsBankId || evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  final_consistency: (response, _ctx, evalCtx) => {
    const gateName = "final_consistency";
    const empty = String(response || "").trim().length === 0;
    return {
      gateName,
      passed: !empty,
      failureCode: empty ? "FINAL_OUTPUT_EMPTY" : undefined,
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
      score: empty ? 0 : 1,
      issues: empty ? ["Answer text is empty after quality enforcement."] : undefined,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  structural_completeness: (response, _ctx, evalCtx) => {
    const gateName = "structural_completeness";
    const issues: string[] = [];
    const trimmed = response.trim();
    if (/\bis\s*\.\s*$/.test(trimmed) || /\bare\s*\.\s*$/.test(trimmed)) {
      issues.push("Answer ends with a broken placeholder.");
    }
    if (
      /(?:the|a|an|its|their|this|these|those|from|and|or|but|for|with|such as|including)\s*$/i.test(
        trimmed,
      )
    ) {
      issues.push("Answer appears truncated mid-sentence.");
    }
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STRUCTURAL_COMPLETENESS_FAILED",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "warn"),
      score: passed ? 1 : 0.2,
      issues: passed ? undefined : issues,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
};

const EXTRACTION_GATES: Record<string, typeof gateRequestedSlotCovered> = {
  requested_slot_covered: gateRequestedSlotCovered,
  forbidden_adjacent_role_absent: gateForbiddenAdjacentRoleAbsent,
  entity_role_consistency: gateEntityRoleConsistency,
};

export function resolveQualityGateOrder(qualityBank: QualityGatesBank | null): string[] {
  const configured = Array.isArray(qualityBank?.gateOrder)
    ? qualityBank.gateOrder.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  return configured.length > 0 ? configured : [...DEFAULT_GATE_ORDER];
}

export function validateConfiguredGateNames(
  gateOrder: string[],
  strictFailClosed: boolean,
): QualityGateResult[] {
  const failures: QualityGateResult[] = [];
  for (const gateName of gateOrder) {
    if (VERIFIER_GATES[gateName]) continue;
    const failure: QualityGateResult = {
      gateName: "quality_gate_registry",
      passed: false,
      failureCode: "UNKNOWN_QUALITY_GATE",
      severity: "block",
      score: 0,
      issues: [`Gate '${gateName}' is not part of the runtime verifier registry.`],
      details: { configuredGate: gateName },
      sourceBankId: "quality_gates",
    };
    if (strictFailClosed) {
      throw new Error(failure.issues![0]);
    }
    failures.push(failure);
  }
  return failures;
}

export function validateRequiredHookBanks(
  gateOrder: string[],
  qualityBank: QualityGatesBank | null,
  strictFailClosed: boolean,
): QualityGateResult[] {
  const failures: QualityGateResult[] = [];
  const hooks = qualityBank?.config?.integrationHooks || {};
  const requiredKeys = Array.from(
    new Set(gateOrder.flatMap((gateName) => REQUIRED_HOOK_BY_GATE[gateName] || [])),
  );
  for (const hookKey of requiredKeys) {
    const hookBankId = String(hooks[hookKey] || "").trim();
    if (!hookBankId) continue;
    if (getHookBank<HookBank>(hookBankId)) continue;
    const issue = `Required quality integration hook bank missing: ${hookBankId}`;
    if (strictFailClosed) throw new Error(issue);
    failures.push({
      gateName: "quality_integration_hook_presence",
      passed: false,
      failureCode: "QUALITY_HOOK_BANK_MISSING",
      severity: "block",
      score: 0,
      issues: [issue],
      details: { hookKey, hookBankId },
      sourceBankId: "quality_gates",
    });
  }
  return failures;
}

export function evaluateQualityGate(
  gateName: string,
  response: string,
  context: QualityGateContext,
  qualityBank: QualityGatesBank | null,
): QualityGateResult {
  const evaluator = VERIFIER_GATES[String(gateName || "").trim()];
  if (!evaluator) {
    return {
      gateName,
      passed: false,
      failureCode: "GATE_NOT_FOUND",
      severity: "block",
      score: 0,
      issues: [`Gate '${gateName}' not found`],
      sourceBankId: qualityBank?._meta?.id || "quality_gates",
    };
  }
  return evaluator(response, context, { qualityBank });
}

export function evaluateExtractionQualityGates(
  response: string,
  context: QualityGateContext,
): QualityGateResult[] {
  if (!context.slotContract) return [];
  return EXTRACTION_GATE_ORDER.map((gateName) =>
    EXTRACTION_GATES[gateName](response, context),
  );
}

export function getAvailableQualityGateNames(): string[] {
  return [...Object.keys(VERIFIER_GATES), ...EXTRACTION_GATE_ORDER];
}
