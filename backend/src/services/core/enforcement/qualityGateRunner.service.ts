/**
 * QualityGateRunner — Orchestrates quality validation gates for responses.
 *
 * Runs a pipeline of quality checks before finalizing answers. Loads gate
 * configuration from the quality_gates data bank and executes each gate
 * in the configured order.
 *
 * Includes 3 extraction-specific gates:
 *   - requested_slot_covered: answer contains target-role anchor labels
 *   - forbidden_adjacent_role_absent: answer does NOT mention forbidden entities
 *   - entity_role_consistency: entities match evidence for the target role
 */

import { injectable } from "tsyringe";
import type { SlotContract } from "../retrieval/slotResolver.service";
import type {
  ExtractionResult,
  ExtractionCandidate,
} from "../compose/extractionCompiler.service";
import { resolveOutputTokenBudget } from "./tokenBudget.service";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../banks/documentIntelligenceBanks.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityGateResult {
  passed: boolean;
  gateName: string;
  score?: number;
  issues?: string[];
}

export interface QualityRunResult {
  allPassed: boolean;
  results: QualityGateResult[];
  finalScore: number;
}

export interface QualityGateContext {
  answerMode?: string;
  domainHint?: string;
  docTypeId?: string;
  slotContract?: SlotContract | null;
  extractionResult?: ExtractionResult | null;
  evidenceItems?: Array<{ snippet?: string; docId?: string }>;
  language?: string;
  docLockEnabled?: boolean;
  discoveryMode?: boolean;
  requiresClarification?: boolean;
}

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

  // Check if ANY target-role anchor appears in the answer
  const found = anchors.some((a) => lower.includes(a.toLowerCase()));

  // Also check if the answer contains content from extraction candidates
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
    // Check that at least one extraction candidate appears in the answer
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

// Standard gates (non-extraction)

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

  // Check for unclosed markdown formatting
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
  // Check if the response looks like raw JSON dump
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

// ---------------------------------------------------------------------------
// Gate registry
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@injectable()
export class QualityGateRunnerService {
  constructor(
    private readonly documentIntelligenceBanks: Pick<
      DocumentIntelligenceBanksService,
      "getQualityGateBank"
    > = getDocumentIntelligenceBanksInstance(),
  ) {}

  private runDocumentIntelligencePolicyGates(
    response: string,
    ctx: QualityGateContext,
  ): QualityGateResult[] {
    const results: QualityGateResult[] = [];
    const responseText = String(response || "");
    const domain = this.resolveDomainForQuality(ctx, responseText);
    const docType = String(ctx.docTypeId || "")
      .trim()
      .toLowerCase();

    const sourcePolicyBank =
      this.documentIntelligenceBanks.getQualityGateBank("source_policy");
    if (sourcePolicyBank?.config?.enabled) {
      const inNavMode =
        String(ctx.answerMode || "").toLowerCase() === "nav_pills";
      const hasTableCitation =
        /\|/.test(responseText) && /\[[^\]]+\]/.test(responseText);
      results.push({
        gateName: "source_policy_navigation_mode",
        passed: !(inNavMode && hasTableCitation),
        score: inNavMode && hasTableCitation ? 0 : 1,
        issues:
          inNavMode && hasTableCitation
            ? ["Navigation mode forbids citations inside tables."]
            : undefined,
      });
    }

    const numericIntegrityBank =
      this.documentIntelligenceBanks.getQualityGateBank("numeric_integrity");
    if (numericIntegrityBank?.config?.enabled) {
      const mixedCurrencies =
        /\$/.test(responseText) &&
        (/€/.test(responseText) ||
          /R\$/i.test(responseText) ||
          /£/.test(responseText));
      results.push({
        gateName: "numeric_integrity_currency_consistency",
        passed: !mixedCurrencies,
        score: mixedCurrencies ? 0.4 : 1,
        issues: mixedCurrencies
          ? [
              "Potential mixed-currency output detected without explicit normalization.",
            ]
          : undefined,
      });

      const strictNumericDomains = new Set([
        "billing",
        "banking",
        "housing",
        "hr_payroll",
      ]);
      const hasNumericFact = /\b\d[\d.,]*\b/.test(responseText);
      const hasUnitOrCurrency =
        /\b(?:usd|eur|brl|gbp|dollars?|euros?|reais|hours?|hrs?|dias?|days?|months?|meses?|m2|sqm|sqft|%)\b|[$€£]|r\$/i.test(
          responseText,
        );
      if (
        strictNumericDomains.has(domain) &&
        hasNumericFact &&
        !hasUnitOrCurrency
      ) {
        results.push({
          gateName: "numeric_integrity_domain_unit_required",
          passed: false,
          score: 0.25,
          issues: [
            `Numeric output for ${domain} requires explicit units/currency context.`,
          ],
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
        });
      }
    }

    const wrongDocLockBank =
      this.documentIntelligenceBanks.getQualityGateBank("wrong_doc_lock");
    if (wrongDocLockBank?.config?.enabled) {
      const lockConflict = Boolean(ctx.docLockEnabled && ctx.discoveryMode);
      results.push({
        gateName: "wrong_doc_lock_enforcement",
        passed: !lockConflict,
        score: lockConflict ? 0 : 1,
        issues: lockConflict
          ? ["Doc lock is enabled while discovery mode is requested."]
          : undefined,
      });
    }

    const ambiguityBank = this.documentIntelligenceBanks.getQualityGateBank(
      "ambiguity_questions",
    );
    if (ambiguityBank?.config?.enabled) {
      const questionMarks = (responseText.match(/\?/g) || []).length;
      const tooManyClarifiers =
        Boolean(ctx.requiresClarification) && questionMarks > 1;
      results.push({
        gateName: "ambiguity_single_question_policy",
        passed: !tooManyClarifiers,
        score: tooManyClarifiers ? 0.3 : 1,
        issues: tooManyClarifiers
          ? ["Clarification response violates single-question policy."]
          : undefined,
      });
    }

    // Strong default redaction domains
    if (new Set(["identity", "tax", "banking"]).has(domain)) {
      const piiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN
        /\b(?:cpf|cnpj|tax\s*id|tin)\s*[:#-]?\s*[A-Z0-9./-]{8,20}\b/i,
        /\b(?:passport|passaporte|license|licenca|cnh|rg)\s*(?:no\.?|number|#)?\s*[:#-]?\s*[A-Z0-9-]{6,20}\b/i,
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
        /\b(?:\+?\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d{3,5}[ .-]?\d{4}\b/,
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

    // Medical safety boundaries must apply only in medical context.
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

  private resolveDomainForQuality(
    ctx: QualityGateContext,
    responseText: string,
  ): string {
    const hinted = String(ctx.domainHint || "")
      .trim()
      .toLowerCase();
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

  /**
   * Run all quality gates on a response.
   * Includes extraction-specific gates when slotContract is present in context.
   */
  async runGates(
    response: string,
    context: unknown,
  ): Promise<QualityRunResult> {
    const ctx = (context || {}) as QualityGateContext;

    // Determine gate order: standard gates + extraction gates if applicable
    const gateOrder = [...DEFAULT_GATE_ORDER];
    if (ctx.slotContract) {
      gateOrder.push(...EXTRACTION_GATE_ORDER);
    }

    const results: QualityGateResult[] = [];
    for (const gateName of gateOrder) {
      const gateFn = GATE_REGISTRY[gateName];
      if (!gateFn) continue;
      results.push(gateFn(response, ctx));
    }
    results.push(...this.runDocumentIntelligencePolicyGates(response, ctx));

    const allPassed = results.every((r) => r.passed);
    const finalScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + (r.score ?? 0), 0) / results.length
        : 1.0;

    return { allPassed, results, finalScore };
  }

  /**
   * Run a specific gate by name.
   */
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

  /**
   * Get list of available gates.
   */
  getAvailableGates(): string[] {
    return Object.keys(GATE_REGISTRY);
  }
}
