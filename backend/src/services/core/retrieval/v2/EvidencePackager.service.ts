/**
 * EvidencePackager — v2 extraction from RetrievalEngineService
 *
 * Standalone functions for packaging ranked candidates into the final
 * EvidencePack, including doc-level score blending, non-compare purity
 * filtering, snippet compression, and exploratory-mode detection.
 *
 * BUG FIX #4: In the legacy code, `selectedDocs.add(c.docId)` was only
 * called inside the `if (enforceNonComparePurity)` block. This meant that
 * when purity enforcement was inactive, the universal doc-diversity safety
 * net (which checks `selectedDocs.size`) would never see any docs, effectively
 * disabling the secondary-doc score-gap filter. Fixed by moving the
 * `selectedDocs.add(c.docId)` call OUTSIDE the conditional block so it
 * tracks ALL selected docs unconditionally.
 */

import { logger } from "../../../../utils/logger";
import type {
  CandidateChunk,
  DocumentClassificationResult,
  EvidenceItem,
  EvidencePack,
  RetrievalPhaseCounts,
  RetrievalRequest,
  RetrievalScopeMetrics,
  RetrievalScope,
  BankLoader,
} from "../retrieval.types";
import { clamp01, safeNumber, safeGetBank } from "../retrievalEngine.utils";
import { BANK_IDS } from "./retrieval.config";
import { normalizeDocType } from "./DocumentClassification.service";
import { detectEvidenceConflicts } from "./ConflictDetection.service";
import { selectEvidenceFromCandidates } from "./EvidenceSelection.service";
import type { DocumentIntelligenceBanksService } from "../../banks/documentIntelligenceBanks.service";

// safeGetBank imported from retrievalEngine.utils

// ── Doc-Level Scoring ───────────────────────────────────────────────

export function computeDocLevelScores(
  candidates: CandidateChunk[],
): Map<string, number> {
  const byDoc = new Map<string, number[]>();
  for (const c of candidates) {
    const scores = byDoc.get(c.docId) ?? [];
    scores.push(c.scores.final ?? 0);
    byDoc.set(c.docId, scores);
  }

  const result = new Map<string, number>();
  for (const [docId, scores] of byDoc) {
    scores.sort((a, b) => b - a);
    const maxScore = scores[0] ?? 0;
    const top3 = scores.slice(0, 3);
    const meanTop3 = top3.reduce((a, b) => a + b, 0) / top3.length;
    result.set(docId, maxScore * 0.7 + meanTop3 * 0.3);
  }
  return result;
}

// ── Exploratory Mode Detection ──────────────────────────────────────

export function isExploratoryRetrievalRequest(params: {
  compareIntent: boolean;
  queryNormalized: string;
  signals: RetrievalRequest["signals"];
  classification: DocumentClassificationResult;
  resolvedDocTypes: string[];
}): boolean {
  if (params.compareIntent) return false;
  if (params.signals.corpusSearchAllowed) return true;
  if (
    params.signals.explicitDocLock ||
    params.signals.explicitDocRef ||
    params.signals.singleDocIntent
  ) {
    return false;
  }

  const intentFamily = String(params.signals.intentFamily || "")
    .trim()
    .toLowerCase();
  if (intentFamily === "doc_discovery") return true;

  const operator = String(params.signals.operator || "")
    .trim()
    .toLowerCase();
  if (["locate_docs", "navigate", "list", "monitor"].includes(operator)) {
    return true;
  }

  const query = String(params.queryNormalized || "")
    .trim()
    .toLowerCase();
  if (
    /\b(list|all|which (docs|files)|where else|across (docs|files)|documents? mentioning|files? mentioning|todos|visa[oã]o geral|compara|entre .+ e .+|quais (docs|documentos|arquivos)|dos (docs|documentos) anexa)/i.test(
      query,
    )
  ) {
    return true;
  }

  if (params.classification.confidence < 0.4) return true;
  return false;
}

// ── Non-Compare Purity Pre-Rank ─────────────────────────────────────

export function applyNonComparePurityPreRank(
  candidates: CandidateChunk[],
  params: {
    compareIntent: boolean;
    classification: DocumentClassificationResult;
    resolvedDocTypes: string[];
    signals: RetrievalRequest["signals"];
    exploratoryMode: boolean;
  },
): CandidateChunk[] {
  if (params.compareIntent) return candidates;
  if (params.signals.corpusSearchAllowed) return candidates;
  if (params.exploratoryMode) return candidates;
  if (params.classification.confidence < 0.6) return candidates;
  const primaryDocType = normalizeDocType(params.resolvedDocTypes[0]);
  if (!primaryDocType) return candidates;

  const filtered = candidates.filter((candidate) => {
    const candidateDocType = normalizeDocType(candidate.docType);
    return candidateDocType === primaryDocType;
  });
  if (!filtered.length) return candidates;

  return filtered;
}

// ── Evidence Packaging ──────────────────────────────────────────────

/**
 * Package ranked candidates into the final EvidencePack.
 *
 * BUG FIX #4: `selectedDocs` is now always populated (not just inside the
 * `enforceNonComparePurity` block), so the universal doc-diversity safety
 * net functions correctly even when purity enforcement is off.
 */
export function packageEvidence(
  candidates: CandidateChunk[],
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  packagingBank: Record<string, any>,
  ctx: {
    queryOriginal: string;
    queryNormalized: string;
    expandedQueries: string[];
    scope: RetrievalScope;
    compareIntent: boolean;
    exploratoryMode: boolean;
    classification: DocumentClassificationResult;
    resolvedDocTypes: string[];
    phaseCounts: RetrievalPhaseCounts;
    scopeMetrics: RetrievalScopeMetrics;
    bankLoader: BankLoader;
    documentIntelligenceBanks: Partial<Pick<DocumentIntelligenceBanksService, "getDocTypeExtractionHints">> & Record<string, any>;
    isEncryptedOnlyMode: boolean;
  },
): EvidencePack {
  try {
  return packageEvidenceCore(candidates, req, signals, packagingBank, ctx);
  } catch (err) {
    logger.warn("[retrieval:evidencePackager] Error in packageEvidence, degrading gracefully", {
      error: err instanceof Error ? err.message : String(err),
    });
    return emptyPack(req, ctx);
  }
}

function emptyPack(
  req: RetrievalRequest,
  ctx: { queryOriginal: string; queryNormalized: string; expandedQueries: string[]; scope: RetrievalScope },
): EvidencePack {
  return {
    runtimeStatus: "degraded",
    query: { original: ctx.queryOriginal, normalized: ctx.queryNormalized, expanded: ctx.expandedQueries.length ? ctx.expandedQueries : undefined },
    scope: { activeDocId: req.signals.activeDocId ?? null, explicitDocLock: Boolean(req.signals.explicitDocLock), candidateDocIds: ctx.scope.candidateDocIds, hardScopeActive: ctx.scope.hardScopeActive, sheetName: ctx.scope.sheetName ?? null, rangeA1: ctx.scope.rangeA1 ?? null },
    stats: { candidatesConsidered: 0, candidatesAfterNegatives: 0, candidatesAfterBoosts: 0, candidatesAfterDiversification: 0, scopeCandidatesDropped: 0, scopeViolationsDetected: 0, scopeViolationsThrown: 0, evidenceItems: 0, uniqueDocsInEvidence: 0, topScore: null, scoreGap: null, docLevelScores: {} },
    evidence: [],
    conflicts: [],
    debug: { phases: [], reasonCodes: ["evidence_packager_error"] },
  };
}

function packageEvidenceCore(
  candidates: CandidateChunk[],
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  packagingBank: Record<string, any>,
  ctx: {
    queryOriginal: string;
    queryNormalized: string;
    expandedQueries: string[];
    scope: RetrievalScope;
    compareIntent: boolean;
    exploratoryMode: boolean;
    classification: DocumentClassificationResult;
    resolvedDocTypes: string[];
    phaseCounts: RetrievalPhaseCounts;
    scopeMetrics: RetrievalScopeMetrics;
    bankLoader: BankLoader;
    documentIntelligenceBanks: Partial<Pick<DocumentIntelligenceBanksService, "getDocTypeExtractionHints">> & Record<string, any>;
    isEncryptedOnlyMode: boolean;
  },
): EvidencePack {
  const cfg = packagingBank?.config ?? {};
  const scpBank = safeGetBank<Record<string, any>>(ctx.bankLoader, BANK_IDS.snippetCompressionPolicy);
  const scpConfig = (scpBank as Record<string, any>)?.config ?? {};
  const maxSnippetChars = safeNumber(scpConfig.maxSnippetChars, 2200);
  const preserveNumericUnits = scpConfig.preserveNumericUnits !== false;
  const preserveHeadings = scpConfig.preserveHeadings !== false;
  const hasQuotedText = Boolean(signals.hasQuotedText);
  const maxEvidenceHard = safeNumber(
    cfg.actionsContract?.thresholds?.maxEvidenceItemsHard,
    36,
  );
  const maxPerDocHard = safeNumber(
    cfg.actionsContract?.thresholds?.maxEvidencePerDocHard,
    10,
  );
  const maxDistinctDocsNonCompare = Math.max(
    1,
    Math.floor(
      safeNumber(
        cfg.actionsContract?.thresholds?.maxDistinctDocsNonCompare,
        1,
      ),
    ),
  );
  const maxDistinctDocsExploratoryNonCompare = Math.max(
    maxDistinctDocsNonCompare,
    Math.floor(
      safeNumber(
        cfg.actionsContract?.thresholds?.maxDistinctDocsExploratoryNonCompare,
        maxDistinctDocsNonCompare,
      ),
    ),
  );
  const maxPerSectionHard = Math.max(
    1,
    Math.floor(
      safeNumber(cfg.actionsContract?.thresholds?.maxPerSectionHard, 1),
    ),
  );
  const maxPerSectionExploratoryHard = Math.max(
    maxPerSectionHard,
    Math.floor(
      safeNumber(
        cfg.actionsContract?.thresholds?.maxPerSectionExploratoryHard,
        maxPerSectionHard,
      ),
    ),
  );
  const maxNearDuplicatesPerDocPackaging = Math.max(
    1,
    Math.floor(
      safeNumber(
        cfg.actionsContract?.thresholds?.maxNearDuplicatesPerDocPackaging,
        safeNumber(
          cfg.actionsContract?.thresholds?.maxNearDuplicatesPerDoc,
          1,
        ),
      ),
    ),
  );
  const maxNearDuplicatesExploratoryPerDocPackaging = Math.max(
    maxNearDuplicatesPerDocPackaging,
    Math.floor(
      safeNumber(
        cfg.actionsContract?.thresholds
          ?.maxNearDuplicatesExploratoryPerDocPackaging,
        maxNearDuplicatesPerDocPackaging,
      ),
    ),
  );
  const effectiveMaxDistinctDocsNonCompare = ctx.exploratoryMode
    ? maxDistinctDocsExploratoryNonCompare
    : maxDistinctDocsNonCompare;
  const effectiveMaxPerSectionHard = ctx.exploratoryMode
    ? maxPerSectionExploratoryHard
    : maxPerSectionHard;
  const effectiveMaxNearDuplicatesPerDocPackaging = ctx.exploratoryMode
    ? maxNearDuplicatesExploratoryPerDocPackaging
    : maxNearDuplicatesPerDocPackaging;
  const minFinalScore = safeNumber(
    cfg.actionsContract?.thresholds?.minFinalScore,
    0.28,
  );
  const effectiveMinFinalScore = ctx.isEncryptedOnlyMode
    ? Math.min(minFinalScore, 0.05)
    : minFinalScore;

  const isExtraction = Boolean(
    signals.isExtractionQuery && signals.slotContract,
  );
  const scopeDocSet =
    Array.isArray(ctx.scope.candidateDocIds) &&
    ctx.scope.candidateDocIds.length > 0
      ? new Set(ctx.scope.candidateDocIds)
      : null;
  let extractionMinScore = effectiveMinFinalScore;
  if (isExtraction) {
    const rankerCfg = safeGetBank<Record<string, any>>(ctx.bankLoader, BANK_IDS.retrievalRankerConfig);
    extractionMinScore = safeNumber(
      rankerCfg?.config?.slotExtraction?.scopedMinFinalScoreOverride,
      0.45,
    );
  }

  const scopedMinScore = ctx.scope.hardScopeActive ? 0 : effectiveMinFinalScore;

  // Doc-level aggregation: blend 5% doc score into chunk scores
  const docScores = computeDocLevelScores(candidates);
  for (const c of candidates) {
    const docScore = docScores.get(c.docId) ?? 0;
    const chunkScore = c.scores.final ?? 0;
    c.scores.final = chunkScore * 0.95 + docScore * 0.05;
  }
  candidates.sort((a, b) => (b.scores.final ?? 0) - (a.scores.final ?? 0));

  const evidence = selectEvidenceFromCandidates(candidates, {
    signals,
    scope: ctx.scope,
    compareIntent: ctx.compareIntent,
    exploratoryMode: ctx.exploratoryMode,
    classification: ctx.classification,
    resolvedDocTypes: ctx.resolvedDocTypes,
    isEncryptedOnlyMode: ctx.isEncryptedOnlyMode,
    documentIntelligenceBanks: ctx.documentIntelligenceBanks as unknown as Record<string, any>,
    effectiveMinFinalScore,
    extractionMinScore,
    scopedMinScore,
    maxPerDocHard,
    maxEvidenceHard,
    maxDistinctDocsExploratoryNonCompare,
    effectiveMaxDistinctDocsNonCompare,
    effectiveMaxPerSectionHard,
    effectiveMaxNearDuplicatesPerDocPackaging,
    maxSnippetChars,
    preserveNumericUnits,
    preserveHeadings,
    hasQuotedText,
  });

  // PACK_004 — Preserve ranking priority; stabilize ties for coherent reading order
  evidence.sort((a, b) => {
    const scoreDelta = (b.score?.finalScore ?? 0) - (a.score?.finalScore ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    if (a.docId !== b.docId) return a.docId < b.docId ? -1 : 1;
    const pageA = Number(a.location?.page ?? 0);
    const pageB = Number(b.location?.page ?? 0);
    if (pageA !== pageB) return pageA - pageB;
    return (a.locationKey || "").localeCompare(b.locationKey || "");
  });

  // PACK_005 — Dedupe near-duplicate snippets within same doc
  const packDedupeWindowChars = 260;
  {
    const seenHashes = new Map<string, Set<string>>();
    const deduped: EvidenceItem[] = [];
    for (const item of evidence) {
      const text = String(item.snippet || "").replace(/\s+/g, " ").trim();
      const window = text.slice(0, packDedupeWindowChars).toLowerCase();
      if (window.length > 0) {
        const docHashes = seenHashes.get(item.docId) ?? new Set<string>();
        if (docHashes.has(window)) continue;
        docHashes.add(window);
        seenHashes.set(item.docId, docHashes);
      }
      deduped.push(item);
    }
    evidence.length = 0;
    evidence.push(...deduped);
  }

  // PACK_003 — Balance for compare intent
  if (ctx.compareIntent && evidence.length > 2) {
    const docGroups = new Map<string, EvidenceItem[]>();
    for (const item of evidence) {
      const group = docGroups.get(item.docId) ?? [];
      group.push(item);
      docGroups.set(item.docId, group);
    }
    if (docGroups.size > 1) {
      const avgCount = evidence.length / docGroups.size;
      const maxAllowed = Math.max(2, Math.ceil(avgCount * 2));
      const balanced: EvidenceItem[] = [];
      for (const [, group] of docGroups) {
        balanced.push(...group.slice(0, maxAllowed));
      }
      evidence.length = 0;
      evidence.push(...balanced);
    }
  }

  // Per-doc cap from bank config
  {
    const evidencePackagingPolicy = safeGetBank<Record<string, any>>(ctx.bankLoader, BANK_IDS.evidencePackagingPolicy);
    const packMaxPerDoc = safeNumber(
      evidencePackagingPolicy?.config?.maxPerDoc,
      maxPerDocHard,
    );
    const docCounts = new Map<string, number>();
    const capped: EvidenceItem[] = [];
    for (const item of evidence) {
      const count = docCounts.get(item.docId) ?? 0;
      if (count >= packMaxPerDoc) continue;
      docCounts.set(item.docId, count + 1);
      capped.push(item);
    }
    evidence.length = 0;
    evidence.push(...capped);
  }

  const uniqueDocs = new Set(evidence.map((e) => e.docId));
  const topScore = evidence.length ? evidence[0].score.finalScore : null;
  const scoreGap =
    evidence.length >= 2
      ? clamp01(
          (evidence[0].score.finalScore ?? 0) -
            (evidence[1].score.finalScore ?? 0),
        )
      : null;

  const pack: EvidencePack = {
    runtimeStatus: "ok",
    query: {
      original: ctx.queryOriginal,
      normalized: ctx.queryNormalized,
      expanded: ctx.expandedQueries.length ? ctx.expandedQueries : undefined,
    },
    scope: {
      activeDocId: signals.activeDocId ?? null,
      explicitDocLock: Boolean(signals.explicitDocLock),
      candidateDocIds: ctx.scope.candidateDocIds,
      hardScopeActive: ctx.scope.hardScopeActive,
      sheetName: ctx.scope.sheetName ?? null,
      rangeA1: ctx.scope.rangeA1 ?? null,
    },
    stats: {
      candidatesConsidered: ctx.phaseCounts.considered,
      candidatesAfterNegatives: ctx.phaseCounts.afterNegatives,
      candidatesAfterBoosts: ctx.phaseCounts.afterBoosts,
      candidatesAfterDiversification: ctx.phaseCounts.afterDiversification,
      scopeCandidatesDropped: ctx.scopeMetrics.scopeCandidatesDropped,
      scopeViolationsDetected: ctx.scopeMetrics.scopeViolationsDetected,
      scopeViolationsThrown: ctx.scopeMetrics.scopeViolationsThrown,
      evidenceItems: evidence.length,
      uniqueDocsInEvidence: uniqueDocs.size,
      topScore,
      scoreGap,
      docLevelScores: Object.fromEntries(docScores),
    },
    evidence,
    conflicts: [],
    debug: {
      phases: [],
      reasonCodes: [],
    },
  };

  pack.conflicts = detectEvidenceConflicts(evidence);

  return pack;
}
