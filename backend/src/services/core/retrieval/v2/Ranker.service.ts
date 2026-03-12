/**
 * Ranker — v2 extraction
 *
 * Standalone ranking utilities extracted from RetrievalEngineService.
 * Computes weighted final scores, resolves intent-family priority boosts,
 * source affinity boosts, and routing stage weights.
 *
 * BUG FIX #3 (part 2): After computing the weighted sum, the Ranker now
 * applies `tocPenaltyMultiplier` (set by NegativeRules) so the penalty
 * operates on the correct post-ranking score instead of a pre-ranking
 * intermediate value.
 */

import { logger } from "../../../../utils/logger";
import type {
  CandidateChunk,
  CandidateSource,
  RetrievalRequest,
} from "../retrieval.types";
import { clamp01, safeNumber } from "../retrievalEngine.utils";

// ── Intent family priority ───────────────────────────────────────────

/**
 * Resolve a base priority boost for the given intent family from the
 * routing priority bank.  Returns a value in [0, 0.08].
 */
export function resolveIntentFamilyPriorityBoost(
  intentFamily: string | null | undefined,
  routingPriorityBank?: Record<string, any>,
): number {
  if (!routingPriorityBank?.config?.enabled) return 0;
  const priorities =
    routingPriorityBank?.intentFamilyBasePriority &&
    typeof routingPriorityBank.intentFamilyBasePriority === "object"
      ? (routingPriorityBank.intentFamilyBasePriority as Record<
          string,
          unknown
        >)
      : null;
  if (!priorities) return 0;
  const values = Object.values(priorities)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return 0;
  const family = String(intentFamily || "general")
    .trim()
    .toLowerCase();
  const rawPriority = Number(priorities[family] ?? priorities.general ?? 0);
  if (!Number.isFinite(rawPriority) || rawPriority <= 0) return 0;
  const maxPriority = Math.max(...values);
  if (maxPriority <= 0) return 0;
  const stageWeight = resolveRoutingStageWeight(
    routingPriorityBank,
    "intent_family_priority",
  );
  const stageScale = stageWeight > 0 ? stageWeight : 1;
  return Math.max(
    0,
    Math.min(0.08, (rawPriority / maxPriority) * 0.08 * stageScale),
  );
}

// ── Routing stage weight ─────────────────────────────────────────────

/**
 * Look up the normalised weight of a tiebreak stage from the routing
 * priority bank.  Returns a value in [0, 1].
 */
export function resolveRoutingStageWeight(
  routingPriorityBank: Record<string, any>,
  stageId: string,
): number {
  const stages = Array.isArray(routingPriorityBank?.tiebreakStages)
    ? routingPriorityBank.tiebreakStages
    : [];
  if (stages.length === 0) return 0;
  const maxWeight = Math.max(
    ...stages
      .map((stage: any) => Number(stage?.weight || 0))
      .filter((weight: number) => Number.isFinite(weight) && weight > 0),
    0,
  );
  if (maxWeight <= 0) return 0;
  const stage = stages.find(
    (entry: any) => String(entry?.id || "").trim() === stageId,
  );
  const raw = Number(stage?.weight || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.min(1, raw / maxWeight));
}

// ── Source affinity boost ────────────────────────────────────────────

/**
 * Small additive boost based on which retrieval source (semantic,
 * lexical, structural) best serves a given intent family.
 */
export function resolveSourceAffinityBoost(
  intentFamily: string | null | undefined,
  source: CandidateSource,
): number {
  const family = String(intentFamily || "")
    .trim()
    .toLowerCase();
  if (family === "documents" || family === "doc_stats") {
    if (source === "semantic") return 0.02;
    if (source === "structural") return 0.015;
    return 0;
  }
  if (family === "file_actions") {
    if (source === "lexical") return 0.02;
    if (source === "structural") return 0.01;
    return 0;
  }
  if (family === "editing") {
    if (source === "structural") return 0.02;
    return 0;
  }
  if (family === "help" || family === "conversation") {
    if (source === "semantic") return 0.01;
    return 0;
  }
  return 0;
}

// ── Main ranking function ────────────────────────────────────────────

/**
 * Compute weighted final scores for all candidates and sort descending.
 *
 * Weight redistribution: in encrypted-only mode the lexical and
 * structural channels are dead (always 0) so their weight is shifted
 * to semantic to avoid artificially capping the score.
 *
 * BUG FIX #3 (part 2): After computing the weighted sum, apply the
 * `tocPenaltyMultiplier` signal set by the NegativeRules stage.  This
 * ensures the TOC penalty operates on the correct post-ranking score.
 */
export function rankCandidates(
  candidates: CandidateChunk[],
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  rankerCfg: Record<string, any>,
  routingPriorityBank: Record<string, any> | undefined,
  isEncryptedOnlyMode: boolean,
): CandidateChunk[] {
  const cfg = rankerCfg?.config;
  let weights = cfg?.weights ?? {
    semantic: 0.52,
    lexical: 0.22,
    structural: 0.14,
    titleBoost: 0.06,
    documentIntelligenceBoost: 0.08,
    routingPriorityBoost: 0.04,
    typeBoost: 0.03,
    recencyBoost: 0.03,
  };

  // In encrypted mode, lexical and structural always return 0.
  // Redistribute their weight to semantic so scores are not artificially capped.
  if (isEncryptedOnlyMode) {
    const deadWeight = (weights.lexical ?? 0) + (weights.structural ?? 0);
    weights = {
      ...weights,
      semantic: (weights.semantic ?? 0) + deadWeight,
      lexical: 0,
      structural: 0,
    };
  }

  const familyPriorityBoost = resolveIntentFamilyPriorityBoost(
    signals.intentFamily,
    routingPriorityBank,
  );

  for (const c of candidates) {
    const semantic = clamp01(c.scores.semantic ?? 0);
    const lexical = clamp01(c.scores.lexical ?? 0);
    const structural = clamp01(c.scores.structural ?? 0);

    const titleBoost = clamp01(
      (c.scores.titleBoost ?? 0) + (c.scores.keywordBoost ?? 0) * 0.5,
    );
    const documentIntelligenceBoost = clamp01(
      c.scores.documentIntelligenceBoost ?? 0,
    );
    const routingPriorityBoost = clamp01(
      familyPriorityBoost +
        resolveSourceAffinityBoost(signals.intentFamily, c.source),
    );
    c.scores.routingPriorityBoost = routingPriorityBoost;
    const typeBoost = clamp01(c.scores.typeBoost ?? 0);
    const recencyBoost = clamp01(c.scores.recencyBoost ?? 0);

    const penalties = clamp01(c.scores.penalties ?? 0);

    let final =
      weights.semantic * semantic +
      weights.lexical * lexical +
      weights.structural * structural +
      weights.titleBoost * titleBoost +
      safeNumber(weights.documentIntelligenceBoost, 0.08) *
        documentIntelligenceBoost +
      safeNumber(weights.routingPriorityBoost, 0.04) * routingPriorityBoost +
      weights.typeBoost * typeBoost +
      weights.recencyBoost * recencyBoost -
      penalties;

    // BUG FIX #3 (part 2): Apply TOC penalty multiplier after the
    // weighted sum instead of before (where it would corrupt the
    // intermediate score used as input to this calculation).
    final = final * (c.signals.tocPenaltyMultiplier ?? 1.0);
    final = clamp01(final);

    // If below minFinal, keep but mark; packaging may filter further.
    c.scores.final = final;
  }

  // Stable sort: final desc, docId asc, locationKey asc, candidateId asc
  candidates.sort((a, b) => {
    const fa = a.scores.final ?? 0;
    const fb = b.scores.final ?? 0;
    if (fb !== fa) return fb - fa;
    if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
    if (a.locationKey !== b.locationKey)
      return a.locationKey.localeCompare(b.locationKey);
    return a.candidateId.localeCompare(b.candidateId);
  });

  return candidates;
}
