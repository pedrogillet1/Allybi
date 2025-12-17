/**
 * KODA Marker Generator Service V3
 * 
 * Generates document markers for embedding in answer text.
 * 
 * MARKER FORMAT:
 * {{DOC::id=doc_123::name="file.pdf"::type=pdf::size=1048576::language=pt::...}}
 * 
 * USER SEES: **file.pdf** (bold, optionally underlined based on context)
 * MARKER CONTAINS: Full metadata for frontend parsing
 * 
 * VERSION: 3.1.0
 * DATE: 2025-12-12
 * LOCATION: backend/src/utils/kodaMarkerGenerator.service.ts
 * 
 * DESIGN RATIONALE:
 * - Centralized marker generation (single source of truth)
 * - Consistent format across all services
 * - Easy to parse on frontend
 * - Extensible for future metadata
 * - Type-safe with ragV3.types.ts
 */

import type { DocumentMarker, LoadMoreMarker } from '../types/ragV3.types';
import {
  encodeMarkerValue,
  decodeMarkerValue,
  createLoadMoreMarker as createLoadMoreMarkerBase,
} from '../services/utils/markerUtils';

/**
 * Document info for marker generation
 * This is what services pass to generate a marker
 */
export interface DocumentInfo {
  id: string;
  filename: string;
  extension?: string;
  mimeType?: string;
  fileSize?: number;
  folderPath?: string;
  language?: string;
  topics?: string[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
  pageCount?: number;
  slideCount?: number;
}

export class KodaMarkerGeneratorService {
  /**
   * Generate document marker
   * 
   * RATIONALE: Marker contains full metadata but user only sees filename
   * Frontend parses marker to render clickable button with preview
   * 
   * @param doc - Document information
   * @returns Marker string to embed in answer text
   */
  generateDocumentMarker(doc: DocumentInfo): string {
    // Build marker parts
    const parts: string[] = [
      `id=${doc.id}`,
      `name="${this.escapeMarkerValue(doc.filename)}"`,
    ];

    // Add optional fields if present
    if (doc.extension) {
      parts.push(`type=${doc.extension}`);
    }

    if (doc.mimeType) {
      parts.push(`mime="${this.escapeMarkerValue(doc.mimeType)}"`);
    }

    if (doc.fileSize !== undefined) {
      parts.push(`size=${doc.fileSize}`);
    }

    if (doc.folderPath) {
      parts.push(`folder="${this.escapeMarkerValue(doc.folderPath)}"`);
    }

    if (doc.language) {
      parts.push(`lang=${doc.language}`);
    }

    if (doc.topics && doc.topics.length > 0) {
      const topicsStr = doc.topics.map(t => this.escapeMarkerValue(t)).join(',');
      parts.push(`topics="${topicsStr}"`);
    }

    if (doc.createdAt) {
      const created = typeof doc.createdAt === 'string' 
        ? doc.createdAt 
        : doc.createdAt.toISOString();
      parts.push(`created="${created}"`);
    }

    if (doc.updatedAt) {
      const updated = typeof doc.updatedAt === 'string'
        ? doc.updatedAt
        : doc.updatedAt.toISOString();
      parts.push(`updated="${updated}"`);
    }

    if (doc.pageCount !== undefined) {
      parts.push(`pages=${doc.pageCount}`);
    }

    if (doc.slideCount !== undefined) {
      parts.push(`slides=${doc.slideCount}`);
    }

    // Assemble marker
    const marker = `{{DOC::${parts.join('::')}}}`;

    return marker;
  }

  /**
   * Generate load more marker
   * 
   * RATIONALE: Used in document listings to show pagination
   * Frontend renders "Load more" button when this marker is found
   * 
   * @param total - Total number of documents
   * @param shown - Number of documents shown
   * @returns Load more marker string
   */
  generateLoadMoreMarker(total: number, shown: number): string {
    const remaining = total - shown;
    // Delegate to markerUtils for consistent format
    return createLoadMoreMarkerBase({ total, shown, remaining });
  }

  /**
   * Extract filename from marker (for display)
   * 
   * RATIONALE: When rendering, we need to extract just the filename
   * to show to the user (the rest is hidden in the marker)
   * 
   * @param marker - Full marker string
   * @returns Filename only
   */
  extractFilename(marker: string): string | null {
    const match = marker.match(/name="([^"]+)"/);
    return match ? match[1] : null;
  }

  /**
   * Parse document marker into DocumentMarker object
   * 
   * RATIONALE: Backend might need to parse its own markers
   * (though frontend does this more often)
   * 
   * @param marker - Marker string
   * @returns Parsed DocumentMarker object
   */
  parseDocumentMarker(marker: string): DocumentMarker | null {
    if (!marker.startsWith('{{DOC::') || !marker.endsWith('}}')) {
      return null;
    }

    try {
      // Remove {{DOC:: and }}
      const content = marker.slice(7, -2);
      const parts = content.split('::');

      const parsed: Partial<DocumentMarker> = {};

      for (const part of parts) {
        const [key, value] = part.split('=');
        
        switch (key) {
          case 'id':
            parsed.documentId = value;
            break;
          case 'name':
            parsed.filename = this.unescapeMarkerValue(value);
            break;
          case 'type':
            parsed.extension = value;
            break;
          case 'mime':
            parsed.mimeType = this.unescapeMarkerValue(value);
            break;
          case 'size':
            parsed.fileSize = parseInt(value, 10);
            break;
          case 'folder':
            parsed.folderPath = this.unescapeMarkerValue(value);
            break;
          case 'lang':
            parsed.language = value;
            break;
          case 'topics':
            parsed.topics = this.unescapeMarkerValue(value).split(',');
            break;
          case 'created':
            parsed.createdAt = this.unescapeMarkerValue(value);
            break;
          case 'updated':
            parsed.updatedAt = this.unescapeMarkerValue(value);
            break;
          case 'pages':
            parsed.pageCount = parseInt(value, 10);
            break;
          case 'slides':
            parsed.slideCount = parseInt(value, 10);
            break;
        }
      }

      // Validate required fields
      if (!parsed.documentId || !parsed.filename) {
        return null;
      }

      return parsed as DocumentMarker;
    } catch (error) {
      console.error('[KodaMarkerGenerator] Error parsing marker:', error);
      return null;
    }
  }

  /**
   * Parse load more marker
   * 
   * @param marker - Load more marker string
   * @returns Parsed LoadMoreMarker object
   */
  parseLoadMoreMarker(marker: string): LoadMoreMarker | null {
    if (!marker.startsWith('{{LOAD_MORE::') || !marker.endsWith('}}')) {
      return null;
    }

    try {
      const content = marker.slice(13, -2);
      const parts = content.split('::');

      const parsed: Partial<LoadMoreMarker> = { action: 'load_more' };

      for (const part of parts) {
        const [key, value] = part.split('=');
        
        switch (key) {
          case 'total':
            parsed.totalDocs = parseInt(value, 10);
            break;
          case 'shown':
            parsed.shownDocs = parseInt(value, 10);
            break;
          case 'remaining':
            parsed.remainingDocs = parseInt(value, 10);
            break;
        }
      }

      return parsed as LoadMoreMarker;
    } catch (error) {
      console.error('[KodaMarkerGenerator] Error parsing load more marker:', error);
      return null;
    }
  }

  /**
   * Check if string contains document markers
   * 
   * @param text - Text to check
   * @returns True if contains markers
   */
  hasDocumentMarkers(text: string): boolean {
    return text.includes('{{DOC::');
  }

  /**
   * Check if string contains load more marker
   * 
   * @param text - Text to check
   * @returns True if contains load more marker
   */
  hasLoadMoreMarker(text: string): boolean {
    return text.includes('{{LOAD_MORE::');
  }

  /**
   * Extract all document markers from text
   * 
   * @param text - Text containing markers
   * @returns Array of marker strings
   */
  extractAllMarkers(text: string): string[] {
    const markers: string[] = [];
    const regex = /\{\{DOC::[^\}]+\}\}/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      markers.push(match[0]);
    }

    return markers;
  }

  /**
   * Replace marker with visible filename
   * 
   * RATIONALE: For testing or backend rendering
   * Frontend does this with proper styling
   * 
   * @param text - Text with markers
   * @returns Text with markers replaced by filenames
   */
  replaceMarkersWithFilenames(text: string): string {
    return text.replace(/\{\{DOC::([^\}]+)\}\}/g, (match) => {
      const filename = this.extractFilename(match);
      return filename ? `**${filename}**` : match;
    });
  }

  /**
   * Escape special characters in marker values
   * 
   * RATIONALE: Prevent marker parsing issues with special chars
   * 
   * @param value - Value to escape
   * @returns Escaped value
   */
  private escapeMarkerValue(value: string): string {
    // Use URL-encoding for consistent escaping (delegates to markerUtils)
    return encodeMarkerValue(value);
  }

  /**
   * Unescape marker values
   * 
   * @param value - Escaped value
   * @returns Unescaped value
   */
  private unescapeMarkerValue(value: string): string {
    // Remove surrounding quotes if present
    let unescaped = value.replace(/^"(.*)"$/, '$1');
    // Use URL-decoding for consistent unescaping (delegates to markerUtils)
    return decodeMarkerValue(unescaped);
  }

  /**
   * Generate marker from database document
   * 
   * RATIONALE: Convenience method for common use case
   * Converts Prisma document to marker
   * 
   * @param dbDoc - Document from database
   * @returns Document marker
   */
  fromDatabaseDocument(dbDoc: any): string {
    const docInfo: DocumentInfo = {
      id: dbDoc.id,
      filename: dbDoc.filename,
      extension: this.getExtension(dbDoc.filename),
      mimeType: dbDoc.mimeType,
      fileSize: dbDoc.size,
      folderPath: dbDoc.folder?.path,
      language: dbDoc.language,
      topics: dbDoc.topics?.map((t: any) => t.name),
      createdAt: dbDoc.createdAt,
      updatedAt: dbDoc.updatedAt,
      pageCount: dbDoc.pageCount,
      slideCount: dbDoc.slideCount,
    };

    return this.generateDocumentMarker(docInfo);
  }

  /**
   * Get file extension from filename
   * 
   * @param filename - Filename
   * @returns Extension (without dot)
   */
  private getExtension(filename: string): string {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Validate marker format
   * 
   * @param marker - Marker to validate
   * @returns True if valid
   */
  isValidMarker(marker: string): boolean {
    if (!marker.startsWith('{{DOC::') && !marker.startsWith('{{LOAD_MORE::')) {
      return false;
    }

    if (!marker.endsWith('}}')) {
      return false;
    }

    // Try to parse
    if (marker.startsWith('{{DOC::')) {
      return this.parseDocumentMarker(marker) !== null;
    } else {
      return this.parseLoadMoreMarker(marker) !== null;
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export class only - use container.getMarkerGenerator() for instance
// Class is already exported at declaration (line 50)
export default KodaMarkerGeneratorService;
