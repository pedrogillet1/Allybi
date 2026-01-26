/**
 * FindMentionsService
 *
 * Finds all mentions of an entity/term across user's documents.
 * Returns structured results with location context (page, slide, cell, etc.)
 *
 * Usage:
 * ```typescript
 * const mentions = await findMentions(userId, 'EBITDA', documentIds);
 * // Returns: [{ documentId, filename, location: 'page 5', excerpt, context }]
 * ```
 */

import { PrismaClient } from '@prisma/client';
import { Pinecone } from '@pinecone-database/pinecone';
import defaultLogger from '../../utils/logger';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[FindMentions] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[FindMentions] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export interface MentionResult {
  documentId: string;
  filename: string;
  mimeType: string;
  location: string;  // "page 5", "slide 3", "cell B12", "section 2.1"
  excerpt: string;   // Highlighted excerpt with term
  context: string;   // Surrounding context
  confidence: number;
  metadata: {
    pageNumber?: number;
    slideNumber?: number;
    cellReference?: string;
    headingPath?: string[];
    chunkIndex?: number;
  };
}

export interface FindMentionsOptions {
  maxResults?: number;
  includeContext?: boolean;
  contextWindow?: number;  // Characters around mention
  caseSensitive?: boolean;
  documentIds?: string[];  // Limit to specific documents
}

// ============================================================================
// Service
// ============================================================================

export class FindMentionsService {
  private prisma: PrismaClient;
  private pinecone: Pinecone | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private async getPinecone(): Promise<Pinecone> {
    if (!this.pinecone) {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY || '',
      });
    }
    return this.pinecone;
  }

  /**
   * Find all mentions of a term across documents
   */
  async findMentions(
    userId: string,
    searchTerm: string,
    options: FindMentionsOptions = {}
  ): Promise<MentionResult[]> {
    const {
      maxResults = 50,
      includeContext = true,
      contextWindow = 200,
      caseSensitive = false,
      documentIds,
    } = options;

    logger.info(`Finding mentions of "${searchTerm}" for user ${userId}`);

    // 1. Get user's documents (filtered if documentIds provided)
    const whereClause: any = { userId };
    if (documentIds && documentIds.length > 0) {
      whereClause.id = { in: documentIds };
    }

    const documents = await this.prisma.document.findMany({
      where: whereClause,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        rawText: true,
        metadata: true,
      },
    });

    if (documents.length === 0) {
      logger.debug('No documents found for user');
      return [];
    }

    const mentions: MentionResult[] = [];
    const searchPattern = caseSensitive
      ? new RegExp(`\\b${this.escapeRegex(searchTerm)}\\b`, 'g')
      : new RegExp(`\\b${this.escapeRegex(searchTerm)}\\b`, 'gi');

    // 2. Search through each document's text
    for (const doc of documents) {
      if (!doc.rawText) continue;

      const text = doc.rawText;
      let match: RegExpExecArray | null;

      while ((match = searchPattern.exec(text)) !== null) {
        if (mentions.length >= maxResults) break;

        const position = match.index;
        const matchedText = match[0];

        // Extract location from metadata (page number, slide, etc.)
        const location = this.extractLocation(doc, position, text);

        // Extract excerpt with context
        const excerpt = this.extractExcerpt(text, position, matchedText, contextWindow);

        mentions.push({
          documentId: doc.id,
          filename: doc.filename,
          mimeType: doc.mimeType || 'application/octet-stream',
          location: location.display,
          excerpt,
          context: includeContext
            ? this.extractContext(text, position, contextWindow * 2)
            : '',
          confidence: 1.0,  // Exact match
          metadata: location.metadata,
        });
      }

      if (mentions.length >= maxResults) break;
    }

    // Sort by document, then by location
    mentions.sort((a, b) => {
      if (a.documentId !== b.documentId) {
        return a.filename.localeCompare(b.filename);
      }
      const pageA = a.metadata.pageNumber || a.metadata.slideNumber || 0;
      const pageB = b.metadata.pageNumber || b.metadata.slideNumber || 0;
      return pageA - pageB;
    });

    logger.info(`Found ${mentions.length} mentions across ${documents.length} documents`);
    return mentions;
  }

  /**
   * Extract location information from document metadata and position
   */
  private extractLocation(
    doc: any,
    position: number,
    text: string
  ): { display: string; metadata: MentionResult['metadata'] } {
    const metadata: MentionResult['metadata'] = {};
    let display = '';

    try {
      const parsedMeta = typeof doc.metadata === 'string'
        ? JSON.parse(doc.metadata)
        : doc.metadata || {};

      // For PDFs - estimate page from position
      if (doc.mimeType === 'application/pdf') {
        const pageCount = parsedMeta.pageCount || 1;
        const estimatedPage = Math.ceil((position / text.length) * pageCount);
        metadata.pageNumber = estimatedPage;
        display = `page ${estimatedPage}`;
      }
      // For PPTX - check slidesData
      else if (doc.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        const slidesData = parsedMeta.slidesData || [];
        // Estimate slide from position
        const slideCount = slidesData.length || 1;
        const estimatedSlide = Math.ceil((position / text.length) * slideCount);
        metadata.slideNumber = estimatedSlide;
        display = `slide ${estimatedSlide}`;
      }
      // For Excel - try to find cell reference
      else if (doc.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        // Look for cell reference pattern near the position
        const nearbyText = text.slice(Math.max(0, position - 50), position + 50);
        const cellMatch = nearbyText.match(/\b([A-Z]+\d+)\b/);
        if (cellMatch) {
          metadata.cellReference = cellMatch[1];
          display = `cell ${cellMatch[1]}`;
        } else {
          display = 'spreadsheet';
        }
      }
      // For Word docs - try to find heading
      else if (doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Look for heading patterns
        const headingMatch = text.slice(0, position).match(/(?:^|\n)(#+\s+.+|\d+\.\s+.+)$/m);
        if (headingMatch) {
          metadata.headingPath = [headingMatch[1].trim()];
          display = `under "${headingMatch[1].trim().slice(0, 50)}"`;
        } else {
          display = 'document';
        }
      }
      // Default
      else {
        display = 'document';
      }
    } catch (e) {
      display = 'document';
    }

    return { display, metadata };
  }

  /**
   * Extract excerpt with highlighted match
   */
  private extractExcerpt(
    text: string,
    position: number,
    match: string,
    windowSize: number
  ): string {
    const start = Math.max(0, position - windowSize / 2);
    const end = Math.min(text.length, position + match.length + windowSize / 2);

    let excerpt = text.slice(start, end);

    // Add ellipsis if truncated
    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    // Highlight the match with markdown bold
    const matchStart = position - start + (start > 0 ? 3 : 0);
    excerpt =
      excerpt.slice(0, matchStart) +
      '**' +
      excerpt.slice(matchStart, matchStart + match.length) +
      '**' +
      excerpt.slice(matchStart + match.length);

    return excerpt.replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract broader context around mention
   */
  private extractContext(text: string, position: number, windowSize: number): string {
    const start = Math.max(0, position - windowSize);
    const end = Math.min(text.length, position + windowSize);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: FindMentionsService | null = null;

export function getFindMentionsService(prisma: PrismaClient): FindMentionsService {
  if (!instance) {
    instance = new FindMentionsService(prisma);
  }
  return instance;
}
