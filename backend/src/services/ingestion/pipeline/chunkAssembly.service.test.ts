import { describe, expect, test } from "@jest/globals";
import { buildInputChunks } from "./chunkAssembly.service";

describe("chunkAssembly.service — buildInputChunks", () => {
  // ---------------------------------------------------------------
  // PDF path
  // ---------------------------------------------------------------
  test("PDF chunks carry page, ocrConfidence, sourceType metadata", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "Page one text. Page two text.",
      wordCount: 6,
      confidence: 0.9,
      pageCount: 2,
      pages: [
        { page: 1, text: "Page one text." },
        { page: 2, text: "Page two text." },
      ],
      ocrConfidence: 0.85,
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    expect(chunks.length).toBe(2);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].metadata?.sourceType).toBe("pdf");
    expect(chunks[0].metadata?.chunkType).toBe("text");
    expect(chunks[0].metadata?.ocrConfidence).toBe(0.85);
    expect(typeof chunks[0].metadata?.startChar).toBe("number");
    expect(typeof chunks[0].metadata?.endChar).toBe("number");
  });

  // ---------------------------------------------------------------
  // DOCX path
  // ---------------------------------------------------------------
  test("DOCX sections produce heading + text chunks with sectionName", () => {
    const extraction: any = {
      sourceType: "docx",
      text: "Executive Summary\nSome body text here.",
      wordCount: 6,
      confidence: 1,
      sections: [
        {
          heading: "Executive Summary",
          level: 1,
          content: "Some body text here.",
          path: ["Executive Summary"],
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    expect(chunks.length).toBe(2);

    const heading = chunks.find((c) => c.metadata?.chunkType === "heading");
    expect(heading).toBeDefined();
    expect(heading!.content).toBe("Executive Summary");
    expect(heading!.metadata?.sectionName).toBe("Executive Summary");
    expect(heading!.metadata?.sectionLevel).toBe(1);
    expect(heading!.metadata?.sourceType).toBe("docx");

    const body = chunks.find((c) => c.metadata?.chunkType === "text");
    expect(body).toBeDefined();
    expect(body!.metadata?.sectionName).toBe("Executive Summary");
  });

  test("DOCX with empty sections falls back to plain text split", () => {
    const extraction: any = {
      sourceType: "docx",
      text: "Some plain fallback text.",
      wordCount: 5,
      confidence: 1,
      sections: [],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks.length).toBeGreaterThan(0);
    // Empty sections array fails length check → general fallback path
    expect(chunks[0].metadata?.chunkType).toBe("text");
  });

  // ---------------------------------------------------------------
  // XLSX path
  // ---------------------------------------------------------------
  test("XLSX sheets produce table chunks with sheetName", () => {
    const extraction: any = {
      sourceType: "xlsx",
      text: "Revenue data",
      wordCount: 2,
      confidence: 1,
      sheetCount: 1,
      sheets: [
        {
          sheetName: "Q1 Revenue",
          textContent: "Revenue data for Q1 2024",
          isFinancial: true,
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    expect(chunks.length).toBe(1);
    expect(chunks[0].metadata?.sheetName).toBe("Q1 Revenue");
    expect(chunks[0].metadata?.chunkType).toBe("table");
    expect(chunks[0].metadata?.isFinancial).toBe(true);
    expect(chunks[0].metadata?.sourceType).toBe("xlsx");
  });

  test("XLSX cellFacts produce grouped-by-row chunks", () => {
    const extraction: any = {
      sourceType: "xlsx",
      text: "Revenue 100 200",
      wordCount: 3,
      confidence: 1,
      sheetCount: 1,
      sheets: [{ sheetName: "Sheet1", textContent: "" }],
      cellFacts: [
        {
          sheet: "Sheet1",
          cell: "B2",
          rowLabel: "Revenue",
          colHeader: "Jan",
          value: "100",
          displayValue: "100",
        },
        {
          sheet: "Sheet1",
          cell: "C2",
          rowLabel: "Revenue",
          colHeader: "Feb",
          value: "200",
          displayValue: "200",
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const cellFactChunks = chunks.filter(
      (c) => c.metadata?.chunkType === "cell_fact",
    );

    // 2 cell-centric chunks + 1 row-aggregate chunk
    expect(cellFactChunks.length).toBe(3);

    const cellCentric = cellFactChunks.filter(
      (c) => c.metadata?.tableChunkForm === "cell_centric",
    );
    expect(cellCentric.length).toBe(2);
    expect(cellCentric[0].content).toContain("Revenue / Jan = 100");
    expect(cellCentric[0].metadata?.rowIndex).toBe(2);
    expect(cellCentric[0].metadata?.columnIndex).toBe(2);
    expect(cellCentric[0].metadata?.headerPath).toEqual(["Revenue", "Jan"]);

    const rowAggregate = cellFactChunks.find(
      (c) => c.metadata?.tableChunkForm === "row_aggregate",
    );
    expect(rowAggregate).toBeDefined();
    expect(rowAggregate!.content).toContain("Revenue:");
    expect(rowAggregate!.content).toContain("Jan: 100");
    expect(rowAggregate!.content).toContain("Feb: 200");
    expect(rowAggregate!.metadata?.rowLabel).toBe("Revenue");
    expect(rowAggregate!.metadata?.sheetName).toBe("Sheet1");
  });

  test("XLSX cell-centric chunks normalize unit metadata", () => {
    const extraction: any = {
      sourceType: "xlsx",
      text: "Revenue",
      wordCount: 1,
      confidence: 1,
      sheetCount: 1,
      sheets: [{ sheetName: "Sheet1", textContent: "" }],
      cellFacts: [
        {
          sheet: "Sheet1",
          cell: "C10",
          rowLabel: "Total Revenue",
          colHeader: "Amount (USD)",
          value: "$1,250.50",
          displayValue: "$1,250.50",
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const cellCentric = chunks.find(
      (c) => c.metadata?.tableChunkForm === "cell_centric",
    );

    expect(cellCentric).toBeDefined();
    expect(cellCentric!.metadata?.unitNormalized).toBe("currency_usd");
    expect(cellCentric!.metadata?.unitRaw).toBe("$");
    expect(cellCentric!.metadata?.numericValue).toBeCloseTo(1250.5);
    expect(cellCentric!.metadata?.rowIndex).toBe(10);
    expect(cellCentric!.metadata?.columnIndex).toBe(3);
  });

  // ---------------------------------------------------------------
  // PPTX path
  // ---------------------------------------------------------------
  test("PPTX slides produce heading, text, and notes chunks", () => {
    const extraction: any = {
      sourceType: "pptx",
      text: "Overview\nSlide body content\nNotes: Speaker notes here",
      wordCount: 8,
      confidence: 1,
      slideCount: 1,
      slides: [
        {
          slide: 1,
          title: "Overview",
          text: "Slide body content",
          notes: "Speaker notes here",
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    const heading = chunks.find((c) => c.metadata?.chunkType === "heading");
    expect(heading).toBeDefined();
    expect(heading!.content).toBe("Overview");
    expect(heading!.metadata?.slideTitle).toBe("Overview");
    expect(heading!.metadata?.sourceType).toBe("pptx");

    const body = chunks.find(
      (c) => c.metadata?.chunkType === "text" && c.content.includes("body"),
    );
    expect(body).toBeDefined();
    expect(body!.metadata?.slideTitle).toBe("Overview");

    const notes = chunks.find((c) => c.metadata?.chunkType === "notes");
    expect(notes).toBeDefined();
    expect(notes!.metadata?.hasNotes).toBe(true);
  });

  // ---------------------------------------------------------------
  // Fallback path
  // ---------------------------------------------------------------
  test("Plain text fallback adds chunkType and sourceType metadata", () => {
    const extraction: any = {
      sourceType: "text",
      text: "Just plain text content.",
      wordCount: 5,
      confidence: 1,
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    expect(chunks.length).toBe(1);
    expect(chunks[0].metadata?.chunkType).toBe("text");
    expect(chunks[0].metadata?.sourceType).toBe("text");
  });

  // ---------------------------------------------------------------
  // Backward compatibility
  // ---------------------------------------------------------------
  test("chunks always have chunkIndex and content", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "Some text",
      wordCount: 2,
      confidence: 1,
      pageCount: 1,
      pages: [{ page: 1, text: "Some text" }],
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    for (const chunk of chunks) {
      expect(typeof chunk.chunkIndex).toBe("number");
      expect(typeof chunk.content).toBe("string");
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });
});
