/**
 * Dynamic Document Boost Service
 * Computes boost factors per document based on intent targets, recency, and metadata
 */

import prisma from '../../config/database';
import { IntentClassificationV3 } from '../../types/rag.types';

/**
 * Parameters for computing dynamic document boosts.
 */
export interface DynamicBoostParams {
  userId: string;
  intent: IntentClassificationV3;
  candidateDocumentIds: string[];
  /**
   * GRADE-A FIX #3: Document IDs from previous conversation turns.
   * These documents should be boosted to maintain context continuity.
   */
  conversationDocumentIds?: string[];
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
   * - Documents from current conversation context (factor 1.8) - GRADE-A FIX #3
   * - Recently opened documents by the user (factor 1.2)
   * - Very old or unused documents (factor 0.9)
   *
   * @param params Parameters including userId, intent, and candidate document IDs.
   * @returns Map of documentId to DocumentBoost with factor and reason.
   */
  public async computeBoosts(params: DynamicBoostParams): Promise<DocumentBoostMap> {
    const { userId, intent, candidateDocumentIds, conversationDocumentIds } = params;

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

    // 1. Boost explicitly targeted documents in intent.target.documentIds (factor 2.0)
    const targetedDocIds = new Set<string>();
    const targetObj = typeof intent?.target === 'object' ? intent.target : null;
    if (targetObj?.documentIds && Array.isArray(targetObj.documentIds)) {
      for (const docId of targetObj.documentIds) {
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

    // ═══════════════════════════════════════════════════════════════════════════
    // GRADE-A FIX #3: CONVERSATION CONTEXT BOOST (STRENGTHENED)
    // Boost documents referenced in previous conversation turns.
    // This maintains context continuity in multi-turn conversations.
    // Factor 2.5 for most recent document (first in array), 2.0 for others
    // This ensures follow-up queries like "Julho foi um outlier?" get the right doc.
    // ═══════════════════════════════════════════════════════════════════════════
    if (conversationDocumentIds && conversationDocumentIds.length > 0) {
      // Most recent document gets highest boost (2.5x) - likely the one user is asking about
      const mostRecentDocId = conversationDocumentIds[0];
      const olderDocIds = conversationDocumentIds.slice(1);

      // Boost most recent doc (only if candidate and not explicitly targeted)
      if (mostRecentDocId && boostMap[mostRecentDocId] && !targetedDocIds.has(mostRecentDocId)) {
        boostMap[mostRecentDocId] = {
          documentId: mostRecentDocId,
          factor: 2.5,
          reason: 'most recently referenced in conversation (PRIORITY)',
        };
        console.log(`[DynamicDocBoost] CONVERSATION_BOOST_PRIORITY: ${mostRecentDocId} boosted to 2.5x`);
      }

      // Boost other conversation docs (2.0x)
      for (const docId of olderDocIds) {
        if (boostMap[docId] && !targetedDocIds.has(docId) && docId !== mostRecentDocId) {
          boostMap[docId] = {
            documentId: docId,
            factor: 2.0,
            reason: 'referenced in conversation context',
          };
          console.log(`[DynamicDocBoost] CONVERSATION_BOOST: ${docId} boosted to 2.0x`);
        }
      }
    }

    // PERF: Skip DB calls for recency/age-based boosts
    // The 0.9x penalty for old docs and 1.2x boost for recent docs
    // are micro-optimizations not worth 1-2s DB latency.
    // Only explicit intent targeting (2.0x) and conversation context (1.8x) are applied.

    return boostMap;
  }
}

// Singleton instance for direct import
// Singleton removed - use container.getDynamicDocBoost() instead


// Export class for DI registration
export default DynamicDocBoostService;
