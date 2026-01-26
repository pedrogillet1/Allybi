/**
 * Universal Anchor Types for Document Location
 *
 * Anchors enable precise location of content within documents:
 * - PDF: page number
 * - PPTX: slide number + title
 * - XLSX: sheet + cell + headers
 * - DOCX: heading + level
 * - Image: OCR block coordinates
 *
 * Used throughout the system:
 * - Chunk indexing (metadata on each chunk)
 * - Retrieval results (sourcesUsed)
 * - source_buttons (preview modal jump-to)
 * - Answer citations (inline references)
 */

// ============================================================================
// Anchor Type Discriminators
// ============================================================================

export type AnchorType =
  | 'pdf_page'
  | 'ppt_slide'
  | 'xlsx_cell'
  | 'xlsx_range'
  | 'docx_heading'
  | 'docx_paragraph'
  | 'image_ocr_block'
  | 'text_section';

// ============================================================================
// Base Anchor Interface
// ============================================================================

export interface BaseAnchor {
  type: AnchorType;
}

// ============================================================================
// PDF Page Anchor
// ============================================================================

export interface PdfPageAnchor extends BaseAnchor {
  type: 'pdf_page';
  /** 1-based page number */
  page: number;
  /** Optional bounding box for highlight (x, y, width, height in points) */
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Optional section title if detected */
  sectionTitle?: string;
}

// ============================================================================
// PowerPoint Slide Anchor
// ============================================================================

export interface PptSlideAnchor extends BaseAnchor {
  type: 'ppt_slide';
  /** 1-based slide number */
  slide: number;
  /** Slide title if available */
  title?: string;
  /** Slide layout type if detected (title, content, two-column, etc.) */
  layoutType?: string;
}

// ============================================================================
// Excel Cell Anchor (single cell)
// ============================================================================

export interface XlsxCellAnchor extends BaseAnchor {
  type: 'xlsx_cell';
  /** Sheet name */
  sheet: string;
  /** Cell address (e.g., "H70") */
  cell: string;
  /** Row label (e.g., "EBITDA", "Net Income") */
  rowLabel?: string;
  /** Column header (e.g., "Jul-2024", "Q3 2024") */
  colHeader?: string;
  /** Parsed period if temporal column */
  period?: {
    year?: number;
    month?: number;  // 1-12
    quarter?: number;  // 1-4
  };
}

// ============================================================================
// Excel Range Anchor (multiple cells)
// ============================================================================

export interface XlsxRangeAnchor extends BaseAnchor {
  type: 'xlsx_range';
  /** Sheet name */
  sheet: string;
  /** Start cell (e.g., "A1") */
  startCell: string;
  /** End cell (e.g., "H20") */
  endCell: string;
  /** Optional range name (named range or table) */
  rangeName?: string;
}

// ============================================================================
// Word Heading Anchor
// ============================================================================

export interface DocxHeadingAnchor extends BaseAnchor {
  type: 'docx_heading';
  /** Heading text */
  heading: string;
  /** Heading level (1 = H1, 2 = H2, etc.) */
  headingLevel: number;
  /** Full heading path (breadcrumb) */
  headingPath?: string[];
  /** Paragraph index range covered by this section */
  paragraphStart?: number;
  paragraphEnd?: number;
}

// ============================================================================
// Word Paragraph Anchor (fallback when no headings)
// ============================================================================

export interface DocxParagraphAnchor extends BaseAnchor {
  type: 'docx_paragraph';
  /** Starting paragraph index (0-based) */
  paragraphStart: number;
  /** Ending paragraph index */
  paragraphEnd: number;
}

// ============================================================================
// Image OCR Block Anchor
// ============================================================================

export interface ImageOcrBlockAnchor extends BaseAnchor {
  type: 'image_ocr_block';
  /** Block index within the image */
  blockIndex: number;
  /** Bounding box (x, y, width, height as percentages 0-1) */
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** OCR confidence for this block (0-1) */
  confidence?: number;
}

// ============================================================================
// Plain Text Section Anchor
// ============================================================================

export interface TextSectionAnchor extends BaseAnchor {
  type: 'text_section';
  /** Character offset start */
  charStart: number;
  /** Character offset end */
  charEnd: number;
  /** Line number start */
  lineStart?: number;
  /** Line number end */
  lineEnd?: number;
}

// ============================================================================
// Union Type for All Anchors
// ============================================================================

export type Anchor =
  | PdfPageAnchor
  | PptSlideAnchor
  | XlsxCellAnchor
  | XlsxRangeAnchor
  | DocxHeadingAnchor
  | DocxParagraphAnchor
  | ImageOcrBlockAnchor
  | TextSectionAnchor;

// ============================================================================
// Type Guards
// ============================================================================

export function isPdfPageAnchor(anchor: Anchor): anchor is PdfPageAnchor {
  return anchor.type === 'pdf_page';
}

export function isPptSlideAnchor(anchor: Anchor): anchor is PptSlideAnchor {
  return anchor.type === 'ppt_slide';
}

export function isXlsxCellAnchor(anchor: Anchor): anchor is XlsxCellAnchor {
  return anchor.type === 'xlsx_cell';
}

export function isXlsxRangeAnchor(anchor: Anchor): anchor is XlsxRangeAnchor {
  return anchor.type === 'xlsx_range';
}

export function isDocxHeadingAnchor(anchor: Anchor): anchor is DocxHeadingAnchor {
  return anchor.type === 'docx_heading';
}

export function isDocxParagraphAnchor(anchor: Anchor): anchor is DocxParagraphAnchor {
  return anchor.type === 'docx_paragraph';
}

export function isImageOcrBlockAnchor(anchor: Anchor): anchor is ImageOcrBlockAnchor {
  return anchor.type === 'image_ocr_block';
}

export function isTextSectionAnchor(anchor: Anchor): anchor is TextSectionAnchor {
  return anchor.type === 'text_section';
}

// ============================================================================
// Anchor Factory Functions
// ============================================================================

export function createPdfPageAnchor(page: number, options?: Partial<Omit<PdfPageAnchor, 'type' | 'page'>>): PdfPageAnchor {
  return {
    type: 'pdf_page',
    page,
    ...options,
  };
}

export function createPptSlideAnchor(slide: number, title?: string): PptSlideAnchor {
  return {
    type: 'ppt_slide',
    slide,
    ...(title && { title }),
  };
}

export function createXlsxCellAnchor(
  sheet: string,
  cell: string,
  options?: Partial<Omit<XlsxCellAnchor, 'type' | 'sheet' | 'cell'>>
): XlsxCellAnchor {
  return {
    type: 'xlsx_cell',
    sheet,
    cell,
    ...options,
  };
}

export function createXlsxRangeAnchor(
  sheet: string,
  startCell: string,
  endCell: string,
  rangeName?: string
): XlsxRangeAnchor {
  return {
    type: 'xlsx_range',
    sheet,
    startCell,
    endCell,
    ...(rangeName && { rangeName }),
  };
}

export function createDocxHeadingAnchor(
  heading: string,
  headingLevel: number,
  options?: Partial<Omit<DocxHeadingAnchor, 'type' | 'heading' | 'headingLevel'>>
): DocxHeadingAnchor {
  return {
    type: 'docx_heading',
    heading,
    headingLevel,
    ...options,
  };
}

// ============================================================================
// Anchor Serialization (for Pinecone/DB storage)
// ============================================================================

/**
 * Serialize anchor to flat object for metadata storage
 * (Some stores like Pinecone don't support nested objects)
 */
export function flattenAnchor(anchor: Anchor): Record<string, any> {
  const flat: Record<string, any> = {
    anchorType: anchor.type,
  };

  switch (anchor.type) {
    case 'pdf_page':
      flat.page = anchor.page;
      if (anchor.sectionTitle) flat.sectionTitle = anchor.sectionTitle;
      if (anchor.bbox) {
        flat.bboxX = anchor.bbox.x;
        flat.bboxY = anchor.bbox.y;
        flat.bboxW = anchor.bbox.width;
        flat.bboxH = anchor.bbox.height;
      }
      break;

    case 'ppt_slide':
      flat.slide = anchor.slide;
      if (anchor.title) flat.slideTitle = anchor.title;
      if (anchor.layoutType) flat.layoutType = anchor.layoutType;
      break;

    case 'xlsx_cell':
      flat.sheet = anchor.sheet;
      flat.cell = anchor.cell;
      if (anchor.rowLabel) flat.rowLabel = anchor.rowLabel;
      if (anchor.colHeader) flat.colHeader = anchor.colHeader;
      if (anchor.period) {
        if (anchor.period.year) flat.periodYear = anchor.period.year;
        if (anchor.period.month) flat.periodMonth = anchor.period.month;
        if (anchor.period.quarter) flat.periodQuarter = anchor.period.quarter;
      }
      break;

    case 'xlsx_range':
      flat.sheet = anchor.sheet;
      flat.startCell = anchor.startCell;
      flat.endCell = anchor.endCell;
      if (anchor.rangeName) flat.rangeName = anchor.rangeName;
      break;

    case 'docx_heading':
      flat.heading = anchor.heading;
      flat.headingLevel = anchor.headingLevel;
      if (anchor.headingPath) flat.headingPath = anchor.headingPath.join(' > ');
      if (anchor.paragraphStart !== undefined) flat.paragraphStart = anchor.paragraphStart;
      if (anchor.paragraphEnd !== undefined) flat.paragraphEnd = anchor.paragraphEnd;
      break;

    case 'docx_paragraph':
      flat.paragraphStart = anchor.paragraphStart;
      flat.paragraphEnd = anchor.paragraphEnd;
      break;

    case 'image_ocr_block':
      flat.blockIndex = anchor.blockIndex;
      if (anchor.confidence) flat.ocrConfidence = anchor.confidence;
      if (anchor.bbox) {
        flat.bboxX = anchor.bbox.x;
        flat.bboxY = anchor.bbox.y;
        flat.bboxW = anchor.bbox.width;
        flat.bboxH = anchor.bbox.height;
      }
      break;

    case 'text_section':
      flat.charStart = anchor.charStart;
      flat.charEnd = anchor.charEnd;
      if (anchor.lineStart !== undefined) flat.lineStart = anchor.lineStart;
      if (anchor.lineEnd !== undefined) flat.lineEnd = anchor.lineEnd;
      break;
  }

  return flat;
}

/**
 * Reconstruct anchor from flat metadata object
 */
export function unflattenAnchor(flat: Record<string, any>): Anchor | null {
  const type = flat.anchorType as AnchorType;
  if (!type) return null;

  switch (type) {
    case 'pdf_page':
      return {
        type: 'pdf_page',
        page: flat.page,
        ...(flat.sectionTitle && { sectionTitle: flat.sectionTitle }),
        ...(flat.bboxX !== undefined && {
          bbox: {
            x: flat.bboxX,
            y: flat.bboxY,
            width: flat.bboxW,
            height: flat.bboxH,
          },
        }),
      };

    case 'ppt_slide':
      return {
        type: 'ppt_slide',
        slide: flat.slide,
        ...(flat.slideTitle && { title: flat.slideTitle }),
        ...(flat.layoutType && { layoutType: flat.layoutType }),
      };

    case 'xlsx_cell':
      return {
        type: 'xlsx_cell',
        sheet: flat.sheet,
        cell: flat.cell,
        ...(flat.rowLabel && { rowLabel: flat.rowLabel }),
        ...(flat.colHeader && { colHeader: flat.colHeader }),
        ...((flat.periodYear || flat.periodMonth || flat.periodQuarter) && {
          period: {
            ...(flat.periodYear && { year: flat.periodYear }),
            ...(flat.periodMonth && { month: flat.periodMonth }),
            ...(flat.periodQuarter && { quarter: flat.periodQuarter }),
          },
        }),
      };

    case 'xlsx_range':
      return {
        type: 'xlsx_range',
        sheet: flat.sheet,
        startCell: flat.startCell,
        endCell: flat.endCell,
        ...(flat.rangeName && { rangeName: flat.rangeName }),
      };

    case 'docx_heading':
      return {
        type: 'docx_heading',
        heading: flat.heading,
        headingLevel: flat.headingLevel,
        ...(flat.headingPath && { headingPath: flat.headingPath.split(' > ') }),
        ...(flat.paragraphStart !== undefined && { paragraphStart: flat.paragraphStart }),
        ...(flat.paragraphEnd !== undefined && { paragraphEnd: flat.paragraphEnd }),
      };

    case 'docx_paragraph':
      return {
        type: 'docx_paragraph',
        paragraphStart: flat.paragraphStart,
        paragraphEnd: flat.paragraphEnd,
      };

    case 'image_ocr_block':
      return {
        type: 'image_ocr_block',
        blockIndex: flat.blockIndex,
        ...(flat.ocrConfidence && { confidence: flat.ocrConfidence }),
        ...(flat.bboxX !== undefined && {
          bbox: {
            x: flat.bboxX,
            y: flat.bboxY,
            width: flat.bboxW,
            height: flat.bboxH,
          },
        }),
      };

    case 'text_section':
      return {
        type: 'text_section',
        charStart: flat.charStart,
        charEnd: flat.charEnd,
        ...(flat.lineStart !== undefined && { lineStart: flat.lineStart }),
        ...(flat.lineEnd !== undefined && { lineEnd: flat.lineEnd }),
      };

    default:
      return null;
  }
}

// ============================================================================
// Anchor Display Helpers
// ============================================================================

/**
 * Format anchor as human-readable location string
 */
export function formatAnchorLocation(anchor: Anchor, lang: 'en' | 'pt' = 'en'): string {
  const labels = {
    en: {
      page: 'Page',
      slide: 'Slide',
      sheet: 'Sheet',
      cell: 'Cell',
      section: 'Section',
      block: 'Block',
    },
    pt: {
      page: 'Página',
      slide: 'Slide',
      sheet: 'Planilha',
      cell: 'Célula',
      section: 'Seção',
      block: 'Bloco',
    },
  };

  const l = labels[lang];

  switch (anchor.type) {
    case 'pdf_page':
      return `${l.page} ${anchor.page}`;

    case 'ppt_slide':
      return anchor.title
        ? `${l.slide} ${anchor.slide}: ${anchor.title}`
        : `${l.slide} ${anchor.slide}`;

    case 'xlsx_cell':
      const cellInfo = anchor.rowLabel && anchor.colHeader
        ? `${anchor.rowLabel} (${anchor.colHeader})`
        : anchor.cell;
      return `${anchor.sheet} - ${l.cell} ${cellInfo}`;

    case 'xlsx_range':
      return `${anchor.sheet} - ${anchor.startCell}:${anchor.endCell}`;

    case 'docx_heading':
      return anchor.headingPath && anchor.headingPath.length > 1
        ? anchor.headingPath.join(' > ')
        : anchor.heading;

    case 'docx_paragraph':
      return `${l.section} ${anchor.paragraphStart + 1}`;

    case 'image_ocr_block':
      return `${l.block} ${anchor.blockIndex + 1}`;

    case 'text_section':
      return anchor.lineStart !== undefined
        ? `Lines ${anchor.lineStart}-${anchor.lineEnd}`
        : `Chars ${anchor.charStart}-${anchor.charEnd}`;

    default:
      return '';
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createPdfPageAnchor,
  createPptSlideAnchor,
  createXlsxCellAnchor,
  createXlsxRangeAnchor,
  createDocxHeadingAnchor,
  flattenAnchor,
  unflattenAnchor,
  formatAnchorLocation,
  isPdfPageAnchor,
  isPptSlideAnchor,
  isXlsxCellAnchor,
  isXlsxRangeAnchor,
  isDocxHeadingAnchor,
  isDocxParagraphAnchor,
  isImageOcrBlockAnchor,
  isTextSectionAnchor,
};
