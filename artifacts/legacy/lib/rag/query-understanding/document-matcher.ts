/**
 * Document Matcher
 * Matches extracted document references to actual documents in the database using fuzzy matching
 */

import prisma from '../../../config/database';

export interface DocumentMatch {
  matched: boolean;
  documentId: string | null;
  filename: string | null;
  confidence: number;
  alternativeMatches: Array<{ documentId: string; filename: string; confidence: number }>;
}

/**
 * Normalizes a document filename for fuzzy matching.
 * @param name The original filename.
 * @returns A normalized string.
 */
function normalizeDocumentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '') // Remove file extension
    .replace(/\s*\(\d+\)\s*/g, ' ') // Remove duplicate indicators like (1), (2)
    .replace(/\s*v\d+(\.\d+)?\s*/gi, ' ') // Remove version numbers like v1, v2.1
    .replace(/[_-]+/g, ' ') // Replace underscores and hyphens with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Calculates a similarity score between two strings.
 * @param ref The user's reference string.
 * @param target The filename to compare against.
 * @returns A similarity score between 0 and 1.
 */
function calculateSimilarity(ref: string, target: string): number {
  // Method 1: Exact match
  if (ref === target) return 1.0;

  // Method 2: One contains the other
  if (target.includes(ref)) return 0.95;
  if (ref.includes(target)) return 0.9;

  // Method 3: Starts with
  if (target.startsWith(ref) || ref.startsWith(target)) return 0.85;

  // Method 4: Word overlap (Jaccard similarity)
  const refWords = new Set(ref.split(' ').filter(w => w.length > 2));
  const targetWords = new Set(target.split(' ').filter(w => w.length > 2));

  if (refWords.size === 0 || targetWords.size === 0) return 0;

  const intersection = new Set([...refWords].filter(x => targetWords.has(x)));
  const union = new Set([...refWords, ...targetWords]);

  const jaccardScore = (intersection.size / union.size) * 0.8;

  // Method 5: Levenshtein distance (for typos)
  const levenshteinScore = 1 - (levenshteinDistance(ref, target) / Math.max(ref.length, target.length));
  const adjustedLevenshteinScore = levenshteinScore * 0.7;

  // Return the best score
  return Math.max(jaccardScore, adjustedLevenshteinScore);
}

/**
 * Calculates Levenshtein distance between two strings.
 * @param str1 First string.
 * @param str2 Second string.
 * @returns The Levenshtein distance.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Matches an extracted document reference against a user's documents.
 * @param documentReference The string extracted from the query.
 * @param userId The ID of the user.
 * @returns A DocumentMatch object with the best match.
 */
export async function matchDocument(
  documentReference: string,
  userId: string
): Promise<DocumentMatch> {
  try {
    // Fetch user's completed documents from database
    const userDocuments = await prisma.document.findMany({
      where: {
        userId: userId,
        status: 'completed', // Only search in successfully processed documents
      },
      select: {
        id: true,
        filename: true,
      },
    });

    if (userDocuments.length === 0) {
      return {
        matched: false,
        documentId: null,
        filename: null,
        confidence: 0,
        alternativeMatches: [],
      };
    }

    // Normalize document reference
    const normalizedRef = normalizeDocumentName(documentReference);

    // Score each document
    const scoredDocuments = userDocuments.map(doc => {
      const normalizedFilename = normalizeDocumentName(doc.filename);

      // Calculate similarity score
      const score = calculateSimilarity(normalizedRef, normalizedFilename);

      return {
        documentId: doc.id,
        filename: doc.filename,
        confidence: score,
      };
    });

    // Sort by confidence (descending)
    scoredDocuments.sort((a, b) => b.confidence - a.confidence);

    // Determine match
    const topMatch = scoredDocuments[0];
    const CONFIDENCE_THRESHOLD = 0.6; // Minimum confidence to consider a match

    if (topMatch && topMatch.confidence >= CONFIDENCE_THRESHOLD) {
      return {
        matched: true,
        documentId: topMatch.documentId,
        filename: topMatch.filename,
        confidence: topMatch.confidence,
        alternativeMatches: scoredDocuments.slice(1, 4).filter(m => m.confidence > 0.3), // Top 3 alternatives
      };
    }

    // No confident match found
    return {
      matched: false,
      documentId: null,
      filename: null,
      confidence: topMatch?.confidence || 0,
      alternativeMatches: scoredDocuments.slice(0, 3).filter(m => m.confidence > 0.3),
    };
  } catch (error) {
    console.error('Error matching document:', error);
    return {
      matched: false,
      documentId: null,
      filename: null,
      confidence: 0,
      alternativeMatches: [],
    };
  }
}
