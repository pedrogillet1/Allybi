/**
 * NegativeRules — v2 extraction
 *
 * Standalone negative-rule evaluation extracted from RetrievalEngineService.
 * Applies scope filtering, low-relevance exclusion, slot-extraction
 * confusion penalties, and TOC-content detection.
 *
 * BUG FIX #3 (part 1): Instead of directly mutating `c.scores.final` for
 * TOC penalty (which corrupts ranking before the weighted sum is computed),
 * we now set signal fields `tocPenaltyMultiplier` and `tocCandidate` that
 * the Ranker reads after computing the weighted sum.
 */

import { logger } from "../../../../utils/logger";
import type {
  CandidateChunk,
  RetrievalRequest,
  RetrievalScopeMetrics,
  BankLoader,
} from "../retrieval.types";
import { clamp01, safeNumber, safeGetBank } from "../retrievalEngine.utils";
import { BANK_IDS } from "./retrieval.config";
import { shouldEnforceScopedDocSet } from "./ScopeResolver.service";

// ── TOC detection ────────────────────────────────────────────────────

/**
 * Heuristic check for Table-of-Contents-like snippet content.
 * Returns true when the snippet looks like a TOC listing rather than
 * substantive document content.
 */
export function looksLikeTOC(snippet: string): boolean {
  if (!snippet || snippet.length < 50) return false;
  const lines = snippet
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return false;

  // Heuristic 1: High ratio of short lines ending with page numbers
  const shortWithPageNum = lines.filter(
    (l) => l.length < 80 && /\b\d{1,4}\s*$/.test(l),
  ).length;
  if (shortWithPageNum / lines.length > 0.5) return true;

  // Heuristic 2: High ratio of numbered-section lines (1. 1.1 Sec. Chapter)
  const numberedSections = lines.filter((l) =>
    /^(?:\d+(?:\.\d+)*\.?\s|(?:Sec(?:tion|\.)|Chapter|Art(?:icle|\.)|Part)\s)/i.test(
      l,
    ),
  ).length;
  if (numberedSections / lines.length > 0.6 && lines.length >= 5) return true;

  // Heuristic 3: Dot-leader lines (Table of Contents formatting)
  const dotLeaders = lines.filter((l) => /\.{3,}|_{3,}|-{5,}/.test(l)).length;
  if (dotLeaders / lines.length > 0.3) return true;

  return false;
}

// shouldEnforceScopedDocSet imported from ScopeResolver.service
// safeGetBank imported from retrievalEngine.utils

// ── Main negatives filter ────────────────────────────────────────────

/**
 * Apply retrieval negatives: scope filtering, low-relevance exclusion,
 * slot-extraction confusion penalties, and TOC detection.
 *
 * Candidates that fail scope or relevance checks are dropped.
 * Surviving candidates may have penalty/boost scores adjusted.
 *
 * BUG FIX #3 (part 1): TOC penalty is recorded as a signal
 * (`tocPenaltyMultiplier`) instead of directly overwriting `scores.final`.
 * The Ranker applies this multiplier after computing the weighted sum.
 */
export function applyRetrievalNegatives(
  candidates: CandidateChunk[],
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  scope: {
    candidateDocIds: string[];
    hardScopeActive: boolean;
    sheetName?: string | null;
    rangeA1?: string | null;
  },
  negativesBank: Record<string, any> | null,
  bankLoader: BankLoader,
  isEncryptedOnlyMode: boolean,
  scopeMetrics?: RetrievalScopeMetrics,
): CandidateChunk[] {
  try {
  if (!negativesBank?.config?.enabled) return candidates;

  const cfg = negativesBank.config;
  const minRelevanceCfg = safeNumber(
    cfg?.actionsContract?.thresholds?.minRelevanceScore,
    0.55,
  );
  // In encrypted mode, semantic scores are systematically lower because
  // lexical/structural channels are dead.  Lower the relevance floor so
  // valid evidence is not dropped before ranking.
  const minRelevance = isEncryptedOnlyMode
    ? Math.min(minRelevanceCfg, 0.1)
    : minRelevanceCfg;

  const scopeEnforced = shouldEnforceScopedDocSet(scope, signals);
  const allowedDocSet = scopeEnforced
    ? new Set(scope.candidateDocIds)
    : null;

  // Slot extraction: precompute role anchors for confusion penalty
  const slotContract = signals.slotContract;
  const isExtraction = Boolean(signals.isExtractionQuery && slotContract);
  let targetAnchors: string[] = [];
  let forbiddenAnchorsFlat: string[] = [];
  let confusionPenaltyDefault = 0.25;

  if (isExtraction && slotContract) {
    targetAnchors = (slotContract.anchorLabels || []).map((a: string) =>
      a.toLowerCase(),
    );
    // Load ontology for broader anchor coverage
    const ontology = safeGetBank<Record<string, any>>(
      bankLoader,
      BANK_IDS.entityRoleOntology,
    );
    if (ontology?.roles) {
      for (const forbiddenRoleId of slotContract.forbidden) {
        const role = (ontology.roles as any[]).find(
          (r: any) => r.id === forbiddenRoleId,
        );
        if (role?.anchors) {
          const anchors =
            role.anchors[req.query ? "en" : "en"] ?? role.anchors["en"] ?? [];
          for (const a of anchors) {
            const lower = a.toLowerCase();
            if (!forbiddenAnchorsFlat.includes(lower)) {
              forbiddenAnchorsFlat.push(lower);
            }
          }
        }
      }
    }
    // Ranker config for slot extraction penalties
    const rankerCfg = safeGetBank<Record<string, any>>(
      bankLoader,
      BANK_IDS.retrievalRankerConfig,
    );
    confusionPenaltyDefault = safeNumber(
      rankerCfg?.config?.slotExtraction?.forbiddenRolePenalty,
      0.25,
    );
  }

  const out: CandidateChunk[] = [];
  for (const c of candidates) {
    if (allowedDocSet && !allowedDocSet.has(c.docId)) {
      c.signals.scopeViolation = true;
      if (scopeMetrics) {
        scopeMetrics.scopeCandidatesDropped += 1;
      }
      continue;
    }

    // Soft/Hard: low relevance chunk exclusion
    // When hard scope is active (user attached specific docs), use a much
    // lower minRelevance threshold.  The user explicitly chose these docs,
    // so we should let more of their content through to the LLM rather
    // than filtering aggressively on keyword-overlap relevance scores.
    const isInScope = allowedDocSet && allowedDocSet.has(c.docId);
    const effectiveMinRelevance = isInScope
      ? Math.min(minRelevance, 0.05)
      : minRelevance;
    const topScore = Math.max(
      c.scores.semantic ?? 0,
      c.scores.lexical ?? 0,
      c.scores.structural ?? 0,
    );
    if (topScore < effectiveMinRelevance) {
      c.signals.lowRelevanceChunk = true;
      continue;
    }

    // Slot extraction: role-confusion penalty
    if (isExtraction && slotContract) {
      const snippetLower = (c.snippet ?? "").toLowerCase();
      const hasTarget = targetAnchors.some((a) => snippetLower.includes(a));
      const hasForbidden = forbiddenAnchorsFlat.some((a) =>
        snippetLower.includes(a),
      );

      if (hasForbidden && !hasTarget) {
        // Apply confusion penalty — keep chunk but penalize score
        c.scores.penalties = clamp01(
          (c.scores.penalties ?? 0) + confusionPenaltyDefault,
        );
      } else if (hasTarget) {
        // Boost chunks containing target role anchors
        const rankerCfg = safeGetBank<Record<string, any>>(
          bankLoader,
          BANK_IDS.retrievalRankerConfig,
        );
        const anchorBoost = safeNumber(
          rankerCfg?.config?.slotExtraction?.roleAnchorBoost,
          0.15,
        );
        c.scores.keywordBoost = clamp01(
          (c.scores.keywordBoost ?? 0) + anchorBoost,
        );
      }
    }

    // TOC-like content detection.
    // BUG FIX #3 (part 1): Instead of mutating c.scores.final here
    // (before the Ranker computes the weighted sum), we record a signal
    // that the Ranker will apply *after* computing the weighted sum.
    if (looksLikeTOC(c.snippet ?? "")) {
      c.signals.tocPenaltyMultiplier = 0.2;
      c.signals.tocCandidate = true;
    }

    out.push(c);
  }

  return out;
  } catch (err) {
    logger.warn("[retrieval:negativeRules] Error in applyRetrievalNegatives, degrading gracefully", {
      error: err instanceof Error ? err.message : String(err),
    });
    return candidates;
  }
}
