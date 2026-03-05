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
} from "../../types/extraction.types";
import type {
  DocxHeadingAnchor,
  DocxParagraphAnchor,
} from "../../types/extraction.types";
import { createDocxHeadingAnchor } from "../../types/extraction.types";
import { logger } from "../../utils/logger";
import type { ExtractedTable } from "../ingestion/extraction/extractionResult.types";

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
  const headingMatch = styleName.match(
    /(?:heading|título|Heading|Título)[\s_-]?(\d)/i,
  );
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
  hasPageBreak?: boolean;
}

/**
 * Extract text from paragraph XML node (w:p)
 */
function extractParagraphText(pNode: any): string {
  const textParts: string[] = [];

  function findText(node: any): void {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) {
        findText(item);
      }
      return;
    }

    // w:t contains actual text
    if (node["w:t"]) {
      const t = node["w:t"];
      if (Array.isArray(t)) {
        for (const item of t) {
          if (typeof item === "string") {
            textParts.push(item);
          } else if (item && item["_"]) {
            textParts.push(item["_"]);
          }
        }
      } else if (typeof t === "string") {
        textParts.push(t);
      } else if (t && t["_"]) {
        textParts.push(t["_"]);
      }
    }

    // Recurse into runs (w:r) and other containers
    for (const key of ["w:r", "w:hyperlink", "w:smartTag"]) {
      if (node[key]) {
        findText(node[key]);
      }
    }
  }

  findText(pNode);
  return textParts.join("");
}

/**
 * Extract text from a w:tbl (table) node and format as a markdown table.
 *
 * Walks w:tr -> w:tc -> w:p, reusing extractParagraphText for cell content.
 * The first row is treated as the header row with a --- separator line.
 */
function extractTableText(tblNode: any): { markdown: string; rows2d: string[][] } {
  const rows: string[][] = [];

  const trNodes = tblNode["w:tr"];
  if (!trNodes) return { markdown: "", rows2d: [] };

  const trArray = Array.isArray(trNodes) ? trNodes : [trNodes];

  for (const tr of trArray) {
    if (!tr) continue;
    const cells: string[] = [];

    const tcNodes = tr["w:tc"];
    if (!tcNodes) {
      rows.push([]);
      continue;
    }

    const tcArray = Array.isArray(tcNodes) ? tcNodes : [tcNodes];

    for (const tc of tcArray) {
      if (!tc) {
        cells.push("");
        continue;
      }

      // Check for gridSpan (horizontal merged cells)
      const tcPr = tc["w:tcPr"];
      const tcPrNode = Array.isArray(tcPr) ? tcPr[0] : tcPr;
      const gridSpanNode = tcPrNode?.["w:gridSpan"];
      const gridSpanVal = Array.isArray(gridSpanNode) ? gridSpanNode[0] : gridSpanNode;
      const gridSpan = parseInt(gridSpanVal?.$?.["w:val"] || "1", 10);

      // Check for vMerge (vertical merged cells)
      const vMergeNode = tcPrNode?.["w:vMerge"];
      const vMergeVal = Array.isArray(vMergeNode) ? vMergeNode[0] : vMergeNode;
      const isVMergeRestart = vMergeVal?.$?.["w:val"] === "restart";
      const isVMergeContinue = vMergeVal !== undefined && !isVMergeRestart;

      if (isVMergeContinue) {
        cells.push(""); // Continuation cell — visually merged with cell above
        for (let s = 1; s < gridSpan; s++) cells.push("");
        continue;
      }

      // Each cell can contain multiple w:p paragraphs
      const pNodes = tc["w:p"];
      if (!pNodes) {
        cells.push("");
        // Pad for spanned columns
        for (let s = 1; s < gridSpan; s++) cells.push("");
        continue;
      }

      const pArray = Array.isArray(pNodes) ? pNodes : [pNodes];
      const cellTextParts: string[] = [];

      for (const p of pArray) {
        if (!p) continue;
        const pText = extractParagraphText(p);
        if (pText) {
          cellTextParts.push(pText);
        }
      }

      // Join multi-paragraph cell content with a space (markdown table cells are single-line)
      cells.push(cellTextParts.join(" ").trim());

      // Pad empty cells for spanned columns
      for (let s = 1; s < gridSpan; s++) cells.push("");
    }

    rows.push(cells);
  }

  if (rows.length === 0) return { markdown: "", rows2d: [] };

  // Determine the max number of columns across all rows
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols === 0) return { markdown: "", rows2d: [] };

  // Normalize each row to have the same number of columns
  const normalized = rows.map((row) => {
    while (row.length < maxCols) {
      row.push("");
    }
    return row;
  });

  // Build markdown table
  const lines: string[] = [];

  // Header row
  const header = normalized[0];
  lines.push("| " + header.map((c) => c || " ").join(" | ") + " |");

  // Separator
  lines.push("| " + header.map(() => "---").join(" | ") + " |");

  // Data rows
  for (let i = 1; i < normalized.length; i++) {
    lines.push("| " + normalized[i].map((c) => c || " ").join(" | ") + " |");
  }

  return { markdown: lines.join("\n"), rows2d: normalized };
}

/**
 * Get paragraph style name from w:p node
 */
function getParagraphStyle(pNode: any): string | undefined {
  const pPr = pNode["w:pPr"];
  if (!pPr) return undefined;

  const pp = Array.isArray(pPr) ? pPr[0] : pPr;
  if (!pp) return undefined;

  const pStyle = pp["w:pStyle"];
  if (!pStyle) return undefined;

  const style = Array.isArray(pStyle) ? pStyle[0] : pStyle;
  if (!style) return undefined;

  // Style name is in w:val attribute
  return style.$?.["w:val"] || style["$"]?.val;
}

/**
 * Process a single w:p node and push the result onto the paragraphs array.
 */
function processParagraphNode(
  pNode: any,
  index: number,
  paragraphs: ParsedParagraph[],
): void {
  if (!pNode) return;
  const text = extractParagraphText(pNode);
  const styleName = getParagraphStyle(pNode);
  const headingLevel = detectHeadingLevel(styleName);

  // Detect page break before this paragraph (w:pageBreakBefore in w:pPr)
  const pPr = pNode["w:pPr"];
  const pPrNode = Array.isArray(pPr) ? pPr[0] : pPr;
  const pageBreakBefore = pPrNode?.["w:pageBreakBefore"];
  const hasPageBreak = pageBreakBefore !== undefined;

  paragraphs.push({
    text,
    styleName,
    headingLevel,
    index,
    ...(hasPageBreak ? { hasPageBreak: true } : {}),
  });
}

/**
 * Process a single w:tbl node: extract its markdown text and push as a
 * pseudo-paragraph onto the array.
 */
function processTableNode(
  tblNode: any,
  index: number,
  paragraphs: ParsedParagraph[],
  collectedTables?: ExtractedTable[],
  tableCounter?: { count: number },
): void {
  if (!tblNode) return;
  const { markdown, rows2d } = extractTableText(tblNode);
  if (markdown) {
    paragraphs.push({
      text: markdown,
      styleName: undefined,
      headingLevel: null,
      index,
    });
    // Collect structured table data for cell-level indexing
    if (collectedTables && rows2d.length > 0) {
      const tIdx = tableCounter ? tableCounter.count++ : collectedTables.length;
      collectedTables.push({
        tableId: `docx:t${tIdx}`,
        markdown,
        rows: rows2d.map((row, rIdx) => ({
          rowIndex: rIdx,
          isHeader: rIdx === 0,
          cells: row.map((text, cIdx) => ({ text, colIndex: cIdx })),
        })),
      });
    }
  }
}

/**
 * Parse all paragraphs and tables from document.xml in document order.
 *
 * Uses xml2js with { explicitChildren, preserveChildrenOrder } to obtain
 * the `$$` ordered children array so interleaved w:p and w:tbl elements
 * are emitted in the correct sequence.
 *
 * Falls back to separate w:p + w:tbl extraction when `$$` is unavailable.
 */
async function parseParagraphs(
  documentXml: string,
  collectedTables?: ExtractedTable[],
): Promise<ParsedParagraph[]> {
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser({
    explicitChildren: true,
    preserveChildrenOrder: true,
    charsAsChildren: false,
  });

  const result = await parser.parseStringPromise(documentXml);
  const paragraphs: ParsedParagraph[] = [];

  // Navigate to w:body
  const document = result["w:document"];
  if (!document) return paragraphs;

  const body = document["w:body"];
  if (!body) return paragraphs;

  const bodyContent = Array.isArray(body) ? body[0] : body;
  if (!bodyContent) return paragraphs;

  // Try ordered children first (available with explicitChildren + preserveChildrenOrder)
  const orderedChildren: any[] | undefined = bodyContent["$$"];
  const tableCounter = { count: 0 };

  if (orderedChildren && orderedChildren.length > 0) {
    let idx = 0;
    for (const child of orderedChildren) {
      const tagName: string | undefined = child["#name"];
      if (tagName === "w:p") {
        processParagraphNode(child, idx, paragraphs);
        idx++;
      } else if (tagName === "w:tbl") {
        processTableNode(child, idx, paragraphs, collectedTables, tableCounter);
        idx++;
      }
      // Other element types (w:sectPr, etc.) are silently skipped
    }
  } else {
    // Fallback: grab w:p and w:tbl separately (order between them is lost,
    // but at least we don't drop tables entirely).
    logger.warn("[DOCX] Ordered children ($$) unavailable, falling back to unordered w:p + w:tbl extraction");
    let idx = 0;

    const pNodes = bodyContent["w:p"] || [];
    const pArray = Array.isArray(pNodes) ? pNodes : [pNodes];
    for (const pNode of pArray) {
      processParagraphNode(pNode, idx, paragraphs);
      idx++;
    }

    const tblNodes = bodyContent["w:tbl"] || [];
    const tblArray = Array.isArray(tblNodes) ? tblNodes : [tblNodes];
    for (const tblNode of tblArray) {
      processTableNode(tblNode, idx, paragraphs, collectedTables, tableCounter);
      idx++;
    }
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

  // Accumulate text that appears before the first heading (preamble)
  let preambleText = "";
  let preambleStart: number | undefined;
  let preambleEnd: number | undefined;
  let firstHeadingSeen = false;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = para.text.trim();

    if (!text) continue;

    if (para.headingLevel !== null) {
      // Before processing the first heading, flush any accumulated preamble
      if (!firstHeadingSeen && preambleText) {
        sections.push({
          heading: undefined,
          level: 0,
          path: [],
          content: preambleText,
          children: [],
          paragraphStart: preambleStart,
          paragraphEnd: preambleEnd,
        });
      }
      firstHeadingSeen = true;

      const level = para.headingLevel;

      // Pop stack until we find a parent level
      while (stack.length > 0 && stack[stack.length - 1]!.level! >= level) {
        stack.pop();
      }

      // Update path
      currentPath = stack.map((s) => s.heading!).filter(Boolean) as string[];
      currentPath.push(text);

      // Create new section
      const section: DocxSection = {
        heading: text,
        level,
        path: [...currentPath],
        content: "",
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
        currentSection.content += "\n\n" + text;
      } else {
        currentSection.content = text;
      }
      currentSection.paragraphEnd = para.index;
    } else {
      // No heading seen yet — accumulate preamble text
      if (preambleText) {
        preambleText += "\n\n" + text;
      } else {
        preambleText = text;
        preambleStart = para.index;
      }
      preambleEnd = para.index;
    }
  }

  // If the document has no headings at all but has preamble text, create a
  // synthetic section so the content is not lost.
  if (!firstHeadingSeen && preambleText) {
    sections.push({
      heading: undefined,
      level: 0,
      path: [],
      content: preambleText,
      children: [],
      paragraphStart: preambleStart,
      paragraphEnd: preambleEnd,
    });
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
  buffer: Buffer,
): Promise<DocxExtractionResult> {
  logger.info("[DOCX] Starting heading-based extraction", { sizeBytes: buffer.length });

  const AdmZip = require("adm-zip");

  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) throw new Error("Invalid DOCX: missing word/document.xml");
    const documentXml = entry.getData().toString("utf8");

    // Parse paragraphs (+ collect structured tables for cell-level indexing)
    const docxExtractedTables: ExtractedTable[] = [];
    const paragraphs = await parseParagraphs(documentXml, docxExtractedTables);

    if (paragraphs.length === 0) {
      logger.warn("[DOCX] No paragraphs found");
      return {
        sourceType: "docx",
        text: "",
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
      (h) =>
        h.text.toLowerCase().includes("table of contents") ||
        h.text.toLowerCase().includes("sumário") ||
        h.text.toLowerCase().includes("contents"),
    );

    // Extract document title (first H1 or Title style)
    let documentTitle: string | undefined;
    const titleHeading = headings.find((h) => h.level === 1);
    if (titleHeading) {
      documentTitle = titleHeading.text;
    }

    // Build full text (preserving structure)
    let fullText = "";
    const appendSection = (section: DocxSection, depth: number = 0): void => {
      // Preamble sections have no heading — skip the markdown heading line
      if (section.heading) {
        const prefix = "#".repeat(section.level ?? 1) + " ";
        fullText += prefix + section.heading + "\n\n";
      }
      if (section.content) {
        fullText += section.content + "\n\n";
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
      fullText = paragraphs.map((p) => p.text).join("\n\n");
    }

    const wordCount = fullText.split(/\s+/).filter((w) => w.length > 0).length;

    logger.info("[DOCX] Extraction complete", {
      paragraphCount: paragraphs.length,
      headingCount: headings.length,
      wordCount,
    });

    return {
      sourceType: "docx",
      text: fullText.trim(),
      sections,
      headings,
      paragraphCount: paragraphs.length,
      hasToc,
      documentTitle,
      wordCount,
      confidence: 1.0,
      ...(docxExtractedTables.length > 0 ? { extractedTables: docxExtractedTables } : {}),
    };
  } catch (error: any) {
    logger.error("[DOCX] Extraction failed", { error: error.message });

    if (
      error.message?.includes("zip file") ||
      error.message?.includes("corrupted")
    ) {
      throw new Error(
        "Word document appears to be corrupted or incomplete. Please try re-uploading.",
      );
    }

    throw new Error(
      `Failed to extract text from Word document: ${error.message}`,
    );
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
  buffer: Buffer,
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
  section: DocxSection,
): DocxHeadingAnchor {
  return createDocxHeadingAnchor(section.heading!, section.level!, {
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
  result: DocxExtractionResult,
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
  headingText: string,
): DocxSection | undefined {
  const searchLower = headingText.toLowerCase();

  const search = (sections: DocxSection[]): DocxSection | undefined => {
    for (const section of sections) {
      if (section.heading?.toLowerCase().includes(searchLower)) {
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
