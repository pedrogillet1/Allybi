/**
 * Retrieval Summary Types
 *
 * Canonical retrieval output contract that all downstream components depend on:
 * - answer_mode_router.any.json
 * - doc_grounding_checks.any.json
 * - quality_gates.any.json
 * - fallback routing banks
 *
 * This is the bridge between the retrieval engine and the bank-driven routing system.
 */

import type { RetrievedChunk } from '../../types/ragV3.types';

/**
 * Canonical reason codes for retrieval outcomes.
 * These map directly to fallback bank routing in fallback_router.any.json.
 */
export type RetrievalReasonCode =
  | 'ok'                                    // Retrieval succeeded with results
  | 'nav_metadata_only'                     // Nav query - no content retrieval needed
  | 'scope_hard_constraints_empty'          // Hard scope filters matched zero docs
  | 'no_relevant_chunks_in_scoped_docs'     // Docs in scope but no matching chunks
  | 'indexing_in_progress'                  // Docs are still being indexed
  | 'extraction_failed'                     // Document extraction/OCR failed
  | 'unknown';                              // Fallback for unexpected states

/**
 * Canonical retrieval summary consumed by all bank-driven routing.
 * This object is computed after retrieval and attached to the pipeline context.
 */
export interface RetrievalSummary {
  /** Which retrieval profile was used (e.g., 'hybrid', 'navRetrieval', 'discoveryMode') */
  profileUsed: string;

  /** Canonical reason code for routing decisions */
  reasonCode: RetrievalReasonCode;

  /** Number of chunks returned */
  resultCount: number;

  /** Number of candidate docs that were searched (after scope filtering) */
  docsSearched: number;

  /** Unique document IDs represented in the results */
  docsRepresented: string[];

  /** True if any hard scope constraints were applied (docIdAllowlist, filenameMustContain, activeDocHardLock) */
  scopeWasHard: boolean;

  /** True if activeDocRef.lockType === 'hard' was enforced this turn */
  activeDocHardLockApplied: boolean;

  /** True if hard constraints eliminated ALL candidate docs (nothing to search) */
  scopeEmpty: boolean;

  /** True if docs existed in scope but retrieval returned 0 chunks */
  scopedNoEvidence: boolean;
}

/**
 * Full retrieval envelope that wraps chunks + summary + existing metadata.
 * This is what the orchestrator works with after retrieval.
 */
export interface RetrievalEnvelope {
  /** Retrieved chunks */
  chunks: RetrievedChunk[];

  /** Canonical summary for bank-driven routing */
  summary: RetrievalSummary;

  /** Whether hybrid search was used (vector + BM25) */
  usedHybrid?: boolean;

  /** Details about the hybrid search configuration */
  hybridDetails?: {
    vectorTopK: number;
    bm25TopK: number;
    mergeStrategy: string;
  };

  /** Document boosts that were applied */
  appliedBoosts?: Array<{
    documentId: string;
    boostFactor: number;
    reason: string;
  }>;

  /** Nav result for file_actions/open/locate queries */
  navResult?: {
    docId: string;
    docTitle: string;
    fileName: string;
    folderPath?: string;
    docType?: string;
    uploadedAt?: string;
  };
}

/**
 * Input for building the retrieval summary.
 * These come from various parts of the orchestrator pipeline.
 */
export interface BuildRetrievalSummaryInput {
  /** Retrieved chunks from the retrieval engine */
  chunks: RetrievedChunk[];

  /** Profile that was used for retrieval */
  profileUsed: string;

  /** Scope configuration */
  scope?: {
    hard?: {
      docIdAllowlist?: string[];
      filenameMustContain?: string[];
    };
    explicit?: {
      filename?: string;
      docId?: string;
    };
  };

  /** Active document reference from previous turn */
  activeDocRef?: {
    documentId: string;
    filename: string;
    lockType: 'hard' | 'soft';
  };

  /** Signals from query analysis */
  signals?: {
    hasExplicitDocRef?: boolean;
    discoveryQuery?: boolean;
    navQuery?: boolean;
  };

  /** Operator from routing */
  operator?: string;

  /** Document context from database */
  docContext: {
    docCount: number;
    processingCount: number;
    failedCount: number;
    candidateCount?: number;
  };

  /** Whether hard constraints resulted in empty candidate set */
  hardConstraintEmpty?: boolean;

  /** Number of candidate docs after scope filtering */
  candidatesAfterFilter?: number;
}

/**
 * Build the canonical retrieval summary from pipeline inputs.
 * This is the core function that computes all the fields for bank-driven routing.
 */
export function buildRetrievalSummary(input: BuildRetrievalSummaryInput): RetrievalSummary {
  const {
    chunks,
    profileUsed,
    scope,
    activeDocRef,
    signals,
    operator,
    docContext,
    hardConstraintEmpty,
    candidatesAfterFilter,
  } = input;

  // A) docsRepresented - unique doc IDs in results
  const docsRepresented = [...new Set(chunks.map(c => c.documentId))];

  // B) resultCount
  const resultCount = chunks.length;

  // C) docsSearched - candidates that were actually searched
  const docsSearched = candidatesAfterFilter ?? docContext.candidateCount ?? docContext.docCount;

  // D) scopeWasHard - true if any hard constraints were applied
  const hasHardDocIdAllowlist = (scope?.hard?.docIdAllowlist?.length ?? 0) > 0;
  const hasHardFilenameMustContain = (scope?.hard?.filenameMustContain?.length ?? 0) > 0;
  const hasActiveDocHardLock = activeDocRef?.lockType === 'hard';
  const scopeWasHard = hasHardDocIdAllowlist || hasHardFilenameMustContain || hasActiveDocHardLock;

  // E) activeDocHardLockApplied - true only if activeDocRef.lockType === 'hard' was enforced
  // Must be: hard lock AND no explicit doc ref this turn AND not discovery AND actually restricted scope
  const activeDocHardLockApplied = Boolean(
    activeDocRef?.lockType === 'hard' &&
    !signals?.hasExplicitDocRef &&
    !signals?.discoveryQuery &&
    scope?.hard?.docIdAllowlist?.[0] === activeDocRef?.documentId
  );

  // F) scopeEmpty - hard constraints eliminated ALL candidate docs
  const scopeEmpty = Boolean(hardConstraintEmpty) ||
    (scopeWasHard && docsSearched === 0 && docContext.docCount > 0);

  // G) scopedNoEvidence - docs existed in scope but retrieval returned 0 chunks
  const scopedNoEvidence = Boolean(
    !scopeEmpty &&
    scopeWasHard &&
    resultCount === 0 &&
    docsSearched > 0
  );

  // H) reasonCode - computed based on priority order
  const reasonCode = computeReasonCode({
    operator,
    signals,
    scopeEmpty,
    scopedNoEvidence,
    resultCount,
    docContext,
  });

  return {
    profileUsed,
    reasonCode,
    resultCount,
    docsSearched,
    docsRepresented,
    scopeWasHard,
    activeDocHardLockApplied,
    scopeEmpty,
    scopedNoEvidence,
  };
}

/**
 * Compute the reason code based on priority order.
 * This determines which fallback bank is selected.
 */
function computeReasonCode(input: {
  operator?: string;
  signals?: { navQuery?: boolean };
  scopeEmpty: boolean;
  scopedNoEvidence: boolean;
  resultCount: number;
  docContext: { processingCount: number; failedCount: number };
}): RetrievalReasonCode {
  const { operator, signals, scopeEmpty, scopedNoEvidence, resultCount, docContext } = input;

  // 1. Nav queries - no content retrieval needed
  const isNavOperator = operator === 'open' || operator === 'locate_file' || operator === 'locate_docs';
  if (isNavOperator || signals?.navQuery) {
    return 'nav_metadata_only';
  }

  // 2. Hard scope empty - filename/docId hard filter matches nothing
  if (scopeEmpty) {
    return 'scope_hard_constraints_empty';
  }

  // 3. Hard scope has docs but no evidence
  if (scopedNoEvidence) {
    return 'no_relevant_chunks_in_scoped_docs';
  }

  // 4. Indexing in progress - docs exist but still processing
  if (docContext.processingCount > 0 && resultCount === 0) {
    return 'indexing_in_progress';
  }

  // 5. Extraction failure - docs exist but extraction failed
  if (docContext.failedCount > 0 && resultCount === 0) {
    return 'extraction_failed';
  }

  // 6. Success or unknown
  if (resultCount > 0) {
    return 'ok';
  }

  return 'unknown';
}

export default {
  buildRetrievalSummary,
};
