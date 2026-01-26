/**
 * Enhanced DOCX Extractor with Heading-Based Anchored Extraction
 *
 * This service extracts text from Word documents with heading structure, enabling:
 * - Anchor-based chunk indexing (anchor.type = 'docx_heading')
 * - Section-aware retrieval ("What's in the Introduction section?")
 * - Heading hierarchy preservation (breadcrumb paths)
 *
 * Uses JSZip + xml2js to parse OOXML and extract heading structure.
 */

import type {
  DocxExtractionResult,
  DocxSection,
  BaseExtractionResult,
} from '../../types/extraction.types';
import type { DocxHeadingAnchor, DocxParagraphAnchor } from '../../types/anchor.types';
import { createDocxHeadingAnchor } from '../../types/anchor.types';

// ============================================================================
// Heading Detection
// ============================================================================

/**
 * OOXML heading style mappings
 */
const HEADING_STYLES: Record<string, number> = {
  Heading1: 1,
  Heading2: 2,
  Heading3: 3,
  Heading4: 4,
  Heading5: 5,
  Heading6: 6,
  Title: 1,
  Subtitle: 2,
  // Common variations
  heading1: 1,
  heading2: 2,
  heading3: 3,
  heading4: 4,
  heading5: 5,
  heading6: 6,
  // Localized (Portuguese)
  Título1: 1,
  Título2: 2,
  Título3: 3,
};

/**
 * Detect heading level from paragraph style
 */
function detectHeadingLevel(styleName: string | undefined): number | null {
  if (!styleName) return null;

  // Check exact match first
  if (HEADING_STYLES[styleName]) {
    return HEADING_STYLES[styleName];
  }

  // Check pattern match (Heading N, Título N)
  const headingMatch = styleName.match(/(?:heading|título|Heading|Título)[\s_-]?(\d)/i);
  if (headingMatch) {
    const level = parseInt(headingMatch[1], 10);
    if (level >= 1 && level <= 6) {
      return level;
    }
  }

  return null;
}

// ============================================================================
// XML Parsing
// ============================================================================

interface ParsedParagraph {
  text: string;
  styleName?: string;
  headingLevel: number | null;
  index: number;
}

/**
 * Extract text from paragraph XML node (w:p)
 */
function extractParagraphText(pNode: any): string {
  const textParts: string[] = [];

  function findText(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) {
        findText(item);
      }
      return;
    }

    // w:t contains actual text
    if (node['w:t']) {
      const t = node['w:t'];
      if (Array.isArray(t)) {
        for (const item of t) {
          if (typeof item === 'string') {
            textParts.push(item);
          } else if (item && item['_']) {
            textParts.push(item['_']);
          }
        }
      } else if (typeof t === 'string') {
        textParts.push(t);
      } else if (t && t['_']) {
        textParts.push(t['_']);
      }
    }

    // Recurse into runs (w:r) and other containers
    for (const key of ['w:r', 'w:hyperlink', 'w:smartTag']) {
      if (node[key]) {
        findText(node[key]);
      }
    }
  }

  findText(pNode);
  return textParts.join('');
}

/**
 * Get paragraph style name from w:p node
 */
function getParagraphStyle(pNode: any): string | undefined {
  const pPr = pNode['w:pPr'];
  if (!pPr) return undefined;

  const pp = Array.isArray(pPr) ? pPr[0] : pPr;
  if (!pp) return undefined;

  const pStyle = pp['w:pStyle'];
  if (!pStyle) return undefined;

  const style = Array.isArray(pStyle) ? pStyle[0] : pStyle;
  if (!style) return undefined;

  // Style name is in w:val attribute
  return style.$?.['w:val'] || style['$']?.val;
}

/**
 * Parse all paragraphs from document.xml
 */
async function parseParagraphs(documentXml: string): Promise<ParsedParagraph[]> {
  const xml2js = require('xml2js');
  const parser = new xml2js.Parser();

  const result = await parser.parseStringPromise(documentXml);
  const paragraphs: ParsedParagraph[] = [];

  // Navigate to w:body
  const document = result['w:document'];
  if (!document) return paragraphs;

  const body = document['w:body'];
  if (!body) return paragraphs;

  const bodyContent = Array.isArray(body) ? body[0] : body;
  if (!bodyContent) return paragraphs;

  // Extract paragraphs (w:p)
  const pNodes = bodyContent['w:p'] || [];
  const pArray = Array.isArray(pNodes) ? pNodes : [pNodes];

  for (let i = 0; i < pArray.length; i++) {
    const pNode = pArray[i];
    if (!pNode) continue;

    const text = extractParagraphText(pNode);
    const styleName = getParagraphStyle(pNode);
    const headingLevel = detectHeadingLevel(styleName);

    paragraphs.push({
      text,
      styleName,
      headingLevel,
      index: i,
    });
  }

  return paragraphs;
}

// ============================================================================
// Section Building
// ============================================================================

/**
 * Build hierarchical section structure from flat paragraphs
 */
function buildSectionTree(paragraphs: ParsedParagraph[]): {
  sections: DocxSection[];
  headings: { text: string; level: number; path: string[] }[];
} {
  const sections: DocxSection[] = [];
  const headings: { text: string; level: number; path: string[] }[] = [];
  const stack: DocxSection[] = [];

  let currentPath: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = para.text.trim();

    if (!text) continue;

    if (para.headingLevel !== null) {
      const level = para.headingLevel;

      // Pop stack until we find a parent level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      // Update path
      currentPath = stack.map(s => s.heading);
      currentPath.push(text);

      // Create new section
      const section: DocxSection = {
        heading: text,
        level,
        path: [...currentPath],
        content: '',
        children: [],
        paragraphStart: para.index,
        paragraphEnd: para.index,
      };

      // Record heading
      headings.push({
        text,
        level,
        path: [...currentPath],
      });

      // Add to tree
      if (stack.length === 0) {
        sections.push(section);
      } else {
        const parent = stack[stack.length - 1];
        if (!parent.children) parent.children = [];
        parent.children.push(section);
      }

      stack.push(section);
    } else if (stack.length > 0) {
      // Add content to current section
      const currentSection = stack[stack.length - 1];
      if (currentSection.content) {
        currentSection.content += '\n\n' + text;
      } else {
        currentSection.content = text;
      }
      currentSection.paragraphEnd = para.index;
    }
  }

  return { sections, headings };
}

// ============================================================================
// Main Extraction
// ============================================================================

/**
 * Extract text from DOCX with heading-based anchoring.
 *
 * Returns:
 * - sections[]: Hierarchical section tree with heading/level/content
 * - headings[]: Flat list of headings with paths
 * - paragraphCount: Total number of paragraphs
 * - hasToc: Whether document has table of contents
 *
 * Usage:
 * ```typescript
 * const result = await extractDocxWithAnchors(buffer);
 * for (const section of result.sections) {
 *   const anchor = createDocxHeadingAnchor(section.heading, section.level, {
 *     headingPath: section.path,
 *   });
 *   // Create chunks from section.content, attach anchor
 * }
 * ```
 */
export async function extractDocxWithAnchors(
  buffer: Buffer
): Promise<DocxExtractionResult> {
  console.log(`📝 [DOCX] Starting heading-based extraction (${buffer.length} bytes)...`);

  const JSZip = require('jszip');

  try {
    const zip = await JSZip.loadAsync(buffer);

    // Extract document.xml
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('Invalid DOCX: missing document.xml');
    }

    const documentXml = await docXmlFile.async('string');

    // Parse paragraphs
    const paragraphs = await parseParagraphs(documentXml);

    if (paragraphs.length === 0) {
      console.warn('⚠️ [DOCX] No paragraphs found');
      return {
        sourceType: 'docx',
        text: '',
        sections: [],
        headings: [],
        paragraphCount: 0,
        hasToc: false,
        wordCount: 0,
        confidence: 0.5,
      };
    }

    // Build section tree
    const { sections, headings } = buildSectionTree(paragraphs);

    // Detect TOC (look for "Table of Contents" or "Sumário" in headings)
    const hasToc = headings.some(
      h =>
        h.text.toLowerCase().includes('table of contents') ||
        h.text.toLowerCase().includes('sumário') ||
        h.text.toLowerCase().includes('contents')
    );

    // Extract document title (first H1 or Title style)
    let documentTitle: string | undefined;
    const titleHeading = headings.find(h => h.level === 1);
    if (titleHeading) {
      documentTitle = titleHeading.text;
    }

    // Build full text (preserving structure)
    let fullText = '';
    const appendSection = (section: DocxSection, depth: number = 0): void => {
      const prefix = '#'.repeat(section.level) + ' ';
      fullText += prefix + section.heading + '\n\n';
      if (section.content) {
        fullText += section.content + '\n\n';
      }
      if (section.children) {
        for (const child of section.children) {
          appendSection(child, depth + 1);
        }
      }
    };

    for (const section of sections) {
      appendSection(section);
    }

    // If no headings, just concatenate all paragraphs
    if (sections.length === 0) {
      fullText = paragraphs.map(p => p.text).join('\n\n');
    }

    const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;

    console.log(
      `✅ [DOCX] Extracted ${paragraphs.length} paragraphs, ${headings.length} headings, ${wordCount} words`
    );

    return {
      sourceType: 'docx',
      text: fullText.trim(),
      sections,
      headings,
      paragraphCount: paragraphs.length,
      hasToc,
      documentTitle,
      wordCount,
      confidence: 1.0,
    };
  } catch (error: any) {
    console.error('❌ [DOCX] Extraction failed:', error.message);

    if (
      error.message?.includes('zip file') ||
      error.message?.includes('corrupted')
    ) {
      throw new Error(
        'Word document appears to be corrupted or incomplete. Please try re-uploading.'
      );
    }

    throw new Error(`Failed to extract text from Word document: ${error.message}`);
  }
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Legacy extraction function that returns single text blob.
 * Use extractDocxWithAnchors() for anchor support.
 */
export async function extractTextFromWord(
  buffer: Buffer
): Promise<BaseExtractionResult> {
  const result = await extractDocxWithAnchors(buffer);
  return {
    text: result.text,
    wordCount: result.wordCount,
    confidence: result.confidence,
  };
}

// ============================================================================
// Anchor Helpers
// ============================================================================

/**
 * Create a DOCX heading anchor for a section.
 */
export function createHeadingAnchorFromSection(
  section: DocxSection
): DocxHeadingAnchor {
  return createDocxHeadingAnchor(section.heading, section.level, {
    headingPath: section.path,
    paragraphStart: section.paragraphStart,
    paragraphEnd: section.paragraphEnd,
  });
}

/**
 * Get all anchors for a DOCX extraction result.
 * Returns one anchor per section with content.
 */
export function getHeadingAnchors(
  result: DocxExtractionResult
): DocxHeadingAnchor[] {
  const anchors: DocxHeadingAnchor[] = [];

  const collectAnchors = (section: DocxSection): void => {
    anchors.push(createHeadingAnchorFromSection(section));
    if (section.children) {
      for (const child of section.children) {
        collectAnchors(child);
      }
    }
  };

  for (const section of result.sections) {
    collectAnchors(section);
  }

  return anchors;
}

/**
 * Find section by heading text (fuzzy match).
 */
export function findSectionByHeading(
  result: DocxExtractionResult,
  headingText: string
): DocxSection | undefined {
  const searchLower = headingText.toLowerCase();

  const search = (sections: DocxSection[]): DocxSection | undefined => {
    for (const section of sections) {
      if (section.heading.toLowerCase().includes(searchLower)) {
        return section;
      }
      if (section.children) {
        const found = search(section.children);
        if (found) return found;
      }
    }
    return undefined;
  };

  return search(result.sections);
}

// ============================================================================
// Exports
// ============================================================================

export default {
  extractDocxWithAnchors,
  extractTextFromWord,
  createHeadingAnchorFromSection,
  getHeadingAnchors,
  findSectionByHeading,
};
