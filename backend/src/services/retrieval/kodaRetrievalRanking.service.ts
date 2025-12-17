/**
 * Koda Retrieval Ranking Service
 * Applies dynamic document boosts, position weighting, and question-type specific
 * weighting to produce a final ranked list of chunks.
 */

import {
  RetrievedChunk,
  IntentClassificationV3,
  RankingParams,
  RankedChunks,
} from '../../types/ragV3.types';
import { DocumentBoostMap } from './dynamicDocBoost.service';

/**
 * Service responsible for ranking retrieved chunks by applying dynamic document boosts,
 * position weighting, and question-type specific weighting.
 */
export class KodaRetrievalRankingService {
  /**
   * Rank retrieved chunks applying boosts, position weighting, and question-type weighting.
   * @param params - Ranking parameters including query, intent, chunks, and boost map.
   * @returns RankedChunks - chunks sorted by final computed score descending.
   */
  public async rankChunks(params: RankingParams): Promise<RankedChunks> {
    const { query, intent, chunks, boostMap } = params;

    // Defensive copy to avoid mutating input array
    const rankedChunks = chunks.map((chunk) => {
      // Start with base score from hybrid search
      const baseScore = chunk.score;

      // Apply dynamic document boost factor; default to 1.0 if none found
      const boostFactor = boostMap[chunk.documentId]?.factor ?? 1.0;

      // Initial boosted score
      let score = baseScore * boostFactor;

      // Apply position weighting based on page number if available
      if (typeof chunk.pageNumber === 'number') {
        if (chunk.pageNumber >= 1 && chunk.pageNumber <= 3) {
          // Early pages get a slight boost
          score += 0.05;
        } else if (chunk.pageNumber > 50) {
          // Very late pages get a slight penalty
          score -= 0.05;
        }
      }

      // Question-type specific weighting heuristics
      // Use questionType or fallback to primaryType for backward compat
      const questionType = intent.questionType || intent.primaryType;

      switch (questionType) {
        case 'SUMMARY':
          // For summary, downweight chunks from same doc to improve diversity
          const sameDocCount = chunks.filter((c) => c.documentId === chunk.documentId).length;
          if (sameDocCount > 5) {
            score -= 0.03;
          }
          break;

        case 'NUMERIC':
        case 'EXTRACT':
          // Prefer shorter, denser chunks for numeric or extract queries
          if (chunk.content.length < 500) {
            score += 0.05;
          }
          break;

        case 'COMPARE':
          // Prefer multiple docs instead of only one doc
          const uniqueDocs = new Set(chunks.map((c) => c.documentId));
          if (uniqueDocs.size === 1) {
            score -= 0.04;
          }
          break;

        default:
          // No additional weighting for other types
          break;
      }

      // Clamp score to [0, +Infinity) to avoid negative scores
      if (score < 0) score = 0;

      // Return new chunk object with updated score
      return {
        ...chunk,
        score,
      };
    });

    // Sort chunks descending by score, stable sort to preserve original order for ties
    rankedChunks.sort((a, b) => {
      if (b.score === a.score) {
        return a.chunkId.localeCompare(b.chunkId);
      }
      return b.score - a.score;
    });

    return rankedChunks;
  }
}

// Singleton removed - use container.getKodaRetrievalRanking() instead

