/**
 * RAG Utility Functions
 * Helper functions for formatting, path generation, and metadata extraction
 */

import prisma from '../config/database';
import { EnhancedChunkMetadata } from '../types/rag.types';

/**
 * Format location string from chunk metadata
 * Returns "Page 5", "Slide 3", "Sheet1, B5", etc.
 */
export function formatLocation(metadata: Partial<EnhancedChunkMetadata>): string {
  if (metadata.pageNumber) {
    return `Page ${metadata.pageNumber}`;
  }
  if (metadata.slideNumber) {
    return `Slide ${metadata.slideNumber}`;
  }
  if (metadata.cellReference && metadata.sheetName) {
    return `${metadata.sheetName}, ${metadata.cellReference}`;
  }
  if (metadata.sheetName) {
    return `Sheet: ${metadata.sheetName}`;
  }
  if (metadata.section) {
    return `Section: ${metadata.section}`;
  }
  return 'Document';
}

/**
 * Get complete folder path for a folder
 * Returns full hierarchical path like "Finance > Reports > 2025"
 */
export async function getFolderPath(folderId: string | null | undefined): Promise<string> {
  if (!folderId) return 'Root';

  try {
    const path: string[] = [];
    let currentFolderId: string | null = folderId;

    // Traverse up the folder hierarchy
    while (currentFolderId) {
      const folder: { name: string; parentFolderId: string | null } | null = await prisma.folder.findUnique({
        where: { id: currentFolderId },
        select: {
          name: true,
          parentFolderId: true
        }
      });

      if (!folder) break;

      path.unshift(folder.name);
      currentFolderId = folder.parentFolderId;
    }

    return path.length > 0 ? path.join(' > ') : 'Root';
  } catch (error) {
    console.error('Error getting folder path:', error);
    return 'Unknown';
  }
}

/**
 * Get folder path synchronously (cached version for performance)
 * NOTE: This should be used only when folder is already loaded with parent
 */
export function getFolderPathSync(folder: any): string {
  if (!folder) return 'Root';

  const path: string[] = [];
  let current = folder;

  while (current) {
    path.unshift(current.name);
    current = current.parent;
  }

  return path.length > 0 ? path.join(' > ') : 'Root';
}

/**
 * Get document hierarchy information (category, folder, path)
 */
export async function getDocumentHierarchy(documentId: string) {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        folderId: true
      }
    });

    if (!document) {
      return null;
    }

    // Get folder information if folderId exists
    let folderName = undefined;
    let folderPath = 'Root';

    if (document.folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: document.folderId },
        select: {
          name: true
        }
      });

      if (folder) {
        folderName = folder.name;
        folderPath = await getFolderPath(document.folderId);
      }
    }

    return {
      categoryId: undefined, // Not available in current schema
      categoryName: undefined, // Not available in current schema
      categoryEmoji: undefined, // Not available in current schema
      folderId: document.folderId,
      folderName: folderName,
      folderPath: folderPath
    };
  } catch (error) {
    console.error('Error getting document hierarchy:', error);
    return null;
  }
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format date in user-friendly format
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Extract document name from query
 * Handles patterns like "the business plan", "invoice.pdf", etc.
 */
export function extractDocumentName(query: string): string | null {
  const patterns = [
    /(?:the\s+)?([a-z0-9\s\-_\.]+?)(?:\s+document|\s+file|$)/i,
    /(?:document|file)\s+(?:called|named)\s+['"]?([a-z0-9\s\-_\.]+?)['"]?(?:\s|$)/i,
    /['"]([a-z0-9\s\-_\.]+?)['"](?:\s+document|\s+file|$)/i
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract folder/category name from query
 */
export function extractFolderName(query: string): string | null {
  const patterns = [
    /(?:what(?:'s|\s+is)\s+in\s+(?:the\s+)?|contents?\s+of\s+(?:the\s+)?)([a-z0-9\s\-_]+?)(?:\s+folder|\s+category|$)/i,
    /(?:folder|category)\s+(?:called|named)\s+['"]?([a-z0-9\s\-_]+?)['"]?(?:\s|$)/i,
    /show\s+me\s+(?:the\s+)?([a-z0-9\s\-_]+?)(?:\s+folder|\s+category|$)/i
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Check if query contains pronoun references
 */
export function isPronounReference(query: string): boolean {
  const pronouns = [
    'this',
    'that',
    'it',
    'the document',
    'the file',
    'same',
    'this document',
    'that document',
    'this file',
    'that file'
  ];

  const lowerQuery = query.toLowerCase();
  return pronouns.some(pronoun => {
    // Match whole word boundaries
    const regex = new RegExp(`\\b${pronoun}\\b`, 'i');
    return regex.test(lowerQuery);
  });
}

/**
 * Deduplicate sources by documentId and location
 */
export function deduplicateSources<T extends { documentId: string; location?: string }>(
  sources: T[]
): T[] {
  const seen = new Set<string>();
  return sources.filter(source => {
    const key = `${source.documentId}-${source.location || 'default'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generate access URLs for a document
 */
export function generateAccessURLs(documentId: string) {
  return {
    viewUrl: `/documents/${documentId}`,
    downloadUrl: `/api/documents/${documentId}/download`
  };
}

/**
 * Calculate text similarity (simple Jaccard similarity)
 * Used for fuzzy matching
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Fuzzy match document name
 * Returns documents that match with similarity > threshold
 */
export async function fuzzyMatchDocuments(
  searchTerm: string,
  userId: string,
  threshold: number = 0.3
): Promise<Array<{ id: string; filename: string; similarity: number }>> {
  try {
    const documents = await prisma.document.findMany({
      where: {
        userId: userId,
        filename: { contains: searchTerm }
      },
      select: {
        id: true,
        filename: true
      }
    });

    // Calculate similarity scores
    const matches = documents.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      similarity: calculateTextSimilarity(searchTerm, doc.filename)
    }));

    // Filter by threshold and sort by similarity
    return matches
      .filter(m => m.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    console.error('Error in fuzzy match:', error);
    return [];
  }
}
