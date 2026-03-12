/**
 * EvidenceSelection — extracted from EvidencePackager
 *
 * Handles the candidate-to-evidence selection loop: per-doc caps, section caps,
 * near-dup hashing, doc-type purity, TOC capping, universal doc-diversity
 * safety net, and score-threshold gating.
 */

import crypto from "crypto";

import type {
  CandidateChunk,
  DocumentClassificationResult,
  EvidenceItem,
  RetrievalRequest,
  RetrievalScope,
} from "../retrieval.types";
import { clamp01 } from "../retrievalEngine.utils";
import { normalizeDocType } from "./DocumentClassification.service";
import { normalizeForNearDup } from "./Diversifier.service";
import { compressSnippet } from "./SnippetCompression.service";
import { lookupExtractionHints } from "./BoostEngine.service";

// ── Selection Options ───────────────────────────────────────────────

export interface EvidenceSelectionOpts {
  signals: RetrievalRequest["signals"];
  scope: RetrievalScope;
  compareIntent: boolean;
  exploratoryMode: boolean;
  classification: DocumentClassificationResult;
  resolvedDocTypes: string[];
  isEncryptedOnlyMode: boolean;
  documentIntelligenceBanks: Record<string, any>;

  // Thresholds
  effectiveMinFinalScore: number;
  extractionMinScore: number;
  scopedMinScore: number;

  // Caps
  maxPerDocHard: number;
  maxEvidenceHard: number;
  maxDistinctDocsExploratoryNonCompare: number;
  effectiveMaxDistinctDocsNonCompare: number;
  effectiveMaxPerSectionHard: number;
  effectiveMaxNearDuplicatesPerDocPackaging: number;

  // Snippet compression
  maxSnippetChars: number;
  preserveNumericUnits: boolean;
  preserveHeadings: boolean;
  hasQuotedText: boolean;
}

// ── Main Selection Function ─────────────────────────────────────────

export function selectEvidenceFromCandidates(
  candidates: CandidateChunk[],
  opts: EvidenceSelectionOpts,
): EvidenceItem[] {
  const {
    signals,
    scope,
    compareIntent,
    exploratoryMode,
    classification,
    resolvedDocTypes,
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
    documentIntelligenceBanks,
  } = opts;

  const isExtraction = Boolean(
    signals.isExtractionQuery && signals.slotContract,
  );
  const scopeDocSet =
    Array.isArray(scope.candidateDocIds) && scope.candidateDocIds.length > 0
      ? new Set(scope.candidateDocIds)
      : null;

  const evidence: EvidenceItem[] = [];
  const perDoc = new Map<string, number>();
  const selectedDocs = new Set<string>();
  const perDocSectionCounts = new Map<string, Map<string, number>>();
  const perDocSnippetHashes = new Map<string, Map<string, number>>();
  const tocPerDoc = new Map<string, number>();
  const primaryDocType = normalizeDocType(resolvedDocTypes[0]);
  const enforceNonComparePurity =
    !compareIntent &&
    !Boolean(signals.corpusSearchAllowed) &&
    classification.confidence >= 0.35 &&
    (Boolean(primaryDocType) ||
      Boolean(signals.singleDocIntent) ||
      Boolean(signals.explicitDocLock) ||
      Boolean(signals.explicitDocRef));

  for (const c of candidates) {
    if (!c.provenanceOk) continue;
    const final = c.scores.final ?? 0;
    const isScoped = scopeDocSet && scopeDocSet.has(c.docId);
    const effectiveMin =
      isExtraction && isScoped
        ? extractionMinScore
        : isScoped
          ? scopedMinScore
          : effectiveMinFinalScore;
    if (final < effectiveMin) continue;

    // ── Universal doc-diversity safety net ──
    if (!compareIntent && !Boolean(signals.corpusSearchAllowed)) {
      if (selectedDocs.size > 0 && !selectedDocs.has(c.docId)) {
        const primaryTopScore = evidence[0]?.score?.finalScore ?? 0;
        if (primaryTopScore > 0 && final < primaryTopScore * 0.55) {
          continue;
        }
        if (selectedDocs.size >= maxDistinctDocsExploratoryNonCompare) {
          continue;
        }
      }
    }

    if (enforceNonComparePurity) {
      if (exploratoryMode && selectedDocs.size > 0 && !selectedDocs.has(c.docId)) {
        const primaryTopScore = evidence[0]?.score?.finalScore ?? 0;
        if (primaryTopScore > 0 && final < primaryTopScore * 0.6) {
          continue;
        }
      }

      if (
        !selectedDocs.has(c.docId) &&
        selectedDocs.size >= effectiveMaxDistinctDocsNonCompare
      ) {
        continue;
      }

      if (primaryDocType && !exploratoryMode) {
        const candidateDocType = normalizeDocType(c.docType);
        if (candidateDocType && candidateDocType !== primaryDocType) continue;
      }

      const sectionKey = String(c.location?.sectionKey || "__unknown__")
        .trim()
        .toLowerCase();
      const sectionMap =
        perDocSectionCounts.get(c.docId) ?? new Map<string, number>();
      const sectionCount = sectionMap.get(sectionKey) ?? 0;
      if (sectionCount >= effectiveMaxPerSectionHard) continue;

      const snippetHash = crypto
        .createHash("sha256")
        .update(normalizeForNearDup(c.snippet))
        .digest("hex")
        .slice(0, 16);
      const hashMap =
        perDocSnippetHashes.get(c.docId) ?? new Map<string, number>();
      const hashCount = hashMap.get(snippetHash) ?? 0;
      if (hashCount >= effectiveMaxNearDuplicatesPerDocPackaging) continue;

      sectionMap.set(sectionKey, sectionCount + 1);
      perDocSectionCounts.set(c.docId, sectionMap);
      hashMap.set(snippetHash, hashCount + 1);
      perDocSnippetHashes.set(c.docId, hashMap);
    }

    // Cap TOC candidates to max 1 per document
    if (c.signals?.tocCandidate) {
      const tocCount = tocPerDoc.get(c.docId) ?? 0;
      if (tocCount >= 1) continue;
      tocPerDoc.set(c.docId, tocCount + 1);
    }

    const n = perDoc.get(c.docId) ?? 0;
    if (n >= maxPerDocHard) continue;

    perDoc.set(c.docId, n + 1);
    // BUG FIX #4: Track selected docs unconditionally
    selectedDocs.add(c.docId);

    evidence.push({
      evidenceType: c.type,
      docId: c.docId,
      title: c.title ?? null,
      filename: c.filename ?? null,
      location: c.location,
      locationKey: c.locationKey,
      snippet: c.snippet
        ? compressSnippet(c.snippet, {
            maxChars: maxSnippetChars,
            preserveNumericUnits,
            preserveHeadings,
            hasQuotedText,
            compareIntent,
          })
        : undefined,
      table: c.type === "table" ? (c.table ?? undefined) : undefined,
      imageRef: c.type === "image" ? null : undefined,
      score: {
        finalScore: clamp01(final),
        semanticScore: c.scores.semantic,
        lexicalScore: c.scores.lexical,
        structuralScore: c.scores.structural,
        boosts: {
          keywordBoost: c.scores.keywordBoost ?? 0,
          titleBoost: c.scores.titleBoost ?? 0,
          documentIntelligenceBoost: c.scores.documentIntelligenceBoost ?? 0,
          routingPriorityBoost: c.scores.routingPriorityBoost ?? 0,
          typeBoost: c.scores.typeBoost ?? 0,
          recencyBoost: c.scores.recencyBoost ?? 0,
        },
        penalties: {
          penalties: c.scores.penalties ?? 0,
        },
      },
      warnings: c.table?.warnings ?? undefined,
      extractionHints: (() => {
        const domain = classification?.domain || null;
        const docType = normalizeDocType(c.docType);
        if (!domain || !docType) return undefined;
        const hints = lookupExtractionHints(domain, docType, documentIntelligenceBanks);
        return hints.length > 0 ? hints : undefined;
      })(),
    });

    if (evidence.length >= maxEvidenceHard) break;
  }

  return evidence;
}
