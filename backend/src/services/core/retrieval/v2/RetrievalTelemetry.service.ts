import { logger } from "../../../../utils/logger";

/**
 * RetrievalTelemetry — v2 extraction
 *
 * Standalone telemetry and empty-pack builders extracted from
 * RetrievalEngineService.
 *
 * BUG FIX #7: Removed overclaiming comments.  All doc-comments now
 * describe actual behaviour without aspirational guarantees.
 */

import type {
  RetrievalRequest,
  RetrievalRuleTelemetryEvent,
  EvidencePack,
  DocumentClassificationResult,
} from "../retrieval.types";
import { isProductionEnv } from "../retrievalEngine.utils";
import { resolveDocScopeLockFromSignals } from "../docScopeLock";

// ── Telemetry diagnostics builder ────────────────────────────────────

/**
 * Build the `telemetry` section of an EvidencePack from accumulated
 * rule events and classification results.  Deduplicates and sorts
 * all identifier arrays for stable output.
 */
export function buildTelemetryDiagnostics(params: {
  ruleEvents: RetrievalRuleTelemetryEvent[];
  matchedBoostRuleIds: string[];
  appliedBoostRuleIds: string[];
  rewriteRuleIds: string[];
  selectedSectionRuleId: string | null;
  crossDocGatedReason: string | null;
  classification: DocumentClassificationResult;
}): EvidencePack["telemetry"] {
  const dedupe = (values: string[]) =>
    Array.from(
      new Set(
        values.map((value) => String(value || "").trim()).filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  return {
    ruleEvents: (params.ruleEvents || []).slice(),
    summary: {
      matchedBoostRuleIds: dedupe(params.matchedBoostRuleIds),
      appliedBoostRuleIds: dedupe(params.appliedBoostRuleIds),
      rewriteRuleIds: dedupe(params.rewriteRuleIds),
      selectedSectionRuleId: params.selectedSectionRuleId || null,
      crossDocGatedReason: params.crossDocGatedReason || null,
      classifiedDomain: params.classification.domain || null,
      classifiedDocTypeId: params.classification.docTypeId || null,
      classificationReasons: Array.from(
        new Set(
          (params.classification.reasons || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      ).slice(0, 12),
    },
  };
}

// ── Empty evidence pack ──────────────────────────────────────────────

/**
 * Create a minimal EvidencePack with zero evidence items.
 * Used for early-exit paths (e.g. no documents, empty query, cache miss
 * fallback) where the pipeline cannot produce meaningful results.
 *
 * Debug information is included only in non-production environments.
 */
export function emptyPack(
  req: RetrievalRequest,
  dbg: { reasonCodes: string[]; note?: string },
  telemetry?: EvidencePack["telemetry"],
): EvidencePack {
  const docScopeLock = resolveDocScopeLockFromSignals(req.signals);
  const candidateDocIds =
    docScopeLock.mode !== "none"
      ? docScopeLock.allowedDocumentIds
      : Array.from(
          new Set(
            [
              ...(Array.isArray(req.signals.allowedDocumentIds)
                ? req.signals.allowedDocumentIds
                : []),
              req.signals.resolvedDocId ?? "",
              req.signals.activeDocId ?? "",
            ]
              .map((value) => String(value || "").trim())
              .filter(Boolean),
          ),
        );
  const hardScopeActive =
    Boolean(req.signals.hardScopeActive) ||
    docScopeLock.mode !== "none" ||
    (Boolean(req.signals.explicitDocLock) &&
      Boolean(req.signals.activeDocId)) ||
    (Boolean(req.signals.singleDocIntent) &&
      Boolean(req.signals.activeDocId)) ||
    (Boolean(req.signals.explicitDocRef) &&
      Boolean(req.signals.resolvedDocId));

  return {
    runtimeStatus: "ok",
    query: { original: req.query, normalized: (req.query ?? "").trim() },
    scope: {
      activeDocId: req.signals.activeDocId ?? null,
      explicitDocLock: Boolean(req.signals.explicitDocLock),
      candidateDocIds,
      hardScopeActive,
      sheetName: req.signals.resolvedSheetName ?? null,
      rangeA1: req.signals.resolvedRangeA1 ?? null,
    },
    stats: {
      candidatesConsidered: 0,
      candidatesAfterNegatives: 0,
      candidatesAfterBoosts: 0,
      candidatesAfterDiversification: 0,
      scopeCandidatesDropped: 0,
      scopeViolationsDetected: 0,
      scopeViolationsThrown: 0,
      evidenceItems: 0,
      uniqueDocsInEvidence: 0,
      topScore: null,
      scoreGap: null,
    },
    evidence: [],
    telemetry,
    debug: isProductionEnv(req.env)
      ? undefined
      : { phases: [], reasonCodes: dbg.reasonCodes },
  };
}
