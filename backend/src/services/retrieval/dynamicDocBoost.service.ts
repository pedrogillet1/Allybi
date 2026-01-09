/**
 * Dynamic Document Boost Service
 * Computes boost factors per document based on intent targets, recency, and metadata
 */

import prisma from '../../config/database';
import { IntentClassificationV3 } from '../../types/ragV3.types';

/**
 * Parameters for computing dynamic document boosts.
 */
export interface DynamicBoostParams {
  userId: string;
  intent: IntentClassificationV3;
  candidateDocumentIds: string[];
}

/**
 * Boost factor and reason for a document.
 */
export interface DocumentBoost {
  documentId: string;
  factor: number; // 1.0 neutral, >1 boost, <1 penalize
  reason: string;
}

/**
 * Map of documentId to DocumentBoost.
 */
export type DocumentBoostMap = Record<string, DocumentBoost>;

/**
 * Service to compute dynamic boost factors per document based on intent targets,
 * recency of user interactions, and document metadata.
 */
export class DynamicDocBoostService {
  /**
   * Compute boost factors for candidate documents based on:
   * - Explicitly targeted documents in the intent (factor 2.0)
   * - Recently opened documents by the user (factor 1.2)
   * - Very old or unused documents (factor 0.9)
   *
   * @param params Parameters including userId, intent, and candidate document IDs.
   * @returns Map of documentId to DocumentBoost with factor and reason.
   */
  public async computeBoosts(params: DynamicBoostParams): Promise<DocumentBoostMap> {
    const { userId, intent, candidateDocumentIds } = params;

    // Defensive: if no candidates, return empty map
    if (!candidateDocumentIds || candidateDocumentIds.length === 0) {
      return {};
    }

    // Prepare result map with base factor 1.0
    const boostMap: DocumentBoostMap = {};
    for (const docId of candidateDocumentIds) {
      boostMap[docId] = {
        documentId: docId,
        factor: 1.0,
        reason: 'neutral base factor',
      };
    }

    // 1. Boost explicitly targeted documents in intent.target.documentIds
    const targetedDocIds = new Set<string>();
    if (intent?.target?.documentIds && Array.isArray(intent.target.documentIds)) {
      for (const docId of intent.target.documentIds) {
        targetedDocIds.add(docId);
      }
    }

    for (const docId of targetedDocIds) {
      if (boostMap[docId]) {
        boostMap[docId] = {
          documentId: docId,
          factor: 2.0,
          reason: 'explicitly requested by intent target',
        };
      }
    }

    // PERF: Skip DB calls for recency/age-based boosts
    // The 0.9x penalty for old docs and 1.2x boost for recent docs
    // are micro-optimizations not worth 1-2s DB latency.
    // Only explicit intent targeting (2.0x) is applied, which requires no DB call.

    return boostMap;
  }
}

// Singleton instance for direct import
// Singleton removed - use container.getDynamicDocBoost() instead


// Export class for DI registration
export default DynamicDocBoostService;
