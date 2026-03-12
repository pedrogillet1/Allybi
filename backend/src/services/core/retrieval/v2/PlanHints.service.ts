/**
 * PlanHints — v2 extraction from RetrievalEngineService
 *
 * Standalone functions for applying retrieval plan hints to candidates.
 * These adjust keyword/penalty scores based on plan-provided signals
 * such as required terms, excluded terms, doc-type preferences, and
 * location targets.
 */

import { logger } from "../../../../utils/logger";
import type { RetrievalPlan } from "../retrievalPlanParser.service";
import type { CandidateChunk } from "../retrieval.types";
import { clamp01 } from "../retrievalEngine.utils";
import { normalizeDocType } from "./DocumentClassification.service";

// ── Plan Hint Application ───────────────────────────────────────────

/**
 * Apply retrieval plan hints to candidates, boosting/penalizing based
 * on required terms, excluded terms, doc-type preferences, location
 * targets, entities, metrics, and time hints.
 */
export function applyRetrievalPlanHints(
  candidates: CandidateChunk[],
  retrievalPlan?: Partial<RetrievalPlan> | null,
): CandidateChunk[] {
  if (!retrievalPlan) return candidates;

  const requiredTerms = normalizePlanHintTerms(
    retrievalPlan.requiredTerms,
    10,
  );
  const excludedTerms = normalizePlanHintTerms(
    retrievalPlan.excludedTerms,
    10,
  );
  const docTypePreferences = normalizePlanHintTerms(
    retrievalPlan.docTypePreferences,
    4,
  );
  const locationTargets = Array.isArray(retrievalPlan.locationTargets)
    ? retrievalPlan.locationTargets
        .map((target) => {
          const rawType = String((target as Record<string, any>)?.type || "")
            .trim()
            .toLowerCase();
          const rawValue = String((target as Record<string, any>)?.value || "")
            .trim()
            .toLowerCase();
          if (!rawType || !rawValue) return null;
          return { type: rawType, value: rawValue };
        })
        .filter(
          (target): target is { type: string; value: string } =>
            target !== null,
        )
        .slice(0, 8)
    : [];

  const entities = normalizePlanHintTerms(
    retrievalPlan.entities,
    8,
  );
  const metrics = normalizePlanHintTerms(
    retrievalPlan.metrics,
    8,
  );
  const timeHints = normalizePlanHintTerms(
    retrievalPlan.timeHints,
    3,
  );

  if (
    requiredTerms.length === 0 &&
    excludedTerms.length === 0 &&
    docTypePreferences.length === 0 &&
    locationTargets.length === 0 &&
    entities.length === 0 &&
    metrics.length === 0 &&
    timeHints.length === 0
  ) {
    return candidates;
  }

  for (const candidate of candidates) {
    const searchable = buildSearchableTextForPlannerHint(candidate);
    if (requiredTerms.length > 0) {
      const requiredHits = requiredTerms.filter((term) =>
        searchable.includes(term),
      ).length;
      if (requiredHits > 0) {
        candidate.scores.keywordBoost = clamp01(
          (candidate.scores.keywordBoost ?? 0) +
            Math.min(0.18, requiredHits * 0.05),
        );
      } else {
        candidate.scores.penalties = clamp01(
          (candidate.scores.penalties ?? 0) + 0.06,
        );
      }
    }

    if (excludedTerms.length > 0) {
      const excludedHits = excludedTerms.filter((term) =>
        searchable.includes(term),
      ).length;
      if (excludedHits > 0) {
        candidate.scores.penalties = clamp01(
          (candidate.scores.penalties ?? 0) +
            Math.min(0.28, excludedHits * 0.1),
        );
      }
    }

    if (docTypePreferences.length > 0) {
      const docType = normalizeDocType(candidate.docType);
      if (docType && docTypePreferences.includes(docType)) {
        candidate.scores.typeBoost = clamp01(
          (candidate.scores.typeBoost ?? 0) + 0.08,
        );
      }
    }

    if (locationTargets.length > 0) {
      const hit = locationTargets.some((target) =>
        matchesPlannerLocationTarget(candidate, target),
      );
      if (hit) {
        candidate.scores.keywordBoost = clamp01(
          (candidate.scores.keywordBoost ?? 0) + 0.07,
        );
      }
    }

    if (entities.length > 0) {
      const entityHits = entities.filter((entity) =>
        searchable.includes(entity),
      ).length;
      if (entityHits > 0) {
        candidate.scores.keywordBoost = clamp01(
          (candidate.scores.keywordBoost ?? 0) +
            Math.min(0.12, entityHits * 0.04),
        );
      }
    }

    if (metrics.length > 0) {
      const hasDigit = /\d/.test(searchable);
      for (const metric of metrics) {
        if (searchable.includes(metric)) {
          candidate.scores.keywordBoost = clamp01(
            (candidate.scores.keywordBoost ?? 0) +
              (hasDigit ? 0.06 : 0.02),
          );
          break;
        }
      }
    }

    if (timeHints.length > 0) {
      const timeHit = timeHints.some((hint) =>
        searchable.includes(hint),
      );
      if (timeHit) {
        candidate.scores.keywordBoost = clamp01(
          (candidate.scores.keywordBoost ?? 0) + 0.05,
        );
      } else {
        candidate.scores.penalties = clamp01(
          (candidate.scores.penalties ?? 0) + 0.03,
        );
      }
    }
  }

  return candidates;
}

// ── Hint Normalization ──────────────────────────────────────────────

/**
 * Normalize an array of hint terms: lowercase, trim, dedupe, and cap
 * at `maxItems`.
 */
export function normalizePlanHintTerms(values: unknown, maxItems: number): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

// ── Searchable Text Builder ─────────────────────────────────────────

/**
 * Build a single searchable text string from all relevant candidate
 * fields for matching against plan hints.
 */
export function buildSearchableTextForPlannerHint(candidate: CandidateChunk): string {
  const parts = [
    candidate.snippet,
    candidate.rawText,
    candidate.title,
    candidate.filename,
    candidate.docType,
    candidate.location.sectionKey,
    candidate.location.sheet,
    candidate.location.page != null ? `page ${candidate.location.page}` : "",
    candidate.location.slide != null
      ? `slide ${candidate.location.slide}`
      : "",
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return parts.join(" ");
}

// ── Location Target Matching ────────────────────────────────────────

/**
 * Check whether a candidate matches a planner-provided location target.
 */
export function matchesPlannerLocationTarget(
  candidate: CandidateChunk,
  target: { type: string; value: string },
): boolean {
  if (!target.value) return false;
  if (target.type === "sheet") {
    return String(candidate.location.sheet || "")
      .trim()
      .toLowerCase()
      .includes(target.value);
  }
  if (target.type === "section") {
    return String(candidate.location.sectionKey || "")
      .trim()
      .toLowerCase()
      .includes(target.value);
  }
  if (target.type === "page") {
    return String(candidate.location.page ?? "").trim() === target.value;
  }
  if (target.type === "slide") {
    return String(candidate.location.slide ?? "").trim() === target.value;
  }
  if (target.type === "cell" || target.type === "range") {
    return String(candidate.snippet || "")
      .trim()
      .toLowerCase()
      .includes(target.value);
  }
  return buildSearchableTextForPlannerHint(candidate).includes(
    target.value,
  );
}
