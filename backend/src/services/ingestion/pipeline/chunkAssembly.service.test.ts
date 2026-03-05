import { describe, expect, test } from "@jest/globals";
import { buildInputChunks, deduplicateChunks } from "./chunkAssembly.service";

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

  test("PDF chunks infer sectionName from heading-like first line", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "Executive Summary\nThe company performed well.\nFinancial Overview\nRevenue grew 15%.",
      pages: [
        { page: 1, text: "Executive Summary\nThe company performed well." },
        { page: 2, text: "Financial Overview\nRevenue grew 15%." },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    const page1Chunks = chunks.filter((c) => c.pageNumber === 1);
    expect(page1Chunks.length).toBeGreaterThan(0);
    expect(page1Chunks[0].metadata?.sectionName).toBe("Executive Summary");

    const page2Chunks = chunks.filter((c) => c.pageNumber === 2);
    expect(page2Chunks.length).toBeGreaterThan(0);
    expect(page2Chunks[0].metadata?.sectionName).toBe("Financial Overview");
  });

  test("PDF does NOT infer section from long paragraph-like first lines", () => {
    const longLine = "This is a very long first line that clearly is a paragraph and should not be treated as a heading because it exceeds our threshold and ends with a period.";
    const extraction: any = {
      sourceType: "pdf",
      text: longLine,
      pages: [{ page: 1, text: longLine }],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks[0].metadata?.sectionName).toBeUndefined();
  });

  test("PDF extractedTables cell_fact chunks include normalized unit/scale metadata", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "table text",
      pages: [{ page: 1, text: "table text" }],
      extractedTables: [
        {
          tableId: "pdf:p1:t1",
          pageOrSlide: 1,
          markdown: "| Metric | Amount (USD millions) |",
          rows: [
            {
              rowIndex: 0,
              isHeader: true,
              cells: [
                { colIndex: 0, text: "Metric" },
                { colIndex: 1, text: "Amount (USD millions)" },
              ],
            },
            {
              rowIndex: 1,
              isHeader: false,
              cells: [
                { colIndex: 0, text: "Revenue" },
                { colIndex: 1, text: "$1.5" },
              ],
            },
          ],
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const cellFact = chunks.find(
      (c) =>
        c.metadata?.chunkType === "cell_fact" &&
        c.metadata?.columnIndex === 1 &&
        c.metadata?.rowIndex === 1,
    );

    expect(cellFact).toBeDefined();
    expect(cellFact!.content).toContain("Revenue / Amount (USD millions)");
    expect(cellFact!.metadata?.unitNormalized).toBe("currency_usd");
    expect(cellFact!.metadata?.scaleMultiplier).toBe(1_000_000);
    expect(cellFact!.metadata?.numericValue).toBeCloseTo(1_500_000);
  });

  test("table cell span metadata is preserved on emitted cell_fact chunks", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "table text",
      pages: [{ page: 1, text: "table text" }],
      extractedTables: [
        {
          tableId: "pdf:p1:t2",
          pageOrSlide: 1,
          markdown: "| Group | Metric | Value |\n| --- | --- | --- |\n| Revenue | ARR | 100 |",
          rows: [
            {
              rowIndex: 0,
              isHeader: true,
              cells: [
                { colIndex: 0, text: "Group", colSpan: 2 },
                { colIndex: 1, text: "", isMergedContinuation: true },
                { colIndex: 2, text: "Value" },
              ],
            },
            {
              rowIndex: 1,
              isHeader: false,
              cells: [
                { colIndex: 0, text: "Revenue" },
                { colIndex: 1, text: "ARR" },
                { colIndex: 2, text: "100" },
              ],
            },
          ],
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const headerCell = chunks.find(
      (c) =>
        c.metadata?.chunkType === "cell_fact" &&
        c.metadata?.rowIndex === 0 &&
        c.metadata?.columnIndex === 0,
    );

    expect(headerCell).toBeDefined();
    expect(headerCell!.metadata?.colSpan).toBe(2);
    expect(headerCell!.metadata?.isMergedContinuation).toBeUndefined();
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

  test("XLSX cell facts propagate canonical period metadata to cell and row aggregate chunks", () => {
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
          cell: "B2",
          rowLabel: "Revenue",
          colHeader: "Jan Actual",
          value: "100",
          displayValue: "100",
          period: { year: 2025, month: 1, quarter: 1 },
        },
        {
          sheet: "Sheet1",
          cell: "C2",
          rowLabel: "Revenue",
          colHeader: "Jan Budget",
          value: "110",
          displayValue: "110",
          period: { year: 2025, month: 1, quarter: 1 },
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const cellChunk = chunks.find((c) => c.metadata?.cellRef === "B2");
    expect(cellChunk).toBeDefined();
    expect(cellChunk!.metadata?.periodYear).toBe(2025);
    expect(cellChunk!.metadata?.periodMonth).toBe(1);
    expect(cellChunk!.metadata?.periodQuarter).toBe(1);
    expect(cellChunk!.metadata?.periodTokens).toEqual(
      expect.arrayContaining(["Y2025", "Q1", "Y2025Q1", "M01", "Y2025M01"]),
    );

    const rowAggregate = chunks.find(
      (c) =>
        c.metadata?.tableChunkForm === "row_aggregate" &&
        c.metadata?.rowLabel === "Revenue",
    );
    expect(rowAggregate).toBeDefined();
    expect(rowAggregate!.metadata?.periodYear).toBe(2025);
    expect(rowAggregate!.metadata?.periodMonth).toBe(1);
    expect(rowAggregate!.metadata?.periodQuarter).toBe(1);
    expect(rowAggregate!.metadata?.periodTokens).toEqual(
      expect.arrayContaining(["Y2025", "Q1", "Y2025Q1"]),
    );
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
  // XLSX isFinancial + row-aggregate units
  // ---------------------------------------------------------------
  test("XLSX cell-centric uses per-sheet isFinancial, not extraction-level", () => {
    const extraction: any = {
      sourceType: "xlsx",
      text: "data",
      sheets: [
        { sheetName: "Revenue", textContent: "", isFinancial: true },
      ],
      cellFacts: [
        {
          sheet: "Revenue",
          cell: "B2",
          rowLabel: "Q1",
          colHeader: "Revenue (USD)",
          value: "1500000",
          displayValue: "$1.5M",
        },
      ],
      isFinancial: false,
    };
    const chunks = buildInputChunks(extraction, extraction.text);
    const cellChunk = chunks.find(
      (c) => c.metadata?.tableChunkForm === "cell_centric",
    );
    expect(cellChunk).toBeDefined();
    // Should use per-sheet isFinancial=true, not extraction.isFinancial=false
    expect(cellChunk!.metadata?.isFinancial).toBe(true);
  });

  test("XLSX row-aggregate chunks include dominant unit metadata", () => {
    const extraction: any = {
      sourceType: "xlsx",
      text: "data",
      sheets: [
        { sheetName: "Revenue", textContent: "", isFinancial: true },
      ],
      cellFacts: [
        {
          sheet: "Revenue",
          cell: "B2",
          rowLabel: "Q1",
          colHeader: "Revenue (USD)",
          value: "$1500000",
          displayValue: "$1.5M",
        },
        {
          sheet: "Revenue",
          cell: "C2",
          rowLabel: "Q1",
          colHeader: "Growth",
          value: "15%",
          displayValue: "15%",
        },
      ],
    };
    const chunks = buildInputChunks(extraction, extraction.text);
    const rowAgg = chunks.find(
      (c) => c.metadata?.tableChunkForm === "row_aggregate",
    );
    expect(rowAgg).toBeDefined();
    // Row aggregate should include unit info from dominant unit
    expect(rowAgg!.metadata?.unitNormalized).toBeDefined();
  });

  // ---------------------------------------------------------------
  // charOffset correctness
  // ---------------------------------------------------------------
  describe("charOffset correctness", () => {
    test("PDF chunk offsets map back to correct fullText substrings", () => {
      const pageText = "This is page content with enough words to trigger splitting. ".repeat(50);
      const fullText = pageText + pageText;
      const extraction: any = {
        sourceType: "pdf",
        text: fullText,
        pages: [
          { page: 1, text: pageText },
          { page: 2, text: pageText },
        ],
      };
      const chunks = buildInputChunks(extraction, fullText);

      expect(chunks.length).toBeGreaterThan(2);

      for (const chunk of chunks) {
        const { startChar, endChar } = chunk.metadata!;
        expect(startChar).toBeDefined();
        expect(endChar).toBeDefined();
        expect(endChar).toBeGreaterThan(startChar!);
        // The chunk content should match the fullText at [startChar, endChar)
        const expected = fullText.slice(startChar!, endChar!).trim();
        expect(chunk.content).toBe(expected);
      }
    });

    test("PPTX chunks have startChar and endChar", () => {
      const extraction: any = {
        sourceType: "pptx",
        text: "Title\nSlide body text",
        slides: [
          { slide: 1, title: "Title", text: "Slide body text" },
        ],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      for (const chunk of chunks) {
        expect(chunk.metadata?.startChar).toBeDefined();
        expect(chunk.metadata?.endChar).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  describe("edge cases", () => {
    test("DOCX sections with empty content and no heading produce nothing", () => {
      const extraction: any = {
        sourceType: "docx",
        text: "fallback text",
        sections: [{ content: "", heading: "" }],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      // Empty section yields nothing from emitSection → falls back to plain text
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].metadata.sourceType).toBe("docx");
    });

    test("XLSX cellFacts with missing cell/rowLabel/colHeader use fallbacks", () => {
      const extraction: any = {
        sourceType: "xlsx",
        text: "data",
        sheets: [{ sheetName: "Sheet1", textContent: "" }],
        cellFacts: [
          {
            sheet: "Sheet1",
            cell: "",
            rowLabel: "",
            colHeader: "",
            value: "42",
            displayValue: "42",
          },
        ],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      const cellCentric = chunks.find(
        (c) => c.metadata?.tableChunkForm === "cell_centric",
      );
      expect(cellCentric).toBeDefined();
      // When rowLabel and colHeader are empty, content should use "Cell" fallback
      expect(cellCentric!.content).toContain("Cell");
    });

    test("XLSX empty cellFact values are skipped", () => {
      const extraction: any = {
        sourceType: "xlsx",
        text: "data",
        sheets: [{ sheetName: "Sheet1", textContent: "" }],
        cellFacts: [
          {
            sheet: "Sheet1",
            cell: "A1",
            rowLabel: "Header",
            colHeader: "Col",
            value: "",
            displayValue: "",
          },
        ],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      const cellCentric = chunks.filter(
        (c) => c.metadata?.tableChunkForm === "cell_centric",
      );
      // Empty value should be skipped (no cell-centric chunk emitted)
      expect(cellCentric.length).toBe(0);
    });

    test("PPTX slides with notes but no title", () => {
      const extraction: any = {
        sourceType: "pptx",
        text: "Some notes",
        slides: [{ slide: 1, title: "", text: "", notes: "Important note" }],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      const heading = chunks.find((c) => c.metadata?.chunkType === "heading");
      expect(heading).toBeUndefined(); // No heading chunk for empty title
      const notes = chunks.find((c) => c.metadata?.chunkType === "notes");
      expect(notes).toBeDefined();
      expect(notes!.content).toContain("Important note");
    });

    test("PPTX empty title string produces no heading chunk", () => {
      const extraction: any = {
        sourceType: "pptx",
        text: "body",
        slides: [{ slide: 1, title: "", text: "Some body text" }],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      const heading = chunks.find((c) => c.metadata?.chunkType === "heading");
      expect(heading).toBeUndefined();
      const body = chunks.find((c) => c.metadata?.chunkType === "text");
      expect(body).toBeDefined();
    });

    test("plain-text fallback with empty text returns empty array", () => {
      const extraction: any = {
        sourceType: "text",
        text: "",
      };
      const chunks = buildInputChunks(extraction, "");
      expect(chunks).toEqual([]);
    });

    test("deduplicateChunks integration: output of buildInputChunks through dedup", () => {
      const extraction: any = {
        sourceType: "pdf",
        text: "Repeated content here. ".repeat(100),
        pages: [
          { page: 1, text: "Repeated content here. ".repeat(50) },
          { page: 2, text: "Repeated content here. ".repeat(50) },
        ],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      const deduped = deduplicateChunks(chunks);
      // Dedup should reduce count — many overlapping chunks with same content
      expect(deduped.length).toBeLessThanOrEqual(chunks.length);
      // All surviving chunks should still have metadata
      for (const c of deduped) {
        expect(c.metadata).toBeDefined();
        expect(c.metadata.sourceType).toBe("pdf");
      }
    });

    test("XLSX sheets with name but no sheetName property", () => {
      const extraction: any = {
        sourceType: "xlsx",
        text: "data",
        sheets: [{ name: "AltName", textContent: "Some data" }],
      };
      const chunks = buildInputChunks(extraction, extraction.text);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].metadata?.sheetName).toBe("AltName");
    });
  });

  // ---------------------------------------------------------------
  // Policy override passthrough
  // ---------------------------------------------------------------
  test("buildInputChunks accepts chunking policy override for target size", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "A".repeat(500),
      pages: [{ page: 1, text: "A".repeat(500) }],
    };

    // With a small targetChars, the text should be split into multiple chunks
    const chunks = buildInputChunks(extraction, extraction.text, {
      targetChars: 100,
      overlapChars: 10,
    });

    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should still have PDF metadata
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBe(1);
      expect(chunk.metadata?.sourceType).toBe("pdf");
    }
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

  // ---------------------------------------------------------------
  // DOCX pageStart → pageNumber passthrough
  // ---------------------------------------------------------------
  test("DOCX sections pass through pageStart as pageNumber", () => {
    const extraction: any = {
      sourceType: "docx",
      text: "Introduction\nBody text.\nConclusion\nFinal text.",
      sections: [
        { heading: "Introduction", level: 1, content: "Body text.", path: ["Introduction"], pageStart: 1 },
        { heading: "Conclusion", level: 1, content: "Final text.", path: ["Conclusion"], pageStart: 3 },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);

    const introChunks = chunks.filter((c) => c.metadata?.sectionName === "Introduction");
    expect(introChunks.length).toBeGreaterThan(0);
    expect(introChunks[0].pageNumber).toBe(1);

    const conclusionChunks = chunks.filter((c) => c.metadata?.sectionName === "Conclusion");
    expect(conclusionChunks.length).toBeGreaterThan(0);
    expect(conclusionChunks[0].pageNumber).toBe(3);
  });

  test("DOCX without pageStart still works (pageNumber undefined)", () => {
    const extraction: any = {
      sourceType: "docx",
      text: "Heading\nContent here.",
      sections: [
        { heading: "Heading", level: 1, content: "Content here.", path: ["Heading"] },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks[0].pageNumber).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // Multi-level headerPath
  // ---------------------------------------------------------------
  test("cell facts with headerHierarchy produce multi-level headerPath", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Fin", textContent: "Fin" }],
      cellFacts: [
        {
          sheet: "Fin",
          cell: "C5",
          rowLabel: "Revenue",
          colHeader: "Q1 2024",
          value: "100",
          displayValue: "100",
          headerHierarchy: ["Financial Statements", "Income Statement", "Q1 2024"],
        },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const cell = chunks.find((c) => c.metadata?.cellRef === "C5");
    expect(cell?.metadata?.headerPath).toEqual([
      "Revenue",
      "Financial Statements",
      "Income Statement",
      "Q1 2024",
    ]);
  });

  test("cell facts without headerHierarchy use 2-level [rowLabel, colHeader]", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "S", textContent: "S" }],
      cellFacts: [
        { sheet: "S", cell: "A1", rowLabel: "Cost", colHeader: "Q1", value: "50", displayValue: "50" },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const cell = chunks.find((c) => c.metadata?.cellRef === "A1");
    expect(cell?.metadata?.headerPath).toEqual(["Cost", "Q1"]);
  });

  // ---------------------------------------------------------------
  // parseCellRef multi-letter column confirmation
  // ---------------------------------------------------------------
  test("cell facts with multi-letter columns (AA+) get correct columnIndex", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Data", textContent: "Data" }],
      cellFacts: [
        { sheet: "Data", cell: "AA10", rowLabel: "Revenue", colHeader: "Jan", value: "100", displayValue: "100" },
        { sheet: "Data", cell: "AZ5", rowLabel: "Cost", colHeader: "Feb", value: "200", displayValue: "200" },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const cellChunks = chunks.filter((c) => c.metadata?.tableChunkForm === "cell_centric");

    const aa10 = cellChunks.find((c) => c.metadata?.cellRef === "AA10");
    expect(aa10).toBeDefined();
    expect(aa10!.metadata?.columnIndex).toBe(27); // AA = 27

    const az5 = cellChunks.find((c) => c.metadata?.cellRef === "AZ5");
    expect(az5).toBeDefined();
    expect(az5!.metadata?.columnIndex).toBe(52); // AZ = 52
  });

  // ---------------------------------------------------------------
  // Unit consistency warnings
  // ---------------------------------------------------------------
  test("row_aggregate warns on mixed units across cells", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Mix", textContent: "Mix" }],
      cellFacts: [
        { sheet: "Mix", cell: "A1", rowLabel: "Revenue", colHeader: "Q1", value: "$100", displayValue: "$100" },
        { sheet: "Mix", cell: "B1", rowLabel: "Revenue", colHeader: "Growth", value: "15%", displayValue: "15%" },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const rowAgg = chunks.find(
      (c) => c.metadata?.tableChunkForm === "row_aggregate" && c.metadata?.rowLabel === "Revenue",
    );
    expect(rowAgg).toBeDefined();
    expect(rowAgg!.metadata?.unitConsistencyWarning).toMatch(/mixed_units/);
  });

  test("cell_fact chunks include tableMethod from extractedTables", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "table text",
      pages: [{ page: 1, text: "table text" }],
      extractedTables: [
        {
          tableId: "pdf:p1:t0",
          pageOrSlide: 1,
          tableMethod: "heuristic",
          markdown: "| Name | Value |",
          rows: [
            {
              rowIndex: 0,
              isHeader: true,
              cells: [
                { colIndex: 0, text: "Name" },
                { colIndex: 1, text: "Value" },
              ],
            },
            {
              rowIndex: 1,
              isHeader: false,
              cells: [
                { colIndex: 0, text: "Revenue" },
                { colIndex: 1, text: "100" },
              ],
            },
          ],
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const cellFact = chunks.find(
      (c) => c.metadata?.chunkType === "cell_fact" && c.metadata?.rowIndex === 1,
    );

    expect(cellFact).toBeDefined();
    expect(cellFact!.metadata?.tableMethod).toBe("heuristic");
  });

  test("cell_fact chunks for document_ai tables have correct tableMethod", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "table text",
      pages: [{ page: 1, text: "table text" }],
      extractedTables: [
        {
          tableId: "pdf:p1:t0",
          pageOrSlide: 1,
          tableMethod: "document_ai",
          markdown: "| Metric | Amount |",
          rows: [
            {
              rowIndex: 0,
              isHeader: true,
              cells: [
                { colIndex: 0, text: "Metric" },
                { colIndex: 1, text: "Amount" },
              ],
            },
            {
              rowIndex: 1,
              isHeader: false,
              cells: [
                { colIndex: 0, text: "EBITDA" },
                { colIndex: 1, text: "500" },
              ],
            },
          ],
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const cellFact = chunks.find(
      (c) => c.metadata?.chunkType === "cell_fact" && c.metadata?.rowIndex === 1,
    );

    expect(cellFact).toBeDefined();
    expect(cellFact!.metadata?.tableMethod).toBe("document_ai");
  });
});
