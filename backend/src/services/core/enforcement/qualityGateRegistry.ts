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
  audienceHint?: string;
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
  evidenceStrength?: string | null;
  styleDecision?: Record<string, unknown> | null;
  turnStyleState?: Record<string, unknown> | null;
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
  bannedLeadins?: Record<string, string[]>;
  bans?: string[];
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
  "style_opener_naturalness",
  "style_empathy_authenticity",
  "style_repetition_control",
  "style_confidence_alignment",
  "style_domain_voice_match",
  "style_conversational_flow",
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
  style_contract: ["antiRoboticBankId", "cannedEmpathyBankId"],
  style_opener_naturalness: ["antiRoboticBankId"],
  style_empathy_authenticity: ["cannedEmpathyBankId"],
  style_repetition_control: ["antiRoboticBankId"],
  style_confidence_alignment: ["antiRoboticBankId"],
  style_domain_voice_match: ["antiRoboticBankId"],
  style_conversational_flow: ["antiRoboticBankId"],
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

function collectLanguagePhrases(
  bank: HookBank | null,
  language: string,
  field: "bannedLeadins" | "bans",
): string[] {
  if (!bank) return [];
  if (field === "bans" && Array.isArray(bank.bans)) {
    return bank.bans.map((value) => String(value || "").trim()).filter(Boolean);
  }
  if (field === "bannedLeadins" && bank.bannedLeadins) {
    const normalized = String(language || "en").trim().toLowerCase();
    const ordered = normalized === "pt" ? ["pt", "any", "en"] : ["en", "any", "pt"];
    for (const key of ordered) {
      const values = bank.bannedLeadins[key];
      if (Array.isArray(values)) {
        return values.map((value) => String(value || "").trim()).filter(Boolean);
      }
    }
  }
  return [];
}

function sentenceStarters(text: string): string[] {
  return splitSentences(text).map((sentence) =>
    sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(" "),
  );
}

function leadSignature(text: string): string {
  return sentenceStarters(text)[0] || "";
}

function closerSignature(text: string): string {
  const sentences = splitSentences(text);
  const last = sentences[sentences.length - 1] || "";
  const tokens = last
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.slice(Math.max(0, tokens.length - 3)).join(" ");
}

function hasRepeatedStarterRun(text: string): boolean {
  const starters = sentenceStarters(text).filter(Boolean);
  for (let index = 1; index < starters.length; index += 1) {
    if (starters[index] && starters[index] === starters[index - 1]) return true;
  }
  return false;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
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

function resolveStyleBanks(evalCtx: GateEvaluatorContext): {
  antiRoboticBankId: string;
  cannedEmpathyBankId: string;
  antiRoboticBank: HookBank | null;
  cannedEmpathyBank: HookBank | null;
} {
  const antiRoboticBankId = String(
    evalCtx.qualityBank?.config?.integrationHooks?.antiRoboticBankId || "",
  ).trim();
  const cannedEmpathyBankId = String(
    evalCtx.qualityBank?.config?.integrationHooks?.cannedEmpathyBankId || "",
  ).trim();
  return {
    antiRoboticBankId,
    cannedEmpathyBankId,
    antiRoboticBank: antiRoboticBankId ? getHookBank<HookBank>(antiRoboticBankId) : null,
    cannedEmpathyBank: cannedEmpathyBankId
      ? getHookBank<HookBank>(cannedEmpathyBankId)
      : null,
  };
}

function buildStyleSignalContext(
  response: string,
  ctx: QualityGateContext,
  evalCtx: GateEvaluatorContext,
): {
  language: string;
  lower: string;
  lead: string;
  close: string;
  recentLeadSignatures: string[];
  recentCloserSignatures: string[];
  evidenceStrength: string;
  domainHint: string;
  antiRoboticBankId: string;
  cannedEmpathyBankId: string;
  antiRoboticBank: HookBank | null;
  cannedEmpathyBank: HookBank | null;
} {
  const { antiRoboticBankId, cannedEmpathyBankId, antiRoboticBank, cannedEmpathyBank } =
    resolveStyleBanks(evalCtx);
  const turnStyleState =
    ctx.turnStyleState && typeof ctx.turnStyleState === "object" ? ctx.turnStyleState : {};
  return {
    language: String(ctx.language || "en").trim().toLowerCase(),
    lower: String(response || "").toLowerCase(),
    lead: leadSignature(response),
    close: closerSignature(response),
    recentLeadSignatures: asStringList(
      (turnStyleState as Record<string, unknown>).recentLeadSignatures,
    ),
    recentCloserSignatures: asStringList(
      (turnStyleState as Record<string, unknown>).recentCloserSignatures,
    ),
    evidenceStrength: String(ctx.evidenceStrength || "").trim().toLowerCase(),
    domainHint: String(ctx.domainHint || "").trim().toLowerCase(),
    antiRoboticBankId,
    cannedEmpathyBankId,
    antiRoboticBank,
    cannedEmpathyBank,
  };
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
  style_opener_naturalness: (response, ctx, evalCtx) => {
    const gateName = "style_opener_naturalness";
    const signals = buildStyleSignalContext(response, ctx, evalCtx);
    const leadinHit = collectLanguagePhrases(
      signals.antiRoboticBank,
      signals.language,
      "bannedLeadins",
    ).find((phrase) => signals.lower.startsWith(phrase.toLowerCase()));
    const macroHit =
      /^\s*(short answer:|bottom line:|current status:|in summary,)/i.test(response) ||
      /\bthe main difference is\b/i.test(response);
    const repeatedTurnLead =
      signals.lead.length > 0 && signals.recentLeadSignatures.includes(signals.lead);
    const issues = [
      leadinHit ? `Robotic lead-in detected: '${leadinHit}'` : "",
      macroHit ? "Visible macro-style opener detected." : "",
      repeatedTurnLead ? "Opening echoes a recent assistant turn." : "",
    ].filter(Boolean);
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STYLE_OPENER_NOT_NATURAL",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: passed ? 1 : Math.max(0.2, 1 - issues.length * 0.25),
      issues: passed ? undefined : issues,
      sourceBankId: signals.antiRoboticBankId || evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  style_empathy_authenticity: (response, ctx, evalCtx) => {
    const gateName = "style_empathy_authenticity";
    const signals = buildStyleSignalContext(response, ctx, evalCtx);
    const empathyHit = collectLanguagePhrases(
      signals.cannedEmpathyBank,
      signals.language,
      "bans",
    ).find((phrase) => signals.lower.includes(phrase.toLowerCase()));
    const selfReferentialSupport =
      /\bi will keep this anchored\b/i.test(response) ||
      /\bi completely understand\b/i.test(response) ||
      /\byou are not alone\b/i.test(response);
    const issues = [
      empathyHit ? `Canned empathy detected: '${empathyHit}'` : "",
      selfReferentialSupport ? "Self-referential or therapeutic support language detected." : "",
    ].filter(Boolean);
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STYLE_EMPATHY_INAUTHENTIC",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: passed ? 1 : Math.max(0.25, 1 - issues.length * 0.3),
      issues: passed ? undefined : issues,
      sourceBankId:
        signals.cannedEmpathyBankId || evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  style_repetition_control: (response, ctx, evalCtx) => {
    const gateName = "style_repetition_control";
    const signals = buildStyleSignalContext(response, ctx, evalCtx);
    const repeatedTurnLead =
      signals.lead.length > 0 && signals.recentLeadSignatures.includes(signals.lead);
    const repeatedTurnClose =
      signals.close.length > 0 && signals.recentCloserSignatures.includes(signals.close);
    const repeatedStarterRun = hasRepeatedStarterRun(response);
    const repeatedSentence = detectRepeatedSentence(response);
    const issues = [
      repeatedTurnLead ? "Opening signature repeats a recent assistant turn." : "",
      repeatedTurnClose ? "Closing signature repeats a recent assistant turn." : "",
      repeatedStarterRun ? "Adjacent sentences reuse the same starter." : "",
      repeatedSentence ? "Exact repeated sentence detected in response output." : "",
    ].filter(Boolean);
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STYLE_REPETITION_DETECTED",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: passed ? 1 : Math.max(0.2, 1 - issues.length * 0.2),
      issues: passed ? undefined : issues,
      sourceBankId: signals.antiRoboticBankId || evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  style_confidence_alignment: (response, ctx, evalCtx) => {
    const gateName = "style_confidence_alignment";
    const signals = buildStyleSignalContext(response, ctx, evalCtx);
    const tooStrongForWeakEvidence =
      (signals.evidenceStrength === "low" || signals.evidenceStrength === "missing") &&
      /\b(the document shows|the record confirms|clearly|definitively|the strongest reading is)\b/i.test(
        response,
      );
    const tooWeakForStrongEvidence =
      signals.evidenceStrength === "high" &&
      /\b(the document suggests, but does not settle,|there is some support for|the available evidence leans toward|it may be)\b/i.test(
        response,
      );
    const issues = [
      tooStrongForWeakEvidence ? "Confidence is stronger than the evidence justifies." : "",
      tooWeakForStrongEvidence ? "Confidence is weaker than the evidence justifies." : "",
    ].filter(Boolean);
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STYLE_CONFIDENCE_MISMATCH",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: passed ? 1 : 0.35,
      issues: passed ? undefined : issues,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  style_domain_voice_match: (response, ctx, evalCtx) => {
    const gateName = "style_domain_voice_match";
    const signals = buildStyleSignalContext(response, ctx, evalCtx);
    const seriousDomain =
      signals.domainHint === "legal" ||
      signals.domainHint === "finance" ||
      signals.domainHint === "accounting" ||
      signals.domainHint === "medical";
    const casualMismatch =
      seriousDomain &&
      /\b(basically|obviously|super|kinda|pretty much)\b/i.test(response);
    const issues = [
      casualMismatch ? `Tone is too casual for ${signals.domainHint || "high-stakes"} context.` : "",
    ].filter(Boolean);
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STYLE_DOMAIN_MISMATCH",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: passed ? 1 : 0.45,
      issues: passed ? undefined : issues,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  style_conversational_flow: (response, ctx, evalCtx) => {
    const gateName = "style_conversational_flow";
    const signals = buildStyleSignalContext(response, ctx, evalCtx);
    const bureaucraticLead =
      /^\s*(to elaborate,|from a holistic perspective,|it is important to note)/i.test(
        response,
      );
    const transitionOverload =
      (response.match(/\b(furthermore|additionally|moreover)\b/gi) || []).length > 2;
    const issues = [
      bureaucraticLead ? "Opening sounds bureaucratic or documentation-like." : "",
      transitionOverload ? "Response relies on stacked transition phrases." : "",
      signals.recentLeadSignatures.length > 0 && hasRepeatedStarterRun(response)
        ? "Flow is stiff because sentence entry does not vary enough."
        : "",
    ].filter(Boolean);
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STYLE_FLOW_STIFF",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: passed ? 1 : Math.max(0.35, 1 - issues.length * 0.2),
      issues: passed ? undefined : issues,
      sourceBankId: signals.antiRoboticBankId || evalCtx.qualityBank?._meta?.id || "quality_gates",
    };
  },
  style_contract: (response, ctx, evalCtx) => {
    const gateName = "style_contract";
    const subResults = [
      VERIFIER_GATES.style_opener_naturalness(response, ctx, evalCtx),
      VERIFIER_GATES.style_empathy_authenticity(response, ctx, evalCtx),
      VERIFIER_GATES.style_repetition_control(response, ctx, evalCtx),
      VERIFIER_GATES.style_confidence_alignment(response, ctx, evalCtx),
      VERIFIER_GATES.style_domain_voice_match(response, ctx, evalCtx),
      VERIFIER_GATES.style_conversational_flow(response, ctx, evalCtx),
    ];
    const issues = subResults.flatMap((result) => result.issues || []);
    const passed = issues.length === 0;
    return {
      gateName,
      passed,
      failureCode: passed ? undefined : "STYLE_CONTRACT_VIOLATION",
      severity: resolveSeverity(gateName, evalCtx.qualityBank, "block"),
      score: passed ? 1 : Math.max(0.25, 1 - issues.length * 0.25),
      issues: passed ? undefined : issues,
      sourceBankId: evalCtx.qualityBank?._meta?.id || "quality_gates",
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
