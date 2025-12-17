/**
 * Koda Formatting Pipeline V3 - Production Ready
 * 
 * Centralized formatting for ALL LLM answers
 * - Unified marker format: {{DOC::...}}
 * - ID-based insertion (no global filename replace)
 * - Safe location validation (not in code blocks)
 * - Markdown integrity checks
 * - Truncation detection
 * - No HTML tags (CSS-only styling)
 */

import {
  createDocMarker,
  createLoadMoreMarker,
  getSafeInsertionPoints,
  validateMarkerLocations,
  countMarkers,
  hasIncompleteMarkers,
  type DocMarkerData,
  type LoadMoreMarkerData,
} from '../utils/markerUtils';
import { TruncationDetectorService, type TruncationDetectionResult } from '../utils/truncationDetector.service';

export interface Citation {
  docId: string;
  docName: string;
  pageNumber?: number;
  chunkId?: string;
  relevanceScore?: number;
}

export interface DocumentReference {
  id: string;
  filename: string;
  context: 'list' | 'text';
}

export interface FormattingInput {
  text: string;
  citations?: Citation[];
  documents?: DocumentReference[];
  intent?: string;
  language?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
}

export interface FormattingResult {
  text: string;
  markdown: string;
  citations: Citation[];
  documentMarkers: {
    count: number;
    locations: number[];
  };
  truncationDetected: boolean;
  truncationDetails?: TruncationDetectionResult;
  markdownIssues: string[];
  metadata: {
    hasCodeBlocks: boolean;
    hasTables: boolean;
    hasLists: boolean;
    markerCount: number;
    wordCount: number;
  };
}

export interface FormattingPipelineDependencies {
  truncationDetector?: TruncationDetectorService;
  logger?: any;
}

export class KodaFormattingPipelineV3Service {
  private readonly logger: any;
  private readonly truncationDetector: TruncationDetectorService;

  constructor(deps: FormattingPipelineDependencies = {}) {
    this.logger = deps.logger || console;
    this.truncationDetector = deps.truncationDetector || new TruncationDetectorService();
  }

  /**
   * Main formatting entry point
   * Formats LLM answer with markers, validates structure
   */
  async format(input: FormattingInput): Promise<FormattingResult> {
    const startTime = Date.now();
    
    try {
      let { text } = input;
      const citations = input.citations || [];
      const documents = input.documents || [];

      // Step 1: Detect truncation BEFORE any modifications
      const truncationResult = this.truncationDetector.detectTruncation(text);
      
      if (truncationResult.isTruncated && truncationResult.confidence === 'high') {
        this.logger.warn('High confidence truncation detected, returning early', {
          reasons: truncationResult.reasons,
        });
        
        // Return immediately without further processing
        return {
          text,
          markdown: text,
          citations,
          documentMarkers: { count: 0, locations: [] },
          truncationDetected: true,
          truncationDetails: truncationResult,
          markdownIssues: truncationResult.reasons,
          metadata: this.extractMetadata(text),
        };
      }

      // Step 2: Insert document markers (ID-based, safe locations only)
      if (documents.length > 0) {
        text = this.insertDocumentMarkers(text, documents);
      }

      // Step 3: Validate marker locations
      const locationIssues = validateMarkerLocations(text);
      
      // Step 4: Validate markdown structure
      const structureIssues = this.truncationDetector.validateMarkdownStructure(text);
      
      // Step 5: Extract metadata
      const metadata = this.extractMetadata(text);
      
      // Step 6: Count markers
      const markerStats = countMarkers(text);

      const duration = Date.now() - startTime;
      
      this.logger.info('Formatting complete', {
        duration,
        markerCount: markerStats.total,
        truncated: truncationResult.isTruncated,
        issues: [...locationIssues, ...structureIssues].length,
      });

      return {
        text,
        markdown: text,
        citations,
        documentMarkers: {
          count: markerStats.doc,
          locations: [], // Could be populated if needed
        },
        truncationDetected: truncationResult.isTruncated,
        truncationDetails: truncationResult.isTruncated ? truncationResult : undefined,
        markdownIssues: [...locationIssues, ...structureIssues],
        metadata: {
          ...metadata,
          markerCount: markerStats.total,
        },
      };
    } catch (error: any) {
      this.logger.error('Formatting failed', { error: error.message });
      
      // Return safe fallback
      return {
        text: input.text,
        markdown: input.text,
        citations: input.citations || [],
        documentMarkers: { count: 0, locations: [] },
        truncationDetected: false,
        markdownIssues: [`Formatting error: ${error.message}`],
        metadata: this.extractMetadata(input.text),
      };
    }
  }

  /**
   * Insert document markers at safe locations
   * Uses ID-based approach (no global filename replace)
   *
   * IMPORTANT: Safe points are recomputed after each insertion to account
   * for position shifts caused by previous insertions.
   */
  private insertDocumentMarkers(text: string, documents: DocumentReference[]): string {
    // Strategy: Insert markers after first mention of each document
    // This is safer than global replace and respects context

    let result = text;
    const inserted = new Set<string>();

    for (const doc of documents) {
      if (inserted.has(doc.id)) {
        continue;
      }

      // Find first safe mention of this document's filename in CURRENT result
      // (not original text, since positions shift after each insertion)
      const filename = doc.filename;
      const filenameRegex = new RegExp(this.escapeRegex(filename), 'gi');

      let match;
      while ((match = filenameRegex.exec(result)) !== null) {
        const position = match.index + match[0].length;

        // Recompute safe points on current result (after previous insertions)
        const safePoints = getSafeInsertionPoints(result);
        const isSafe = safePoints.includes(position);

        if (isSafe) {
          // Insert marker after the filename
          const marker = createDocMarker({
            id: doc.id,
            name: filename,
            ctx: doc.context,
          });

          result = result.slice(0, position) + ' ' + marker + result.slice(position);
          inserted.add(doc.id);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Format document listing (for SEARCH/ANALYTICS results)
   */
  async formatDocumentListing(
    documents: Array<{
      id: string;
      filename: string;
      summary?: string;
      lastModified?: Date;
      size?: number;
    }>,
    total: number,
    shown: number
  ): Promise<FormattingResult> {
    const lines: string[] = [];
    
    lines.push('# Documents Found\n');
    
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const marker = createDocMarker({
        id: doc.id,
        name: doc.filename,
        ctx: 'list',
      });
      
      lines.push(`${i + 1}. **${doc.filename}** ${marker}`);
      
      if (doc.summary) {
        lines.push(`   ${doc.summary}`);
      }
      
      if (doc.lastModified) {
        lines.push(`   *Modified: ${doc.lastModified.toLocaleDateString()}*`);
      }
      
      lines.push('');
    }
    
    // Add load more marker if needed
    if (shown < total) {
      const remaining = total - shown;
      const loadMoreMarker = createLoadMoreMarker({
        total,
        shown,
        remaining,
      });
      
      lines.push(`\n${loadMoreMarker}\n`);
    }
    
    const text = lines.join('\n');
    
    return {
      text,
      markdown: text,
      citations: [],
      documentMarkers: {
        count: documents.length,
        locations: [],
      },
      truncationDetected: false,
      markdownIssues: [],
      metadata: this.extractMetadata(text),
    };
  }

  /**
   * Format analytics results
   */
  async formatAnalytics(
    query: string,
    results: Array<{
      docId: string;
      docName: string;
      metric: string;
      value: number | string;
    }>
  ): Promise<FormattingResult> {
    const lines: string[] = [];
    
    lines.push(`# Analytics: ${query}\n`);
    
    // Group by document
    const byDoc = new Map<string, typeof results>();
    for (const result of results) {
      if (!byDoc.has(result.docId)) {
        byDoc.set(result.docId, []);
      }
      byDoc.get(result.docId)!.push(result);
    }
    
    for (const [docId, docResults] of byDoc) {
      const docName = docResults[0].docName;
      const marker = createDocMarker({
        id: docId,
        name: docName,
        ctx: 'list',
      });
      
      lines.push(`## ${docName} ${marker}\n`);
      
      for (const result of docResults) {
        lines.push(`- **${result.metric}**: ${result.value}`);
      }
      
      lines.push('');
    }
    
    const text = lines.join('\n');
    
    return {
      text,
      markdown: text,
      citations: [],
      documentMarkers: {
        count: byDoc.size,
        locations: [],
      },
      truncationDetected: false,
      markdownIssues: [],
      metadata: this.extractMetadata(text),
    };
  }

  /**
   * Extract metadata from text
   */
  private extractMetadata(text: string): {
    hasCodeBlocks: boolean;
    hasTables: boolean;
    hasLists: boolean;
    markerCount: number;
    wordCount: number;
  } {
    const markerStats = countMarkers(text);
    return {
      hasCodeBlocks: /```/.test(text),
      hasTables: /\|[^\n]+\|/.test(text),
      hasLists: /^[\s]*[-*\d+.]\s/m.test(text),
      markerCount: markerStats.total,
      wordCount: text.split(/\s+/).length,
    };
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Strip markers from text (for plain text export)
   */
  stripMarkers(text: string): string {
    return text.replace(/{{(DOC|LOAD_MORE)::[^}]+}}/g, (match) => {
      // For DOC markers, keep just the filename
      if (match.startsWith('{{DOC::')) {
        const nameMatch = match.match(/name="([^"]+)"/);
        if (nameMatch) {
          return nameMatch[1];
        }
      }
      return '';
    });
  }

  /**
   * Get marker count
   */
  getMarkerCount(text: string): number {
    const stats = countMarkers(text);
    return stats.total;
  }
}

// Export class for DI registration (instantiate in container.ts)
export default KodaFormattingPipelineV3Service;
