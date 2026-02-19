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
 * Recursively find text bodies in slide XML and extract text
 */
function findTextBodies(
  node: any,
  collected: { title?: string; bodyParts: string[]; bullets: string[] },
): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) {
      findTextBodies(item, collected);
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

  // Recurse into container elements
  const containerKeys = [
    "p:sld",
    "p:cSld",
    "p:spTree",
    "p:sp",
    "p:grpSp",
    "p:graphicFrame",
    "a:graphic",
    "a:graphicData",
    "a:tbl",
    "a:tr",
    "a:tc",
  ];
  for (const key of containerKeys) {
    if (node[key]) {
      findTextBodies(node[key], collected);
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
  console.log(
    `📊 [PPTX] Starting per-slide extraction (${(buffer.length / 1024 / 1024).toFixed(1)} MB)...`,
  );

  const AdmZip = require("adm-zip");
  const xml2js = require("xml2js");

  try {
    const tZipStart = Date.now();
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    console.log(
      `⏱️ [PPTX] ZIP parse: ${Date.now() - tZipStart}ms (${zipEntries.length} entries)`,
    );

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
    console.log(
      `⏱️ [PPTX] Found ${slideEntries.length} slides, ${notesEntries.size} notes in ${Date.now() - tZipStart}ms`,
    );

    const tParseStart = Date.now();
    const slides: PptxExtractedSlide[] = [];
    const slideTitles: (string | null)[] = [];
    let hasNotes = false;
    let presentationTitle: string | undefined;

    // Parse ALL slides in parallel (each gets its own parser instance)
    const slideParseResults = await Promise.all(
      slideEntries.map(async ({ slideNum, entry }) => {
        const parser = new xml2js.Parser();
        const slideXml = entry.getData().toString("utf8");

        try {
          const result = await parser.parseStringPromise(slideXml);

          // Collect text from slide
          const collected = {
            title: undefined as string | undefined,
            bodyParts: [] as string[],
            bullets: [] as string[],
          };
          findTextBodies(result, collected);

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
          };
        } catch (parseError) {
          console.warn(
            `⚠️ [PPTX] Failed to parse slide ${slideNum}:`,
            parseError,
          );
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

    console.log(
      `⏱️ [PPTX] Slide XML parsing: ${Date.now() - tParseStart}ms (${slideParseResults.length} slides)`,
    );

    // Reassemble results in slide order (Promise.all preserves order)
    for (const { slideData, hasNotes: slideHasNotes } of slideParseResults) {
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

    console.log(
      `✅ [PPTX] Extracted ${slides.length} slides, ${totalWordCount} words, ${hasNotes ? "has notes" : "no notes"}`,
    );

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
    };
  } catch (error: any) {
    console.error("❌ [PPTX] Extraction failed:", error.message);

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
// Exports
// ============================================================================

export default {
  extractPptxWithAnchors,
  extractTextFromPowerPoint,
  createSlideAnchor,
  getSlideAnchors,
};
