/**
 * DocumentCompareService
 *
 * Compares two or more documents to find similarities and differences.
 * Supports structural comparison, content comparison, and key metric comparison.
 *
 * Usage:
 * ```typescript
 * const comparison = await compareDocuments(userId, [docId1, docId2]);
 * // Returns: { documents, similarities, differences, summary }
 * ```
 */

import { PrismaClient } from '@prisma/client';
import defaultLogger from '../../utils/logger';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[DocumentCompare] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[DocumentCompare] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export interface DocumentInfo {
  id: string;
  filename: string;
  mimeType: string;
  pageCount?: number;
  wordCount?: number;
  createdAt: Date;
}

export interface ComparisonItem {
  aspect: string;  // What's being compared (e.g., "Topic", "Revenue figure", "Date range")
  type: 'similarity' | 'difference' | 'unique';
  documents: string[];  // Document IDs involved
  values: Record<string, string>;  // { docId: value }
  confidence: number;
}

export interface CompareResult {
  documents: DocumentInfo[];
  similarities: ComparisonItem[];
  differences: ComparisonItem[];
  uniqueToEach: Record<string, string[]>;  // { docId: [unique aspects] }
  summary: string;
  comparedAt: string;
}

export interface CompareOptions {
  compareStructure?: boolean;
  compareContent?: boolean;
  compareMetrics?: boolean;
  maxDifferences?: number;
}

// ============================================================================
// Patterns for Key Information Extraction
// ============================================================================

const METRIC_PATTERNS = {
  currency: /\$[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|BRL|R\$)/gi,
  percentage: /\d+(?:\.\d+)?%/g,
  date: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
  year: /\b20[0-2]\d\b/g,
  quarter: /\bQ[1-4]\s*20[0-2]\d\b/gi,
};

// ============================================================================
// Service
// ============================================================================

export class DocumentCompareService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Compare multiple documents
   */
  async compareDocuments(
    userId: string,
    documentIds: string[],
    options: CompareOptions = {}
  ): Promise<CompareResult | null> {
    const {
      compareStructure = true,
      compareContent = true,
      compareMetrics = true,
      maxDifferences = 20,
    } = options;

    if (documentIds.length < 2) {
      logger.debug('Need at least 2 documents to compare');
      return null;
    }

    logger.info(`Comparing ${documentIds.length} documents for user ${userId}`);

    // 1. Fetch documents
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        rawText: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (documents.length < 2) {
      logger.debug('Could not find enough documents');
      return null;
    }

    const similarities: ComparisonItem[] = [];
    const differences: ComparisonItem[] = [];
    const uniqueToEach: Record<string, string[]> = {};

    // Initialize unique tracking
    for (const doc of documents) {
      uniqueToEach[doc.id] = [];
    }

    // 2. Compare structure
    if (compareStructure) {
      this.compareDocumentStructure(documents, similarities, differences);
    }

    // 3. Compare content (topics, keywords)
    if (compareContent) {
      this.compareDocumentContent(documents, similarities, differences, uniqueToEach);
    }

    // 4. Compare metrics (numbers, dates, etc.)
    if (compareMetrics) {
      this.compareDocumentMetrics(documents, similarities, differences);
    }

    // Limit differences
    const limitedDifferences = differences.slice(0, maxDifferences);

    // 5. Generate summary
    const summary = this.generateSummary(documents, similarities, limitedDifferences, uniqueToEach);

    const documentInfos: DocumentInfo[] = documents.map(doc => {
      const meta = this.parseMetadata(doc.metadata);
      return {
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType || 'application/octet-stream',
        pageCount: meta.pageCount,
        wordCount: doc.rawText?.split(/\s+/).length,
        createdAt: doc.createdAt,
      };
    });

    return {
      documents: documentInfos,
      similarities,
      differences: limitedDifferences,
      uniqueToEach,
      summary,
      comparedAt: new Date().toISOString(),
    };
  }

  /**
   * Compare document structure (type, length, pages)
   */
  private compareDocumentStructure(
    documents: any[],
    similarities: ComparisonItem[],
    differences: ComparisonItem[]
  ): void {
    // Compare file types
    const types = new Set(documents.map(d => d.mimeType));
    if (types.size === 1) {
      similarities.push({
        aspect: 'File Type',
        type: 'similarity',
        documents: documents.map(d => d.id),
        values: Object.fromEntries(documents.map(d => [d.id, d.mimeType])),
        confidence: 1.0,
      });
    } else {
      differences.push({
        aspect: 'File Type',
        type: 'difference',
        documents: documents.map(d => d.id),
        values: Object.fromEntries(documents.map(d => [d.id, d.mimeType])),
        confidence: 1.0,
      });
    }

    // Compare lengths (approximate)
    const lengths = documents.map(d => ({
      id: d.id,
      length: d.rawText?.length || 0,
    }));

    const avgLength = lengths.reduce((sum, l) => sum + l.length, 0) / lengths.length;
    const lengthsSimilar = lengths.every(l => Math.abs(l.length - avgLength) < avgLength * 0.5);

    if (lengthsSimilar) {
      similarities.push({
        aspect: 'Document Length',
        type: 'similarity',
        documents: documents.map(d => d.id),
        values: Object.fromEntries(lengths.map(l => [l.id, `~${Math.round(l.length / 1000)}k chars`])),
        confidence: 0.8,
      });
    } else {
      differences.push({
        aspect: 'Document Length',
        type: 'difference',
        documents: documents.map(d => d.id),
        values: Object.fromEntries(lengths.map(l => [l.id, `~${Math.round(l.length / 1000)}k chars`])),
        confidence: 0.8,
      });
    }
  }

  /**
   * Compare document content (keywords, topics)
   */
  private compareDocumentContent(
    documents: any[],
    similarities: ComparisonItem[],
    differences: ComparisonItem[],
    uniqueToEach: Record<string, string[]>
  ): void {
    // Extract key terms from each document
    const docTerms: Record<string, Set<string>> = {};

    for (const doc of documents) {
      const text = doc.rawText?.toLowerCase() || '';
      const terms = new Set<string>();

      // Extract significant words (length > 5, not common)
      const words = text.match(/\b[a-z]{6,}\b/g) || [];
      const wordFreq: Record<string, number> = {};

      for (const word of words) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }

      // Get top terms by frequency
      const topTerms = Object.entries(wordFreq)
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([word]) => word);

      for (const term of topTerms) {
        terms.add(term);
      }

      docTerms[doc.id] = terms;
    }

    // Find common terms (in all documents)
    const allDocIds = documents.map(d => d.id);
    const firstDoc = allDocIds[0];
    const commonTerms = [...docTerms[firstDoc]].filter(term =>
      allDocIds.every(id => docTerms[id].has(term))
    );

    if (commonTerms.length > 0) {
      similarities.push({
        aspect: 'Common Topics',
        type: 'similarity',
        documents: allDocIds,
        values: Object.fromEntries(allDocIds.map(id => [id, commonTerms.slice(0, 10).join(', ')])),
        confidence: 0.7,
      });
    }

    // Find unique terms per document
    for (const doc of documents) {
      const uniqueTerms = [...docTerms[doc.id]].filter(term =>
        !allDocIds.some(id => id !== doc.id && docTerms[id].has(term))
      );

      if (uniqueTerms.length > 0) {
        uniqueToEach[doc.id] = uniqueTerms.slice(0, 10);
      }
    }
  }

  /**
   * Compare document metrics (numbers, dates, percentages)
   */
  private compareDocumentMetrics(
    documents: any[],
    similarities: ComparisonItem[],
    differences: ComparisonItem[]
  ): void {
    // Extract metrics from each document
    const docMetrics: Record<string, {
      currencies: string[];
      percentages: string[];
      dates: string[];
      years: string[];
    }> = {};

    for (const doc of documents) {
      const text = doc.rawText || '';
      docMetrics[doc.id] = {
        currencies: (text.match(METRIC_PATTERNS.currency) || []).slice(0, 20),
        percentages: (text.match(METRIC_PATTERNS.percentage) || []).slice(0, 20),
        dates: (text.match(METRIC_PATTERNS.date) || []).slice(0, 20),
        years: [...new Set(text.match(METRIC_PATTERNS.year) || [])],
      };
    }

    // Compare years covered
    const allDocIds = documents.map(d => d.id);
    const yearSets = allDocIds.map(id => new Set(docMetrics[id].years));

    const commonYears = [...yearSets[0]].filter(year =>
      yearSets.every(set => set.has(year))
    );

    if (commonYears.length > 0) {
      similarities.push({
        aspect: 'Time Period',
        type: 'similarity',
        documents: allDocIds,
        values: Object.fromEntries(allDocIds.map(id => [id, commonYears.join(', ')])),
        confidence: 0.9,
      });
    }

    // Compare if they have currency values
    const hasCurrency = allDocIds.every(id => docMetrics[id].currencies.length > 0);
    if (hasCurrency) {
      similarities.push({
        aspect: 'Contains Financial Data',
        type: 'similarity',
        documents: allDocIds,
        values: Object.fromEntries(allDocIds.map(id => [id, `${docMetrics[id].currencies.length} values`])),
        confidence: 0.8,
      });
    }
  }

  /**
   * Generate comparison summary
   */
  private generateSummary(
    documents: any[],
    similarities: ComparisonItem[],
    differences: ComparisonItem[],
    uniqueToEach: Record<string, string[]>
  ): string {
    const docNames = documents.map(d => d.filename).join(' and ');
    const simCount = similarities.length;
    const diffCount = differences.length;

    let summary = `Compared ${documents.length} documents: ${docNames}. `;

    if (simCount > diffCount) {
      summary += `The documents are largely similar with ${simCount} shared aspects. `;
    } else if (diffCount > simCount) {
      summary += `The documents differ significantly with ${diffCount} distinct aspects. `;
    } else {
      summary += `The documents have balanced similarities (${simCount}) and differences (${diffCount}). `;
    }

    // Highlight key similarities
    const keySim = similarities.find(s => s.aspect === 'Common Topics' || s.aspect === 'Time Period');
    if (keySim) {
      summary += `Key similarity: ${keySim.aspect}. `;
    }

    // Highlight key differences
    if (differences.length > 0) {
      summary += `Notable difference: ${differences[0].aspect}. `;
    }

    return summary.trim();
  }

  /**
   * Parse document metadata
   */
  private parseMetadata(metadata: any): any {
    if (!metadata) return {};
    try {
      return typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    } catch {
      return {};
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: DocumentCompareService | null = null;

export function getDocumentCompareService(prisma: PrismaClient): DocumentCompareService {
  if (!instance) {
    instance = new DocumentCompareService(prisma);
  }
  return instance;
}
