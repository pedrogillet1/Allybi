import { describe, expect, test } from "@jest/globals";
import { buildInputChunks } from "../chunkAssembly.service";

describe("Audit Invariant 1: every chunk has non-empty documentId + sourceType + chunkType", () => {
  test("PDF with documentContext populates documentId on every chunk including cell_fact", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "Balance Sheet\nAssets: 500",
      pages: [{ page: 1, text: "Balance Sheet\nAssets: 500" }],
      extractedTables: [
        {
          tableId: "pdf:p1:t0",
          pageOrSlide: 1,
          markdown: "| A | B |\n|---|---|\n| 1 | 2 |",
          rows: [
            { rowIndex: 0, isHeader: true, cells: [{ text: "A", colIndex: 0 }, { text: "B", colIndex: 1 }] },
            { rowIndex: 1, isHeader: false, cells: [{ text: "1", colIndex: 0 }, { text: "2", colIndex: 1 }] },
          ],
        },
      ],
    };
    const ctx = { documentId: "doc-audit-1", versionId: "v-1", rootDocumentId: "root-1", isLatestVersion: true };
    const chunks = buildInputChunks(extraction, extraction.text, undefined, ctx);
    for (const c of chunks) {
      expect(c.metadata.documentId).toBe("doc-audit-1");
      expect(c.metadata.sourceType).toBeTruthy();
      expect(c.metadata.chunkType).toBeTruthy();
    }
  });
});

describe("Audit Invariant 2: PDF text chunks always have pageNumber >= 1 and startChar/endChar", () => {
  test("multi-page PDF never produces a text chunk without page or char offsets", () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({
      page: i + 1,
      text: `Content for page ${i + 1}. `.repeat(20),
    }));
    const extraction: any = {
      sourceType: "pdf",
      text: pages.map((p) => p.text).join("\n"),
      pages,
    };
    const chunks = buildInputChunks(extraction, extraction.text);
    const textChunks = chunks.filter((c) => c.metadata.chunkType === "text");
    expect(textChunks.length).toBeGreaterThan(0);
    for (const c of textChunks) {
      expect(c.pageNumber).toBeGreaterThanOrEqual(1);
      expect(typeof c.metadata.startChar).toBe("number");
      expect(typeof c.metadata.endChar).toBe("number");
      expect(c.metadata.endChar!).toBeGreaterThan(c.metadata.startChar!);
    }
  });
});

describe("Audit Invariant 3: cell_fact chunks always carry tableId + rowIndex + columnIndex", () => {
  test("PDF, DOCX, and PPTX cell_fact chunks all have structural metadata", () => {
    const table = {
      tableId: "t0",
      pageOrSlide: 1,
      markdown: "",
      rows: [
        { rowIndex: 0, isHeader: true, cells: [{ text: "Header", colIndex: 0 }] },
        { rowIndex: 1, isHeader: false, cells: [{ text: "Value", colIndex: 0 }] },
      ],
    };
    const formats: Array<{ sourceType: string; extraction: any }> = [
      {
        sourceType: "pdf",
        extraction: {
          sourceType: "pdf", text: "Text.", pages: [{ page: 1, text: "Text." }],
          extractedTables: [{ ...table, tableId: "pdf:p1:t0" }],
        },
      },
      {
        sourceType: "docx",
        extraction: {
          sourceType: "docx", text: "Text.",
          sections: [{ heading: "S1", level: 1, content: "Text.", path: ["S1"] }],
          extractedTables: [{ ...table, tableId: "docx:t0" }],
        },
      },
      {
        sourceType: "pptx",
        extraction: {
          sourceType: "pptx", text: "Text.",
          slides: [{ slide: 1, title: "S", text: "Text." }],
          extractedTables: [{ ...table, tableId: "pptx:s1:t0" }],
        },
      },
    ];
    for (const { sourceType, extraction } of formats) {
      const chunks = buildInputChunks(extraction, extraction.text);
      const cells = chunks.filter((c) => c.metadata.chunkType === "cell_fact");
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) {
        expect(c.metadata.tableId).toBeTruthy();
        expect(c.metadata.rowIndex).toBeGreaterThanOrEqual(0);
        expect(c.metadata.columnIndex).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("Audit Invariant 4: version context is immutable across all chunk types", () => {
  test("documentId, versionId, rootDocumentId survive through text + heading + cell_fact + notes chunks", () => {
    const extraction: any = {
      sourceType: "pptx",
      text: "Title\nBody text\nNotes content",
      slides: [{ slide: 1, title: "Title", text: "Body text", notes: "Notes content" }],
      extractedTables: [
        {
          tableId: "pptx:s1:t0", pageOrSlide: 1, markdown: "",
          rows: [
            { rowIndex: 0, isHeader: true, cells: [{ text: "H", colIndex: 0 }] },
            { rowIndex: 1, isHeader: false, cells: [{ text: "V", colIndex: 0 }] },
          ],
        },
      ],
    };
    const ctx = { documentId: "d1", versionId: "v1", rootDocumentId: "r1", isLatestVersion: false };
    const chunks = buildInputChunks(extraction, extraction.text, undefined, ctx);
    const types = new Set(chunks.map((c) => c.metadata.chunkType));
    expect(types.size).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.metadata.documentId).toBe("d1");
      expect(c.metadata.versionId).toBe("v1");
      expect(c.metadata.rootDocumentId).toBe("r1");
      expect(c.metadata.isLatestVersion).toBe(false);
    }
  });
});

describe("Audit Invariant 5: no chunk content is empty string after assembly + dedup", () => {
  test("buildInputChunks never emits a chunk with empty or whitespace-only content", () => {
    const extractions: any[] = [
      { sourceType: "pdf", text: "A".repeat(3000), pages: [{ page: 1, text: "A".repeat(3000) }] },
      { sourceType: "docx", text: "Body.", sections: [{ heading: "", level: 1, content: "Body.", path: [] }] },
      { sourceType: "xlsx", text: "d", sheets: [{ sheetName: "S", textContent: "data" }],
        cellFacts: [{ sheet: "S", cell: "A1", rowLabel: "R", colHeader: "C", value: "1", displayValue: "1" }] },
      { sourceType: "text", text: "Plain text." },
    ];
    for (const extraction of extractions) {
      const chunks = buildInputChunks(extraction, extraction.text || "");
      for (const c of chunks) {
        expect(c.content.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
