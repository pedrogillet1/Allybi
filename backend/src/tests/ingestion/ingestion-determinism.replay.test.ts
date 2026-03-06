import { createHash } from "crypto";
import { normalizeStructuredTableRows } from "../../services/extraction/pdfExtractor.service";
import { buildInputChunks } from "../../services/ingestion/pipeline/chunkAssembly.service";

function fingerprint(chunks: ReturnType<typeof buildInputChunks>): string {
  const canonical = chunks.map((chunk) => ({
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    pageNumber: chunk.pageNumber ?? null,
    metadata: chunk.metadata,
  }));
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

describe("ingestion replay determinism", () => {
  test("semantically identical PDF table cells with different arrival order produce same chunk fingerprint", () => {
    const structuredA = {
      rowCount: 2,
      colCount: 2,
      markdown: "| Metric | Value |\n| --- | --- |\n| Revenue | 1,200 |",
      cells: [
        { rowIndex: 0, colIndex: 0, text: "Metric", isHeader: true },
        { rowIndex: 0, colIndex: 1, text: "Value", isHeader: true },
        { rowIndex: 1, colIndex: 0, text: "Revenue", isHeader: false },
        { rowIndex: 1, colIndex: 1, text: "1200", isHeader: false },
        { rowIndex: 1, colIndex: 1, text: "1,200", isHeader: false },
      ],
    };
    const structuredB = {
      ...structuredA,
      cells: [...structuredA.cells].reverse(),
    };

    const rowsA = normalizeStructuredTableRows(structuredA as any);
    const rowsB = normalizeStructuredTableRows(structuredB as any);

    const extractionA = {
      sourceType: "pdf" as const,
      text: "Revenue table",
      pageCount: 1,
      pages: [{ page: 1, text: "Revenue table" }],
      extractedTables: [
        {
          tableId: "pdf:p1:t0",
          pageOrSlide: 1,
          markdown: structuredA.markdown,
          rows: rowsA,
        },
      ],
    };

    const extractionB = {
      ...extractionA,
      extractedTables: [
        {
          tableId: "pdf:p1:t0",
          pageOrSlide: 1,
          markdown: structuredA.markdown,
          rows: rowsB,
        },
      ],
    };

    const context = {
      documentId: "doc-1",
      versionId: "doc-1",
      rootDocumentId: "doc-1",
      isLatestVersion: true,
    };
    const chunksA = buildInputChunks(
      extractionA as any,
      extractionA.text,
      undefined,
      context,
    );
    const chunksB = buildInputChunks(
      extractionB as any,
      extractionB.text,
      undefined,
      context,
    );

    expect(fingerprint(chunksA)).toBe(fingerprint(chunksB));
  });

  test("semantically identical XLSX cell facts with different arrival order produce same chunk fingerprint", () => {
    const extractionA = {
      sourceType: "xlsx" as const,
      text: "Revenue table",
      sheetCount: 1,
      sheets: [{ sheetName: "Sheet1", textContent: "", isFinancial: true }],
      cellFacts: [
        {
          sheet: "Sheet1",
          cell: "C2",
          rowLabel: "Revenue",
          colHeader: "2023",
          value: "1100",
          displayValue: "1,100",
        },
        {
          sheet: "Sheet1",
          cell: "B2",
          rowLabel: "Revenue",
          colHeader: "2024",
          value: "1200",
          displayValue: "1,200",
        },
      ],
    };

    const extractionB = {
      ...extractionA,
      cellFacts: [...extractionA.cellFacts].reverse(),
    };

    const context = {
      documentId: "doc-1",
      versionId: "doc-1",
      rootDocumentId: "doc-1",
      isLatestVersion: true,
    };

    const chunksA = buildInputChunks(
      extractionA as any,
      extractionA.text,
      undefined,
      context,
    );
    const chunksB = buildInputChunks(
      extractionB as any,
      extractionB.text,
      undefined,
      context,
    );

    expect(fingerprint(chunksA)).toBe(fingerprint(chunksB));
  });
});
