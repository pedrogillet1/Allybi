/**
 * Tests for pdfOutlineExtractor.service.ts
 *
 * Uses @cantoo/pdf-lib to generate test PDFs programmatically.
 */

import { PDFDocument, PDFDict, PDFName, PDFString, PDFArray, PDFRef } from "@cantoo/pdf-lib";
import { extractPdfOutline } from "../pdfOutlineExtractor.service";

// ---------------------------------------------------------------------------
// Helper: build a minimal PDF with an outline tree
// ---------------------------------------------------------------------------

async function buildPdfWithOutlines(
  outlines: Array<{ title: string; pageIndex: number; children?: Array<{ title: string; pageIndex: number }> }>,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  // Create pages (ensure enough pages for all referenced indices)
  const maxPageIndex = outlines.reduce((max, o) => {
    const childMax = (o.children || []).reduce((cm, c) => Math.max(cm, c.pageIndex), 0);
    return Math.max(max, o.pageIndex, childMax);
  }, 0);
  for (let i = 0; i <= maxPageIndex; i++) {
    pdfDoc.addPage();
  }

  const pages = pdfDoc.getPages();
  const context = pdfDoc.context;

  // Build outline item dicts from bottom up (children first, then parents)
  // Each outline item: { Title, Dest: [pageRef, /Fit], First?, Last?, Next?, Parent }
  const outlineItemRefs: PDFRef[] = [];

  for (let i = outlines.length - 1; i >= 0; i--) {
    const entry = outlines[i];

    // Build children first
    let firstChildRef: PDFRef | undefined;
    let lastChildRef: PDFRef | undefined;

    if (entry.children && entry.children.length > 0) {
      const childRefs: PDFRef[] = [];
      for (const child of entry.children) {
        const childDict = context.obj({});
        childDict.set(PDFName.of("Title"), PDFString.of(child.title));
        const childDest = context.obj([
          pages[child.pageIndex].ref,
          PDFName.of("Fit"),
        ]);
        childDict.set(PDFName.of("Dest"), childDest);
        const ref = context.register(childDict);
        childRefs.push(ref);
      }

      // Link siblings via /Next
      for (let j = 0; j < childRefs.length - 1; j++) {
        const dict = context.lookup(childRefs[j]) as PDFDict;
        dict.set(PDFName.of("Next"), childRefs[j + 1]);
      }

      // Set parent refs on children
      // (we'll set Parent after creating the parent item below)

      firstChildRef = childRefs[0];
      lastChildRef = childRefs[childRefs.length - 1];
    }

    // Build the parent outline item
    const itemDict = context.obj({});
    itemDict.set(PDFName.of("Title"), PDFString.of(entry.title));
    const dest = context.obj([
      pages[entry.pageIndex].ref,
      PDFName.of("Fit"),
    ]);
    itemDict.set(PDFName.of("Dest"), dest);

    if (firstChildRef) {
      itemDict.set(PDFName.of("First"), firstChildRef);
    }
    if (lastChildRef) {
      itemDict.set(PDFName.of("Last"), lastChildRef);
    }

    const itemRef = context.register(itemDict);
    outlineItemRefs.unshift(itemRef); // prepend since we're iterating in reverse

    // Set Parent on children
    if (entry.children && entry.children.length > 0 && firstChildRef) {
      let childRef: PDFRef | undefined = firstChildRef;
      while (childRef) {
        const childDict = context.lookup(childRef) as PDFDict;
        childDict.set(PDFName.of("Parent"), itemRef);
        const nextRef = childDict.get(PDFName.of("Next"));
        childRef = nextRef instanceof PDFRef ? nextRef : undefined;
      }
    }
  }

  // Link top-level siblings via /Next
  for (let i = 0; i < outlineItemRefs.length - 1; i++) {
    const dict = context.lookup(outlineItemRefs[i]) as PDFDict;
    dict.set(PDFName.of("Next"), outlineItemRefs[i + 1]);
  }

  // Build the /Outlines dictionary
  const outlinesDict = context.obj({});
  outlinesDict.set(PDFName.of("Type"), PDFName.of("Outlines"));
  if (outlineItemRefs.length > 0) {
    outlinesDict.set(PDFName.of("First"), outlineItemRefs[0]);
    outlinesDict.set(PDFName.of("Last"), outlineItemRefs[outlineItemRefs.length - 1]);
  }
  const outlinesRef = context.register(outlinesDict);

  // Set Parent on top-level items
  for (const ref of outlineItemRefs) {
    const dict = context.lookup(ref) as PDFDict;
    dict.set(PDFName.of("Parent"), outlinesRef);
  }

  // Attach /Outlines to catalog
  pdfDoc.catalog.set(PDFName.of("Outlines"), outlinesRef);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractPdfOutline", () => {
  it("extracts outline entries with correct titles, levels, and page indices", async () => {
    const buffer = await buildPdfWithOutlines([
      { title: "Chapter 1", pageIndex: 0 },
      { title: "Chapter 2", pageIndex: 1 },
      { title: "Chapter 3", pageIndex: 2 },
    ]);

    const entries = await extractPdfOutline(buffer);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ title: "Chapter 1", level: 0, pageIndex: 0 });
    expect(entries[1]).toEqual({ title: "Chapter 2", level: 0, pageIndex: 1 });
    expect(entries[2]).toEqual({ title: "Chapter 3", level: 0, pageIndex: 2 });
  });

  it("extracts nested (child) outline entries at incremented levels", async () => {
    const buffer = await buildPdfWithOutlines([
      {
        title: "Part A",
        pageIndex: 0,
        children: [
          { title: "Section A.1", pageIndex: 0 },
          { title: "Section A.2", pageIndex: 1 },
        ],
      },
      { title: "Part B", pageIndex: 2 },
    ]);

    const entries = await extractPdfOutline(buffer);

    expect(entries).toHaveLength(4);

    // Top level
    expect(entries[0]).toEqual({ title: "Part A", level: 0, pageIndex: 0 });
    // Children at level 1
    expect(entries[1]).toEqual({ title: "Section A.1", level: 1, pageIndex: 0 });
    expect(entries[2]).toEqual({ title: "Section A.2", level: 1, pageIndex: 1 });
    // Sibling at level 0
    expect(entries[3]).toEqual({ title: "Part B", level: 0, pageIndex: 2 });
  });

  it("returns empty array for PDF without outlines", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage();
    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);

    const entries = await extractPdfOutline(buffer);

    expect(entries).toEqual([]);
  });

  it("returns empty array for corrupted / invalid buffer (no throw)", async () => {
    const corruptedBuffer = Buffer.from("this is not a PDF at all");

    const entries = await extractPdfOutline(corruptedBuffer);

    expect(entries).toEqual([]);
  });

  it("returns empty array for empty buffer (no throw)", async () => {
    const entries = await extractPdfOutline(Buffer.alloc(0));

    expect(entries).toEqual([]);
  });

  it("handles a single outline entry", async () => {
    const buffer = await buildPdfWithOutlines([
      { title: "Only Section", pageIndex: 0 },
    ]);

    const entries = await extractPdfOutline(buffer);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ title: "Only Section", level: 0, pageIndex: 0 });
  });
});
