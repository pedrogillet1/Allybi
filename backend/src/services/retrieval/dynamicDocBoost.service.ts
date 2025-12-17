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

    // 2. Fetch recent user document interaction history
    // Note: documentHistory model doesn't exist yet, skip this boost
    let recentDocIds = new Set<string>();
    // Future: implement when documentHistory model is added to schema

    // 3. Fetch document metadata for candidate documents
    let candidateDocsMetadata: Map<string, { createdAt: Date; updatedAt: Date }> = new Map();
    try {
      const docs = await prisma.document.findMany({
        where: { id: { in: candidateDocumentIds } },
        select: { id: true, createdAt: true, updatedAt: true },
      });
      for (const doc of docs) {
        candidateDocsMetadata.set(doc.id, {
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        });
      }
    } catch (error) {
      console.warn('[DynamicDocBoost] Failed to fetch doc metadata:', error);
    }

    // Current time for age calculations
    const now = new Date();
    const OLD_DAYS = 365;

    const daysDiff = (dateA: Date, dateB: Date): number => {
      const diffMs = dateA.getTime() - dateB.getTime();
      return diffMs / (1000 * 60 * 60 * 24);
    };

    // 4. Apply recency boosts and oldness penalties
    for (const docId of candidateDocumentIds) {
      // Skip if already boosted explicitly
      if (boostMap[docId].factor === 2.0) {
        continue;
      }

      // Check if document was recently opened by user
      if (recentDocIds.has(docId)) {
        boostMap[docId] = {
          documentId: docId,
          factor: 1.2,
          reason: 'recently opened by user',
        };
        continue;
      }

      // Check document age to penalize very old unused docs
      const meta = candidateDocsMetadata.get(docId);
      if (meta) {
        const lastModified = meta.updatedAt || meta.createdAt;
        if (lastModified) {
          const ageDays = daysDiff(now, lastModified);
          if (ageDays > OLD_DAYS) {
            boostMap[docId] = {
              documentId: docId,
              factor: 0.9,
              reason: `old document last modified ${Math.round(ageDays)} days ago`,
            };
          }
        }
      }
    }

    return boostMap;
  }
}

// Singleton instance for direct import
// Singleton removed - use container.getDynamicDocBoost() instead


// Export class for DI registration
export default DynamicDocBoostService;
