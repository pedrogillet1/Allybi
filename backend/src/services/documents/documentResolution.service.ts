/**
 * Document Resolution Service
 * Resolves free-text document name mentions into real document IDs
 * Uses normalization, alias mapping, and DB search with fuzzy matching
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import {
  DocumentResolutionParams,
  DocumentResolutionResult,
  ResolvedNameMatch,
} from '../../types/ragV3.types';

/**
 * Service responsible for resolving free-text document name mentions into real document IDs.
 * Use container to get instance if needed in future.
 */
export class DocumentResolutionService {
  constructor() {
    // No-op - service uses static methods and Prisma directly
  }

  /**
   * Normalize a raw document name string:
   * - Lowercase
   * - Remove file extensions (.pdf, .docx, etc.)
   * - Trim whitespace and punctuation
   */
  public static normalizeName(name: string): string {
    if (!name) return '';
    let normalized = name.toLowerCase();

    // Remove common extensions
    normalized = normalized.replace(/\.(pdf|docx?|xlsx?|pptx?|txt|rtf|odt|csv|md)$/i, '');

    // Remove extra punctuation and whitespace
    normalized = normalized.replace(/[\s\-_]+/g, ' ').trim();
    normalized = normalized.replace(/^[^\w]+|[^\w]+$/g, '');

    return normalized;
  }

  /**
   * Compute similarity score between two strings using a simple approach.
   * Returns a score between 0 and 1 (1 = exact match).
   */
  private static similarityScore(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    // Simple Levenshtein-like similarity
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    // Check if shorter is substring of longer
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // Calculate character overlap
    const chars1 = new Set(a.split(''));
    const chars2 = new Set(b.split(''));
    let overlap = 0;
    for (const char of chars1) {
      if (chars2.has(char)) overlap++;
    }
    return overlap / Math.max(chars1.size, chars2.size);
  }

  /**
   * Resolve an array of raw document names into document IDs.
   */
  public async resolveByNames(
    params: DocumentResolutionParams
  ): Promise<DocumentResolutionResult> {
    const { userId, rawNames, limitPerName = 3 } = params;

    if (!rawNames || rawNames.length === 0) {
      return {
        resolvedDocumentIds: [],
        matches: [],
        unresolvedNames: [],
      };
    }

    const resolvedDocumentIdsSet = new Set<string>();
    const matches: ResolvedNameMatch[] = [];
    const unresolvedNames: string[] = [];

    for (const rawName of rawNames) {
      const normalizedRawName = DocumentResolutionService.normalizeName(rawName);

      if (!normalizedRawName) {
        unresolvedNames.push(rawName);
        continue;
      }

      try {
        // 1. Search for exact normalized filename matches
        const exactMatches = await prisma.document.findMany({
          where: {
            userId,
            filename: { contains: rawName, mode: 'insensitive' },
          },
          orderBy: { updatedAt: 'desc' },
          take: limitPerName * 2,
          select: {
            id: true,
            filename: true,
            updatedAt: true,
          },
        });

        if (exactMatches.length > 0) {
          // Process and score matches
          const scoredMatches: Array<{ doc: any; score: number }> = [];

          for (const doc of exactMatches) {
            const docNormalized = DocumentResolutionService.normalizeName(doc.filename);

            let score = 0;
            if (docNormalized === normalizedRawName) {
              score = 0.95; // Exact normalized match
            } else if (docNormalized.includes(normalizedRawName)) {
              score = 0.8; // Substring match
            } else if (normalizedRawName.includes(docNormalized)) {
              score = 0.7; // Query contains filename
            } else {
              score = DocumentResolutionService.similarityScore(normalizedRawName, docNormalized) * 0.6;
            }

            if (score > 0.3) {
              scoredMatches.push({ doc, score });
            }
          }

          // Sort by score and limit
          scoredMatches.sort((a, b) => b.score - a.score);
          const limitedMatches = scoredMatches.slice(0, limitPerName);

          if (limitedMatches.length > 0) {
            for (const { doc, score } of limitedMatches) {
              resolvedDocumentIdsSet.add(doc.id);
              matches.push({
                rawName,
                documentId: doc.id,
                filename: doc.filename,
                score,
              });
            }
            continue;
          }
        }

        // 2. Fuzzy search using ILIKE
        const fuzzyMatches = await prisma.document.findMany({
          where: {
            userId,
            filename: {
              contains: normalizedRawName.substring(0, Math.min(normalizedRawName.length, 10)),
              mode: 'insensitive',
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: limitPerName * 3,
          select: {
            id: true,
            filename: true,
          },
        });

        if (fuzzyMatches.length > 0) {
          const scoredFuzzy: Array<{ doc: any; score: number }> = [];

          for (const doc of fuzzyMatches) {
            const docNormalized = DocumentResolutionService.normalizeName(doc.filename);
            const score = DocumentResolutionService.similarityScore(normalizedRawName, docNormalized);

            if (score > 0.4) {
              scoredFuzzy.push({ doc, score: score * 0.7 }); // Fuzzy matches get lower base score
            }
          }

          scoredFuzzy.sort((a, b) => b.score - a.score);
          const limitedFuzzy = scoredFuzzy.slice(0, limitPerName);

          for (const { doc, score } of limitedFuzzy) {
            resolvedDocumentIdsSet.add(doc.id);
            matches.push({
              rawName,
              documentId: doc.id,
              filename: doc.filename,
              score,
            });
          }

          if (limitedFuzzy.length > 0) continue;
        }

        // No matches found
        unresolvedNames.push(rawName);

      } catch (error) {
        console.error('[DocumentResolution] Error resolving name:', rawName, error);
        unresolvedNames.push(rawName);
      }
    }

    return {
      resolvedDocumentIds: Array.from(resolvedDocumentIdsSet),
      matches,
      unresolvedNames,
    };
  }

  /**
   * Resolve a single document name
   */
  public async resolveSingleName(
    userId: string,
    rawName: string
  ): Promise<ResolvedNameMatch | null> {
    const result = await this.resolveByNames({
      userId,
      rawNames: [rawName],
      limitPerName: 1,
    });

    return result.matches[0] || null;
  }
}


