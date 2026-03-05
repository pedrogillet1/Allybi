/**
 * Enhanced PPTX Extractor with Per-Slide Anchored Extraction
 *
 * This service extracts text from PowerPoint presentations on a per-slide basis, enabling:
 * - Anchor-based chunk indexing (anchor.type = 'ppt_slide')
 * - "Which slide mentions X?" queries
 * - Preview modal jump-to-slide functionality
 * - Slide title extraction for better context
 *
 * Uses adm-zip + xml2js for PPTX parsing (OOXML format).
 */

import type {
  PptxExtractionResult,
  PptxExtractedSlide,
  BaseExtractionResult,
} from "../../types/extraction.types";
import type { PptSlideAnchor } from "../../types/extraction.types";
import { createPptSlideAnchor } from "../../types/extraction.types";
import { formatAsMarkdownTable } from "../../utils/pdfTableExtractor";
import { logger } from "../../utils/logger";
import type { ExtractedTable } from "../ingestion/extraction/extractionResult.types";

// ============================================================================
// Post-processing
// ============================================================================

/**
 * Clean up extracted text
 */
function postProcessText(text: string): string {
  if (!text || text.trim().length === 0) {
    return "";
  }

  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ============================================================================
// XML Text Extraction
// ============================================================================

/**
 * Extract text from a text body (p:txBody)
 */
function extractTextFromBody(txBody: any): {
  text: string;
  bullets: string[];
} {
  if (!txBody) return { text: "", bullets: [] };

  const body = Array.isArray(txBody) ? txBody[0] : txBody;
  if (!body) return { text: "", bullets: [] };

  const paragraphs = body["a:p"];
  return extractTextFromParagraphs(paragraphs);
}

/**
 * Extract text from paragraph array (a:p)
 */
function extractTextFromParagraphs(paragraphs: any): {
  text: string;
  bullets: string[];
} {
  if (!paragraphs) return { text: "", bullets: [] };

  const paragraphArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  const lines: string[] = [];
  const bullets: string[] = [];

  for (const p of paragraphArray) {
    const lineText = extractTextFromRuns(p["a:r"]);
    if (lineText.trim()) {
      lines.push(lineText.trim());

      // Check if this paragraph has bullet properties
      const pPr = p["a:pPr"];
      if (pPr) {
        const pp = Array.isArray(pPr) ? pPr[0] : pPr;
        // Check for bullet marker (a:buChar, a:buAutoNum, etc.)
        if (pp["a:buChar"] || pp["a:buAutoNum"] || pp["a:buBlip"]) {
          bullets.push(lineText.trim());
        }
      }
    }
  }

  return {
    text: lines.join("\n"),
    bullets,
  };
}

/**
 * Extract text from text runs (a:r)
 */
function extractTextFromRuns(runs: any): string {
  if (!runs) return "";

  const runArray = Array.isArray(runs) ? runs : [runs];
  const textFragments: string[] = [];

  for (const run of runArray) {
    if (run && run["a:t"]) {
      const textContent = run["a:t"];
      if (Array.isArray(textContent)) {
        for (const t of textContent) {
          if (typeof t === "string") {
            textFragments.push(t);
          } else if (t && typeof t === "object" && t["_"]) {
            textFragments.push(t["_"]);
          }
        }
      } else if (typeof textContent === "string") {
        textFragments.push(textContent);
      } else if (
        textContent &&
        typeof textContent === "object" &&
        textContent["_"]
      ) {
        textFragments.push(textContent["_"]);
      }
    }
  }

  return textFragments.join("");
}

/**
 * Extract a table from a:tbl node as markdown.
 * Walks a:tbl > a:tr > a:tc > a:txBody to build a 2D string array,
 * then formats via the shared formatAsMarkdownTable helper.
 */
function extractTableMarkdown(tblNode: any): {
  markdown: string;
  rows2d: string[][];
  structuredRows: ExtractedTable["rows"];
} {
  const tbl = Array.isArray(tblNode) ? tblNode[0] : tblNode;
  if (!tbl) return { markdown: "", rows2d: [], structuredRows: [] };

  const trNodes = tbl["a:tr"];
  if (!trNodes) return { markdown: "", rows2d: [], structuredRows: [] };

  const trArray = Array.isArray(trNodes) ? trNodes : [trNodes];
  const rows: ExtractedTable["rows"] = [];
  let rowIndex = 0;

  for (const tr of trArray) {
    const tcNodes = tr["a:tc"];
    if (!tcNodes) {
      rows.push({ rowIndex, isHeader: rowIndex === 0, cells: [] });
      rowIndex++;
      continue;
    }
    const tcArray = Array.isArray(tcNodes) ? tcNodes : [tcNodes];
    const cells: ExtractedTable["rows"][number]["cells"] = [];
    for (const tc of tcArray) {
      const { text } = extractTextFromBody(tc["a:txBody"]);
      const tcPr = tc["a:tcPr"];
      const tcPrNode = Array.isArray(tcPr) ? tcPr[0] : tcPr;
      const attrs = tcPrNode?.$ || {};
      const colSpan = Math.max(
        1,
        Number(attrs.gridSpan ?? attrs["gridSpan"] ?? 1) || 1,
      );
      const rowSpan = Math.max(
        1,
        Number(attrs.rowSpan ?? attrs["rowSpan"] ?? 1) || 1,
      );
      const hMerge = Boolean(attrs.hMerge ?? attrs["hMerge"]);
      const vMerge = Boolean(attrs.vMerge ?? attrs["vMerge"]);
      const startCol = cells.length;
      cells.push({
        text: text.trim(),
        colIndex: startCol,
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
        ...(hMerge || vMerge ? { isMergedContinuation: true } : {}),
      });
      for (let s = 1; s < colSpan; s++) {
        cells.push({
          text: "",
          colIndex: startCol + s,
          isMergedContinuation: true,
        });
      }
    }
    rows.push({
      rowIndex,
      isHeader: rowIndex === 0,
      cells,
    });
    rowIndex++;
  }

  if (rows.length === 0) return { markdown: "", rows2d: [], structuredRows: [] };

  const maxCols = Math.max(...rows.map((r) => r.cells.length), 0);
  const normalized = rows.map((row) => {
    const cells = [...row.cells];
    while (cells.length < maxCols) {
      cells.push({
        text: "",
        colIndex: cells.length,
      });
    }
    return {
      ...row,
      cells,
    };
  });
  const rows2d = normalized.map((row) => row.cells.map((cell) => cell.text));
  return {
    markdown: formatAsMarkdownTable(rows2d),
    rows2d,
    structuredRows: normalized,
  };
}

/**
 * Recursively find text bodies in slide XML and extract text
 */
function findTextBodies(
  node: any,
  collected: { title?: string; bodyParts: string[]; bullets: string[]; extractedTables?: ExtractedTable[] },
  slideCtx?: { slideNum: number; tableCounter: { count: number } },
): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) {
      findTextBodies(item, collected, slideCtx);
    }
    return;
  }

  // Found a text body container
  if (node["p:txBody"]) {
    const { text, bullets } = extractTextFromBody(node["p:txBody"]);
    if (text.trim()) {
      collected.bodyParts.push(text.trim());
      collected.bullets.push(...bullets);
    }
  }

  // Check for standalone paragraphs
  if (node["a:p"] && !node["p:txBody"]) {
    const { text, bullets } = extractTextFromParagraphs(node["a:p"]);
    if (text.trim()) {
      collected.bodyParts.push(text.trim());
      collected.bullets.push(...bullets);
    }
  }

  // Check if this is a title shape
  if (node["p:nvSpPr"]) {
    const nvSpPr = Array.isArray(node["p:nvSpPr"])
      ? node["p:nvSpPr"][0]
      : node["p:nvSpPr"];
    const nvPr = nvSpPr?.["p:nvPr"];
    if (nvPr) {
      const nv = Array.isArray(nvPr) ? nvPr[0] : nvPr;
      // Check for title placeholder
      if (nv["p:ph"]) {
        const ph = Array.isArray(nv["p:ph"]) ? nv["p:ph"][0] : nv["p:ph"];
        const type = ph?.$?.type;
        if (type === "title" || type === "ctrTitle") {
          const { text } = extractTextFromBody(node["p:txBody"]);
          if (text.trim() && !collected.title) {
            collected.title = text.trim();
          }
        }
      }
    }
  }

  // Intercept table nodes — render as markdown instead of recursing into cells
  if (node["a:tbl"]) {
    const tblNodes = Array.isArray(node["a:tbl"])
      ? node["a:tbl"]
      : [node["a:tbl"]];
    for (const tbl of tblNodes) {
      const { markdown, structuredRows } = extractTableMarkdown(tbl);
      if (markdown.trim()) {
        collected.bodyParts.push(markdown.trim());
        // Collect structured table for cell-level indexing
        if (collected.extractedTables && slideCtx && structuredRows.length > 0) {
          const tIdx = slideCtx.tableCounter.count++;
          collected.extractedTables.push({
            tableId: `pptx:s${slideCtx.slideNum}:t${tIdx}`,
            pageOrSlide: slideCtx.slideNum,
            markdown,
            rows: structuredRows,
          });
        }
      }
    }
  }

  // Recurse into container elements (table keys excluded — handled above)
  // Preserve sibling order when xml2js exposes ordered children via "$$".
  // This keeps text shapes and tables interleaved as authored on the slide.
  const orderedChildren = node["$$"];
  const hasDirectRenderableContent =
    Boolean(node["p:txBody"]) || Boolean(node["a:p"]) || Boolean(node["a:tbl"]);
  if (
    Array.isArray(orderedChildren) &&
    orderedChildren.length > 0 &&
    !hasDirectRenderableContent
  ) {
    for (const child of orderedChildren) {
      findTextBodies(child, collected, slideCtx);
    }
    return;
  }

  const containerKeys = [
    "p:sld",
    "p:cSld",
    "p:spTree",
    "p:sp",
    "p:grpSp",
    "p:graphicFrame",
    "a:graphic",
    "a:graphicData",
  ];
  for (const key of containerKeys) {
    if (node[key]) {
      findTextBodies(node[key], collected, slideCtx);
    }
  }
}

/**
 * Extract notes from slide notes XML
 */
function extractNotesText(notesXml: any): string {
  if (!notesXml) return "";

  const collected = {
    title: undefined,
    bodyParts: [] as string[],
    bullets: [] as string[],
  };
  findTextBodies(notesXml, collected);
  return collected.bodyParts.join("\n\n");
}

// ============================================================================
// Main Extraction
// ============================================================================

/**
 * Extract text from PPTX with per-slide anchoring.
 *
 * Returns:
 * - slides[]: Array of { slide, title, text, notes, bullets, layoutType }
 * - slideCount: Total number of slides
 * - slideTitles[]: Array of slide titles for quick lookup
 * - hasNotes: Whether presentation has speaker notes
 *
 * Usage:
 * ```typescript
 * const result = await extractPptxWithAnchors(buffer);
 * for (const slide of result.slides) {
 *   const anchor = createPptSlideAnchor(slide.slide, slide.title);
 *   // Create chunks from slide.text, attach anchor to each chunk
 * }
 * ```
 */
export async function extractPptxWithAnchors(
  buffer: Buffer,
): Promise<PptxExtractionResult> {
  const t0 = Date.now();
  logger.info("[PPTX] Starting per-slide extraction", {
    sizeMB: parseFloat((buffer.length / 1024 / 1024).toFixed(1)),
  });

  const AdmZip = require("adm-zip");
  const xml2js = require("xml2js");

  try {
    const tZipStart = Date.now();
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    logger.debug("[PPTX] ZIP parse complete", {
      durationMs: Date.now() - tZipStart,
      entryCount: zipEntries.length,
    });

    // Collect slide and notes entries
    const slideEntries: { slideNum: number; entry: any }[] = [];
    const notesEntries: Map<number, any> = new Map();

    for (const entry of zipEntries) {
      // Match slide XML files: ppt/slides/slide1.xml
      const slideMatch = entry.entryName.match(/ppt\/slides\/slide(\d+)\.xml$/);
      if (slideMatch) {
        slideEntries.push({
          slideNum: parseInt(slideMatch[1], 10),
          entry,
        });
      }

      // Match notes XML files: ppt/notesSlides/notesSlide1.xml
      const notesMatch = entry.entryName.match(
        /ppt\/notesSlides\/notesSlide(\d+)\.xml$/,
      );
      if (notesMatch) {
        notesEntries.set(parseInt(notesMatch[1], 10), entry);
      }
    }

    if (slideEntries.length === 0) {
      throw new Error("No slides found in PowerPoint file");
    }

    // Sort slides by number
    slideEntries.sort((a, b) => a.slideNum - b.slideNum);
    logger.debug("[PPTX] Found slides and notes", {
      slideCount: slideEntries.length,
      notesCount: notesEntries.size,
      durationMs: Date.now() - tZipStart,
    });

    const tParseStart = Date.now();
    const slides: PptxExtractedSlide[] = [];
    const slideTitles: (string | null)[] = [];
    let hasNotes = false;
    let presentationTitle: string | undefined;

    // Parse ALL slides in parallel (each gets its own parser instance)
    const slideParseResults = await Promise.all(
      slideEntries.map(async ({ slideNum, entry }) => {
        const parser = new xml2js.Parser({
          explicitArray: true,
          explicitChildren: true,
          preserveChildrenOrder: true,
        });
        const slideXml = entry.getData().toString("utf8");

        try {
          const result = await parser.parseStringPromise(slideXml);

          // Collect text from slide
          const collected = {
            title: undefined as string | undefined,
            bodyParts: [] as string[],
            bullets: [] as string[],
            extractedTables: [] as ExtractedTable[],
          };
          const slideTableCtx = { slideNum, tableCounter: { count: 0 } };
          findTextBodies(result, collected, slideTableCtx);

          // Get notes for this slide
          let notes: string | undefined;
          const notesEntry = notesEntries.get(slideNum);
          if (notesEntry) {
            try {
              const notesXml = notesEntry.getData().toString("utf8");
              const notesResult = await parser.parseStringPromise(notesXml);
              notes = extractNotesText(notesResult);
            } catch {
              // Ignore notes parsing errors
            }
          }

          // Build slide text (exclude title from body if present)
          let bodyText = collected.bodyParts.join("\n\n");
          if (collected.title && bodyText.startsWith(collected.title)) {
            bodyText = bodyText.slice(collected.title.length).trim();
          }

          return {
            slideNum,
            slideData: {
              slide: slideNum,
              title: collected.title,
              text: postProcessText(bodyText),
              notes: notes ? postProcessText(notes) : undefined,
              bullets:
                collected.bullets.length > 0 ? collected.bullets : undefined,
            } as PptxExtractedSlide,
            hasNotes: !!(notes && notes.trim()),
            slideTables: collected.extractedTables,
          };
        } catch (parseError) {
          logger.warn("[PPTX] Failed to parse slide", {
            slideNumber: slideNum,
            error: parseError,
          });
          return {
            slideNum,
            slideData: {
              slide: slideNum,
              text: "[Failed to parse slide content]",
            } as PptxExtractedSlide,
            hasNotes: false,
          };
        }
      }),
    );

    logger.debug("[PPTX] Slide XML parsing complete", {
      durationMs: Date.now() - tParseStart,
      slideCount: slideParseResults.length,
    });

    // Reassemble results in slide order (Promise.all preserves order)
    const allPptxExtractedTables: ExtractedTable[] = [];
    for (const { slideData, hasNotes: slideHasNotes, slideTables } of slideParseResults) {
      if (slideTables) allPptxExtractedTables.push(...slideTables);
      slides.push(slideData);
      slideTitles.push(slideData.title || null);
      if (slideHasNotes) hasNotes = true;
      if (slideData.slide === 1 && slideData.title && !presentationTitle) {
        presentationTitle = slideData.title;
      }
    }

    // Build combined text for legacy compatibility
    const allText = slides
      .map((s) => {
        let slideText = "";
        if (s.title) slideText += `${s.title}\n\n`;
        slideText += s.text;
        if (s.notes) slideText += `\n\nNotes: ${s.notes}`;
        return slideText;
      })
      .join("\n\n---\n\n");

    const totalWordCount = slides.reduce(
      (sum, s) =>
        sum +
        (s.text?.split(/\s+/).filter((w) => w.length > 0).length || 0) +
        (s.notes?.split(/\s+/).filter((w) => w.length > 0).length || 0),
      0,
    );

    logger.info("[PPTX] Extraction complete", {
      slideCount: slides.length,
      wordCount: totalWordCount,
      hasNotes,
    });

    return {
      sourceType: "pptx",
      text: postProcessText(allText),
      slideCount: slides.length,
      slides,
      slideTitles,
      hasNotes,
      presentationTitle,
      wordCount: totalWordCount,
      confidence: 1.0,
      ...(allPptxExtractedTables.length > 0 ? { extractedTables: allPptxExtractedTables } : {}),
    };
  } catch (error: any) {
    logger.error("[PPTX] Extraction failed", { error: error.message });

    if (
      error.message?.includes("invalid zip") ||
      error.message?.includes("corrupted")
    ) {
      throw new Error(
        "PowerPoint file appears to be corrupted. Please verify the file integrity.",
      );
    }

    throw new Error(`Failed to extract text from PowerPoint: ${error.message}`);
  }
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Legacy extraction function that returns single text blob.
 * Use extractPptxWithAnchors() for anchor support.
 */
export async function extractTextFromPowerPoint(
  buffer: Buffer,
): Promise<BaseExtractionResult> {
  const result = await extractPptxWithAnchors(buffer);
  return {
    text: result.text,
    pageCount: result.slideCount,
    wordCount: result.wordCount,
    confidence: result.confidence,
  };
}

// ============================================================================
// Anchor Helpers
// ============================================================================

/**
 * Create a PPTX slide anchor for a given slide number.
 */
export function createSlideAnchor(
  slide: number,
  title?: string,
): PptSlideAnchor {
  return createPptSlideAnchor(slide, title);
}

/**
 * Get all anchors for a PPTX extraction result.
 * Returns one anchor per slide.
 */
export function getSlideAnchors(
  result: PptxExtractionResult,
): PptSlideAnchor[] {
  return result.slides.map((slide: any) =>
    createPptSlideAnchor(slide.slide ?? slide.slideNumber, slide.title),
  );
}

// ============================================================================
// Image OCR Text Merging
// ============================================================================

/**
 * Append image OCR text to slide text content.
 *
 * Call this after both extraction and image OCR are complete.
 * For each slide, if any associated images have `ocrText`, the text is
 * appended as `\n[Image text: ...]` to the slide's text field.
 *
 * @param result - The PPTX extraction result from extractPptxWithAnchors
 * @param imageOcrMap - Map from slide number to array of OCR text strings
 * @returns The mutated result with OCR text appended to slide text
 */
export function mergeImageOcrText(
  result: PptxExtractionResult,
  imageOcrMap: Map<number, string[]>,
): PptxExtractionResult {
  if (imageOcrMap.size === 0) return result;

  for (const slide of result.slides) {
    const slideNum = slide.slide ?? (slide as any).slideNumber;
    const ocrTexts = imageOcrMap.get(slideNum);
    if (!ocrTexts || ocrTexts.length === 0) continue;

    const ocrSuffix = ocrTexts
      .map((text) => `\n[Image text: ${text}]`)
      .join("");
    slide.text = (slide.text || "") + ocrSuffix;

    logger.debug("[PPTX] Merged image OCR text into slide", {
      slideNumber: slideNum,
      ocrSegments: ocrTexts.length,
    });
  }

  // Rebuild combined text for legacy compatibility
  const allText = result.slides
    .map((s: (typeof result.slides)[number]) => {
      let slideText = "";
      if (s.title) slideText += `${s.title}\n\n`;
      slideText += s.text;
      if (s.notes) slideText += `\n\nNotes: ${s.notes}`;
      return slideText;
    })
    .join("\n\n---\n\n");

  result.text = postProcessText(allText);

  return result;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  extractPptxWithAnchors,
  extractTextFromPowerPoint,
  createSlideAnchor,
  getSlideAnchors,
  mergeImageOcrText,
};
