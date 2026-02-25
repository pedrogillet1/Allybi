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
  slotContract?: SlotContract | null;
  extractionResult?: ExtractionResult | null;
  evidenceItems?: Array<{ snippet?: string; docId?: string }>;
  language?: string;
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
