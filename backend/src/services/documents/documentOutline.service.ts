/**
 * DocumentOutlineService
 *
 * Generates document outlines/table of contents from user's documents.
 * Supports PDF, DOCX, PPTX structure extraction.
 *
 * Usage:
 * ```typescript
 * const outline = await getOutline(userId, documentId);
 * // Returns: { title, sections: [{ heading, level, pageNumber, children }] }
 * ```
 */

import { PrismaClient } from '@prisma/client';
import defaultLogger from '../../utils/logger';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[DocumentOutline] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[DocumentOutline] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export interface OutlineSection {
  id: string;
  heading: string;
  level: number;  // 1 = top level, 2 = subsection, etc.
  pageNumber?: number;
  slideNumber?: number;
  startPosition?: number;
  children: OutlineSection[];
}

export interface DocumentOutline {
  documentId: string;
  filename: string;
  title: string;
  totalPages?: number;
  totalSlides?: number;
  sections: OutlineSection[];
  generatedAt: string;
}

// ============================================================================
// Heading Patterns
// ============================================================================

const HEADING_PATTERNS = {
  markdown: [
    /^(#{1,6})\s+(.+)$/gm,  // # Heading
  ],
  numbered: [
    /^(\d+(?:\.\d+)*)\s+(.+)$/gm,  // 1. or 1.1 or 1.1.1
  ],
  uppercase: [
    /^([A-Z][A-Z\s]{3,})$/gm,  // ALL CAPS HEADINGS
  ],
  keywords: [
    /^(INTRODUCTION|CONCLUSION|SUMMARY|ABSTRACT|CHAPTER\s+\d+|SECTION\s+\d+|PART\s+\d+|APPENDIX\s+\w+)/gim,
    /^(INTRODUÇÃO|CONCLUSÃO|RESUMO|CAPÍTULO\s+\d+|SEÇÃO\s+\d+|PARTE\s+\d+|APÊNDICE\s+\w+)/gim,
  ],
};

// ============================================================================
// Service
// ============================================================================

export class DocumentOutlineService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Generate outline for a specific document
   */
  async getOutline(userId: string, documentId: string): Promise<DocumentOutline | null> {
    logger.info(`Generating outline for document ${documentId}`);

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        rawText: true,
        metadata: true,
      },
    });

    if (!document) {
      logger.debug('Document not found');
      return null;
    }

    const parsedMeta = this.parseMetadata(document.metadata);

    // Route to appropriate extractor based on mime type
    let sections: OutlineSection[] = [];

    if (document.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      sections = this.extractPptxOutline(document.rawText || '', parsedMeta);
    } else if (document.mimeType === 'application/pdf') {
      sections = this.extractPdfOutline(document.rawText || '', parsedMeta);
    } else if (document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      sections = this.extractDocxOutline(document.rawText || '', parsedMeta);
    } else {
      sections = this.extractGenericOutline(document.rawText || '');
    }

    const outline: DocumentOutline = {
      documentId: document.id,
      filename: document.filename,
      title: this.extractTitle(document.filename, document.rawText || '', sections),
      totalPages: parsedMeta.pageCount,
      totalSlides: parsedMeta.slidesData?.length,
      sections,
      generatedAt: new Date().toISOString(),
    };

    logger.info(`Generated outline with ${sections.length} top-level sections`);
    return outline;
  }

  /**
   * Extract outline from PPTX (slide-based)
   */
  private extractPptxOutline(text: string, meta: any): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const slidesData = meta.slidesData || [];

    // If we have structured slides data, use it
    if (slidesData.length > 0) {
      for (const slide of slidesData) {
        const slideNum = slide.slideNumber || slide.slide_number;
        const title = slide.title || slide.text?.split('\n')[0]?.slice(0, 100) || `Slide ${slideNum}`;

        sections.push({
          id: `slide-${slideNum}`,
          heading: title,
          level: 1,
          slideNumber: slideNum,
          children: [],
        });
      }
    } else {
      // Fall back to text-based extraction
      const slidePattern = /(?:Slide\s*(\d+)|SLIDE\s*(\d+))[:\s]*(.+?)(?=Slide\s*\d+|SLIDE\s*\d+|$)/gis;
      let match;
      while ((match = slidePattern.exec(text)) !== null) {
        const slideNum = parseInt(match[1] || match[2], 10);
        const content = match[3]?.trim().split('\n')[0]?.slice(0, 100) || `Slide ${slideNum}`;

        sections.push({
          id: `slide-${slideNum}`,
          heading: content,
          level: 1,
          slideNumber: slideNum,
          children: [],
        });
      }
    }

    return sections;
  }

  /**
   * Extract outline from PDF (heading-based with page estimation)
   */
  private extractPdfOutline(text: string, meta: any): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const pageCount = meta.pageCount || 1;
    let sectionId = 0;

    // Try each heading pattern
    const headings: Array<{ text: string; level: number; position: number }> = [];

    // Numbered headings (1., 1.1, etc.)
    for (const pattern of HEADING_PATTERNS.numbered) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const level = match[1].split('.').length;
        headings.push({
          text: match[2].trim(),
          level,
          position: match.index,
        });
      }
    }

    // Markdown-style headings
    for (const pattern of HEADING_PATTERNS.markdown) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        headings.push({
          text: match[2].trim(),
          level: match[1].length,
          position: match.index,
        });
      }
    }

    // Keyword headings
    for (const pattern of HEADING_PATTERNS.keywords) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        headings.push({
          text: match[1].trim(),
          level: 1,
          position: match.index,
        });
      }
    }

    // Sort by position and build tree
    headings.sort((a, b) => a.position - b.position);

    for (const heading of headings) {
      const pageNumber = Math.ceil((heading.position / text.length) * pageCount);

      sections.push({
        id: `section-${++sectionId}`,
        heading: heading.text.slice(0, 100),
        level: heading.level,
        pageNumber,
        startPosition: heading.position,
        children: [],  // Could build tree structure here
      });
    }

    return sections;
  }

  /**
   * Extract outline from DOCX (heading styles)
   */
  private extractDocxOutline(text: string, meta: any): OutlineSection[] {
    // Similar to PDF but may have better structure
    return this.extractPdfOutline(text, meta);
  }

  /**
   * Generic outline extraction for other file types
   */
  private extractGenericOutline(text: string): OutlineSection[] {
    const sections: OutlineSection[] = [];
    let sectionId = 0;

    // Look for any heading-like patterns
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) continue;

      // Check for heading patterns
      const isUppercase = line === line.toUpperCase() && line.length > 3 && line.length < 100;
      const hasNumberPrefix = /^\d+(?:\.\d+)*\.?\s+/.test(line);
      const isShort = line.length < 100 && !line.includes('.') && lines[i + 1]?.trim() === '';

      if (isUppercase || hasNumberPrefix || isShort) {
        sections.push({
          id: `section-${++sectionId}`,
          heading: line.slice(0, 100),
          level: hasNumberPrefix ? line.split('.').length - 1 || 1 : 1,
          startPosition: text.indexOf(line),
          children: [],
        });
      }

      // Limit to reasonable number
      if (sections.length >= 50) break;
    }

    return sections;
  }

  /**
   * Extract document title
   */
  private extractTitle(filename: string, text: string, sections: OutlineSection[]): string {
    // Try to get from first section
    if (sections.length > 0 && sections[0].heading) {
      return sections[0].heading;
    }

    // Try first line of text
    const firstLine = text.split('\n').find(l => l.trim().length > 0);
    if (firstLine && firstLine.length < 100) {
      return firstLine.trim();
    }

    // Fall back to filename
    return filename.replace(/\.[^.]+$/, '');
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

let instance: DocumentOutlineService | null = null;

export function getDocumentOutlineService(prisma: PrismaClient): DocumentOutlineService {
  if (!instance) {
    instance = new DocumentOutlineService(prisma);
  }
  return instance;
}
