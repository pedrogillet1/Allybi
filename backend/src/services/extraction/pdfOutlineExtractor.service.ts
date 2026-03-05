/**
 * PDF Outline / Bookmark Extractor
 *
 * Extracts the document outline (bookmarks / table-of-contents tree) from a PDF
 * using @cantoo/pdf-lib.  Each entry contains a title, nesting level, and the
 * 0-based page index the bookmark points to.
 *
 * The outline tree is walked iteratively via First/Next sibling links.
 * A visited-ref guard prevents infinite loops on malformed PDFs.
 *
 * Contract: **never throws** -- returns [] on any error.
 */

import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFString,
  PDFHexString,
  PDFArray,
  PDFNumber,
  PDFRef,
} from "@cantoo/pdf-lib";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PdfOutlineEntry {
  title: string;
  level: number;     // 0-based nesting depth
  pageIndex: number;  // 0-based page index
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode a PDF string (PDFString or PDFHexString) into a JS string.
 */
function decodeTitle(raw: unknown): string {
  if (raw instanceof PDFHexString) {
    return raw.decodeText();
  }
  if (raw instanceof PDFString) {
    return raw.decodeText();
  }
  if (typeof raw === "string") {
    return raw;
  }
  return "";
}

/**
 * Resolve the page index for an outline item.
 *
 * Outline items specify their destination via either:
 *   - /Dest  (explicit destination -- typically a PDFArray whose first element
 *             is a page ref)
 *   - /A     (action dictionary with an /S = /GoTo action containing a /D dest)
 *
 * Returns -1 when the page cannot be resolved.
 */
function resolvePageIndex(
  dict: PDFDict,
  context: PDFDocument["context"],
  pageRefs: PDFRef[],
): number {
  // Try /Dest first
  let destRaw = dict.get(PDFName.of("Dest"));
  if (destRaw) {
    destRaw = context.lookup(destRaw);
    if (destRaw instanceof PDFArray && destRaw.size() > 0) {
      const pageRef = destRaw.get(0);
      return findPageIndex(pageRef, context, pageRefs);
    }
  }

  // Try /A action
  let actionRaw = dict.get(PDFName.of("A"));
  if (actionRaw) {
    actionRaw = context.lookup(actionRaw);
    if (actionRaw instanceof PDFDict) {
      let actionDest = actionRaw.get(PDFName.of("D"));
      if (actionDest) {
        actionDest = context.lookup(actionDest);
        if (actionDest instanceof PDFArray && actionDest.size() > 0) {
          const pageRef = actionDest.get(0);
          return findPageIndex(pageRef, context, pageRefs);
        }
      }
    }
  }

  return -1;
}

/**
 * Look up a page reference in the ordered page-ref list and return its 0-based
 * index, or -1 if not found.
 */
function findPageIndex(
  ref: unknown,
  context: PDFDocument["context"],
  pageRefs: PDFRef[],
): number {
  if (!(ref instanceof PDFRef)) return -1;

  for (let i = 0; i < pageRefs.length; i++) {
    if (
      pageRefs[i].objectNumber === ref.objectNumber &&
      pageRefs[i].generationNumber === ref.generationNumber
    ) {
      return i;
    }
  }

  return -1;
}

/**
 * Recursively walk the outline tree collecting entries.
 *
 * Outline items are linked via:
 *   - /First  -> first child
 *   - /Next   -> next sibling
 *
 * A `visited` set of stringified refs guards against cycles.
 */
function walkOutlineTree(
  context: PDFDocument["context"],
  nodeRef: unknown,
  level: number,
  entries: PdfOutlineEntry[],
  pageRefs: PDFRef[],
  visited: Set<string>,
): void {
  let currentRef = nodeRef;

  while (currentRef) {
    // Resolve to a dict
    const resolved = context.lookup(currentRef as any) as unknown;
    if (!(resolved instanceof PDFDict)) break;
    const resolvedDict = resolved as PDFDict;

    // Cycle guard
    const refKey =
      currentRef instanceof PDFRef
        ? `${currentRef.objectNumber}-${currentRef.generationNumber}`
        : `anon-${entries.length}`;
    if (visited.has(refKey)) break;
    visited.add(refKey);

    // Extract title
    const titleRaw = resolvedDict.get(PDFName.of("Title"));
    const title = decodeTitle(titleRaw ? context.lookup(titleRaw) ?? titleRaw : titleRaw).trim();

    // Resolve destination page
    const pageIndex = resolvePageIndex(resolvedDict, context, pageRefs);

    if (title) {
      entries.push({
        title,
        level,
        pageIndex: pageIndex >= 0 ? pageIndex : 0,
      });
    }

    // Recurse into children (/First)
    const firstChild = resolvedDict.get(PDFName.of("First"));
    if (firstChild) {
      walkOutlineTree(context, firstChild, level + 1, entries, pageRefs, visited);
    }

    // Move to next sibling (/Next)
    currentRef = resolvedDict.get(PDFName.of("Next")) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Extract the outline / bookmark tree from a PDF buffer.
 *
 * @param buffer  Raw PDF file bytes
 * @returns       Ordered list of outline entries (may be empty)
 */
export async function extractPdfOutline(
  buffer: Buffer,
): Promise<PdfOutlineEntry[]> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const catalog = pdfDoc.catalog;

    // Retrieve /Outlines dictionary from the catalog
    const outlinesRef = catalog.get(PDFName.of("Outlines"));
    if (!outlinesRef) return [];

    const outlinesDict = catalog.context.lookup(outlinesRef);
    if (!(outlinesDict instanceof PDFDict)) return [];

    // Get the first top-level outline item
    const firstRef = outlinesDict.get(PDFName.of("First"));
    if (!firstRef) return [];

    // Build ordered page-ref list for destination resolution
    const pages = pdfDoc.getPages();
    const pageRefs: PDFRef[] = pages.map((page) => page.ref);

    const entries: PdfOutlineEntry[] = [];
    const visited = new Set<string>();

    walkOutlineTree(
      catalog.context,
      firstRef,
      0,
      entries,
      pageRefs,
      visited,
    );

    return entries;
  } catch (err) {
    logger.warn("[PDF] Failed to extract outlines", {
      error: (err as Error).message,
    });
    return [];
  }
}
