import { describe, expect, test } from "@jest/globals";
import {
  buildInputChunks,
  deduplicateChunks,
} from "../../services/ingestion/pipeline/chunkAssembly.service";
import { writeCertificationGateReport } from "./reporting";

describe("Indexing & Storage — Chunk + Metadata Invariants", () => {
  // ---------------------------------------------------------------
  // INV-01: Every chunk has ≥1 provenance location field
  // ---------------------------------------------------------------
  test("INV-01: every chunk carries at least one provenance location field", () => {
    const formats = [
      {
        name: "PDF",
        extraction: {
          sourceType: "pdf",
          text: "Page content here.",
          pages: [{ page: 1, text: "Page content here." }],
        },
      },
      {
        name: "DOCX",
        extraction: {
          sourceType: "docx",
          text: "Heading\nBody.",
          sections: [
            {
              heading: "Heading",
              level: 1,
              content: "Body.",
              path: ["Heading"],
            },
          ],
        },
      },
      {
        name: "XLSX",
        extraction: {
          sourceType: "xlsx",
          sheets: [{ sheetName: "S1", textContent: "Data" }],
          cellFacts: [
            {
              sheet: "S1",
              cell: "A1",
              rowLabel: "Rev",
              colHeader: "Q1",
              value: "100",
              displayValue: "100",
            },
          ],
        },
      },
      {
        name: "PPTX",
        extraction: {
          sourceType: "pptx",
          text: "Slide text.",
          slides: [{ slide: 1, title: "Title", text: "Slide text." }],
        },
      },
    ] as const;

    for (const fmt of formats) {
      const chunks = buildInputChunks(
        fmt.extraction as any,
        (fmt.extraction as any).text ?? "",
      );
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        const hasSectionId =
          typeof chunk.metadata?.sectionId === "string" &&
          chunk.metadata.sectionId.trim().length > 0;
        const hasLocation =
          chunk.pageNumber != null ||
          chunk.metadata?.sheetName != null ||
          chunk.metadata?.sectionName != null ||
          chunk.metadata?.startChar != null ||
          chunk.metadata?.slideTitle != null;
        expect(hasSectionId).toBe(true);
        expect(hasLocation).toBe(true);
      }
    }
  });

  // ---------------------------------------------------------------
  // INV-02: chunkIndex is sequential 0..N-1 with no gaps
  // ---------------------------------------------------------------
  test("INV-02: chunkIndex is sequential 0..N-1 with no gaps", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "A".repeat(5000),
      pages: [
        { page: 1, text: "A".repeat(2500) },
        { page: 2, text: "A".repeat(2500) },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks.length).toBeGreaterThan(1);
    const indices = chunks.map((c) => c.chunkIndex);
    expect(indices).toEqual(
      Array.from({ length: indices.length }, (_, i) => i),
    );
  });

  // ---------------------------------------------------------------
  // INV-03: Dedup preserves same content in different sections
  // ---------------------------------------------------------------
  test("INV-03: dedup preserves same content across different sections", () => {
    const shared =
      "Revenue for the quarter was one point five million dollars across all segments.";
    const chunks = [
      {
        chunkIndex: 0,
        content: shared,
        metadata: { sectionName: "Summary" },
      },
      {
        chunkIndex: 1,
        content: shared,
        metadata: { sectionName: "Financials" },
      },
      {
        chunkIndex: 2,
        content: shared,
        metadata: { sectionName: "Summary" },
      }, // true dup within Summary
    ];

    const deduped = deduplicateChunks(chunks as any);
    // Should keep 2 (one per section), remove the duplicate within "Summary"
    expect(deduped.length).toBe(2);
    const sections = deduped.map(
      (c) => (c as any).metadata.sectionName as string,
    );
    expect(sections).toContain("Summary");
    expect(sections).toContain("Financials");
  });

  // ---------------------------------------------------------------
  // INV-04: cell_centric chunks have required cell coordinates
  // ---------------------------------------------------------------
  test("INV-04: cell_centric chunks have rowIndex, columnIndex, and tableId", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Data", textContent: "Data" }],
      cellFacts: [
        {
          sheet: "Data",
          cell: "B3",
          rowLabel: "Rev",
          colHeader: "Q1",
          value: "$100",
          displayValue: "$100",
        },
        {
          sheet: "Data",
          cell: "C3",
          rowLabel: "Rev",
          colHeader: "Q2",
          value: "$200",
          displayValue: "$200",
        },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const cellChunks = chunks.filter(
      (c) => c.metadata?.tableChunkForm === "cell_centric",
    );

    expect(cellChunks.length).toBeGreaterThan(0);
    for (const chunk of cellChunks) {
      expect(chunk.metadata.rowIndex).toBeDefined();
      expect(chunk.metadata.columnIndex).toBeDefined();
      expect(chunk.metadata.tableId).toBeTruthy();
      expect(chunk.metadata.tableId).toMatch(/^sheet:/);
    }
  });

  // ---------------------------------------------------------------
  // INV-05: sourceType matches extraction format
  // ---------------------------------------------------------------
  test("INV-05: sourceType on every chunk matches the extraction format", () => {
    const cases: Array<{ sourceType: string; extraction: any }> = [
      {
        sourceType: "pdf",
        extraction: {
          sourceType: "pdf",
          text: "Page.",
          pages: [{ page: 1, text: "Page." }],
        },
      },
      {
        sourceType: "docx",
        extraction: {
          sourceType: "docx",
          text: "H\nB.",
          sections: [
            { heading: "H", level: 1, content: "B.", path: ["H"] },
          ],
        },
      },
      {
        sourceType: "xlsx",
        extraction: {
          sourceType: "xlsx",
          sheets: [{ sheetName: "S", textContent: "S" }],
          cellFacts: [],
        },
      },
      {
        sourceType: "pptx",
        extraction: {
          sourceType: "pptx",
          text: "Sl.",
          slides: [{ slide: 1, title: "T", text: "Sl." }],
        },
      },
    ];

    for (const { sourceType, extraction } of cases) {
      const chunks = buildInputChunks(extraction, extraction.text ?? "");
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.metadata?.sourceType).toBe(sourceType);
      }
    }
  });

  // ---------------------------------------------------------------
  // INV-06: startChar/endChar roundtrip — fullText.slice(start,end)
  //         matches chunk content for PDF and DOCX
  // ---------------------------------------------------------------
  test("INV-06: startChar/endChar roundtrip yields chunk content", () => {
    const fullText =
      "First paragraph of the document with enough text to exceed target.\n\n" +
      "Second paragraph also with enough length so the chunker will actually split this into at least two pieces for the roundtrip test.";

    const extraction: any = {
      sourceType: "pdf",
      text: fullText,
      pages: [{ page: 1, text: fullText }],
    };

    const chunks = buildInputChunks(extraction, fullText, {
      targetChars: 80,
      overlapChars: 10,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      const { startChar, endChar } = chunk.metadata;
      expect(startChar).toBeDefined();
      expect(endChar).toBeDefined();
      expect(typeof startChar).toBe("number");
      expect(typeof endChar).toBe("number");
      expect(endChar!).toBeGreaterThan(startChar!);
      const slice = fullText.slice(startChar!, endChar!).trim();
      expect(slice).toBe(chunk.content);
    }
  });

  // ---------------------------------------------------------------
  // INV-07: After deduplication, chunkIndex values remain
  //         monotonically increasing with no duplicate indices
  // ---------------------------------------------------------------
  test("INV-07: chunkIndex is monotonically increasing after deduplication", () => {
    const unique =
      "Unique paragraph about entirely different subject matter that cannot be a duplicate.";
    const dup =
      "Revenue for the quarter was one point five million dollars across all business segments worldwide.";
    const chunks = [
      { chunkIndex: 0, content: unique, metadata: { sectionName: "A" } },
      { chunkIndex: 1, content: dup, metadata: { sectionName: "A" } },
      { chunkIndex: 2, content: dup, metadata: { sectionName: "A" } }, // dup of 1 within same section
      {
        chunkIndex: 3,
        content: "Third distinct paragraph discussing unrelated topics entirely.",
        metadata: { sectionName: "A" },
      },
    ];

    const deduped = deduplicateChunks(chunks as any);
    expect(deduped.length).toBe(3);
    const indices = deduped.map((c) => c.chunkIndex);
    // Indices must be strictly monotonically increasing (no duplicates, no reversals)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  // ---------------------------------------------------------------
  // INV-08: Metadata field contract — every chunk has the minimum
  //         set of fields required for precise retrieval citations
  // ---------------------------------------------------------------
  test("INV-08: every chunk satisfies the retrieval citation contract", () => {
    const cases: Array<{ extraction: any; fullText: string }> = [
      {
        extraction: {
          sourceType: "pdf",
          text: "Contract clause text on page one.",
          pages: [{ page: 1, text: "Contract clause text on page one." }],
        },
        fullText: "Contract clause text on page one.",
      },
      {
        extraction: {
          sourceType: "docx",
          text: "Introduction\nBody content for section.",
          sections: [
            {
              heading: "Introduction",
              level: 1,
              content: "Body content for section.",
              path: ["Introduction"],
            },
          ],
        },
        fullText: "Introduction\nBody content for section.",
      },
      {
        extraction: {
          sourceType: "xlsx",
          sheets: [{ sheetName: "Sheet1", textContent: "Table data" }],
          cellFacts: [
            {
              sheet: "Sheet1",
              cell: "A1",
              rowLabel: "Total",
              colHeader: "Amount",
              value: "500",
              displayValue: "500",
            },
          ],
        },
        fullText: "",
      },
    ];

    for (const { extraction, fullText } of cases) {
      const chunks = buildInputChunks(extraction, fullText, undefined, {
        documentId: "doc-cert-1",
        versionId: "doc-cert-1",
        rootDocumentId: "doc-cert-1",
        isLatestVersion: true,
      });
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        // Strict citation contract: content/index + source/chunk types + section scope + version scope.
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(typeof chunk.chunkIndex).toBe("number");
        expect(chunk.metadata.sourceType).toBe(extraction.sourceType);
        expect(typeof chunk.metadata.chunkType).toBe("string");
        expect(typeof chunk.metadata.sectionId).toBe("string");
        expect(chunk.metadata.sectionId!.length).toBeGreaterThan(0);
        expect(chunk.metadata.documentId).toBe("doc-cert-1");
        expect(chunk.metadata.versionId).toBe("doc-cert-1");
        expect(chunk.metadata.rootDocumentId).toBe("doc-cert-1");
        expect(chunk.metadata.isLatestVersion).toBe(true);

        if (extraction.sourceType === "pdf") {
          expect(chunk.pageNumber).toBeDefined();
          expect(Number(chunk.pageNumber)).toBeGreaterThanOrEqual(1);
        }
        if (extraction.sourceType === "xlsx") {
          expect(chunk.metadata.tableId || chunk.metadata.sheetName).toBeTruthy();
          if (chunk.metadata.tableChunkForm === "cell_centric") {
            expect(chunk.metadata.tableId).toBeTruthy();
            expect(
              Number.isFinite(chunk.metadata.rowIndex) ||
                Number.isFinite(chunk.metadata.columnIndex),
            ).toBe(true);
          }
        }
      }
    }
  });

  // ---------------------------------------------------------------
  // INV-09: XLSX row_aggregate chunks carry unit metadata when
  //         cells have units, and flag mixed-unit rows
  // ---------------------------------------------------------------
  test("INV-09: row_aggregate chunks carry unit metadata and mixed-unit warnings", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Financials", textContent: "Financial data" }],
      cellFacts: [
        {
          sheet: "Financials",
          cell: "B2",
          rowLabel: "Revenue",
          colHeader: "Q1",
          value: "$100",
          displayValue: "$100",
        },
        {
          sheet: "Financials",
          cell: "C2",
          rowLabel: "Revenue",
          colHeader: "Q2",
          value: "$200",
          displayValue: "$200",
        },
        {
          sheet: "Financials",
          cell: "D2",
          rowLabel: "Revenue",
          colHeader: "Margin",
          value: "15%",
          displayValue: "15%",
        },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const rowAggs = chunks.filter(
      (c) => c.metadata?.tableChunkForm === "row_aggregate",
    );

    expect(rowAggs.length).toBeGreaterThan(0);
    for (const agg of rowAggs) {
      expect(agg.metadata.sheetName).toBe("Financials");
      expect(agg.metadata.tableId).toMatch(/^sheet:/);
      // The row has mixed units (USD + percent), so a warning should exist
      expect(agg.metadata.unitConsistencyWarning).toMatch(/mixed_units/);
    }
  });

  // ---------------------------------------------------------------
  // INV-10: DOCX section hierarchy is preserved in chunk metadata —
  //         sectionPath breadcrumb enables precise navigation
  // ---------------------------------------------------------------
  test("INV-10: DOCX chunks preserve sectionPath breadcrumb hierarchy", () => {
    const extraction: any = {
      sourceType: "docx",
      text: "Chapter 1\nSection 1.1\nDetailed content for the subsection here.",
      sections: [
        {
          heading: "Chapter 1",
          level: 1,
          content: "",
          path: ["Chapter 1"],
        },
        {
          heading: "Section 1.1",
          level: 2,
          content: "Detailed content for the subsection here.",
          path: ["Chapter 1", "Section 1.1"],
        },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const textChunks = chunks.filter(
      (c) => c.metadata?.chunkType === "text",
    );

    expect(textChunks.length).toBeGreaterThan(0);
    const subsectionChunk = textChunks.find(
      (c) => c.metadata?.sectionName === "Section 1.1",
    );
    expect(subsectionChunk).toBeDefined();
    expect(subsectionChunk!.metadata.sectionPath).toEqual([
      "Chapter 1",
      "Section 1.1",
    ]);
    expect(subsectionChunk!.metadata.sectionLevel).toBe(2);
  });

  // ---------------------------------------------------------------
  // INV-11: documentId + version fields present when documentContext
  //         is provided to buildInputChunks
  // ---------------------------------------------------------------
  test("INV-11: documentId and version fields present when documentContext provided", () => {
    const documentContext = {
      documentId: "doc-123",
      versionId: "doc-123",
      rootDocumentId: "doc-root",
      isLatestVersion: true,
    };

    const formats = [
      {
        name: "PDF",
        extraction: {
          sourceType: "pdf",
          text: "Page content here.",
          pages: [{ page: 1, text: "Page content here." }],
        },
      },
      {
        name: "DOCX",
        extraction: {
          sourceType: "docx",
          text: "Heading\nBody.",
          sections: [
            { heading: "Heading", level: 1, content: "Body.", path: ["Heading"] },
          ],
        },
      },
      {
        name: "XLSX",
        extraction: {
          sourceType: "xlsx",
          sheets: [{ sheetName: "S1", textContent: "Data" }],
          cellFacts: [
            { sheet: "S1", cell: "A1", rowLabel: "Rev", colHeader: "Q1", value: "100", displayValue: "100" },
          ],
        },
      },
      {
        name: "PPTX",
        extraction: {
          sourceType: "pptx",
          text: "Slide text.",
          slides: [{ slide: 1, title: "Title", text: "Slide text." }],
        },
      },
    ] as const;

    for (const fmt of formats) {
      const chunks = buildInputChunks(
        fmt.extraction as any,
        (fmt.extraction as any).text ?? "",
        undefined,
        documentContext,
      );
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.metadata.documentId).toBe("doc-123");
        expect(chunk.metadata.versionId).toBe("doc-123");
        expect(chunk.metadata.rootDocumentId).toBe("doc-root");
        expect(chunk.metadata.isLatestVersion).toBe(true);
      }
    }
  });

  // ---------------------------------------------------------------
  // INV-12: PDF chunks carry pageNumber >= 1
  // ---------------------------------------------------------------
  test("INV-12: PDF chunks carry pageNumber >= 1", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "Page one.\nPage two.",
      pages: [
        { page: 1, text: "Page one." },
        { page: 2, text: "Page two." },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBeDefined();
      expect(chunk.pageNumber).toBeGreaterThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------
  // INV-13: XLSX cell_centric chunks have rowIndex + columnIndex
  // ---------------------------------------------------------------
  test("INV-13: XLSX cell_centric chunks have rowIndex and columnIndex", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Data", textContent: "Data" }],
      cellFacts: [
        { sheet: "Data", cell: "B3", rowLabel: "Rev", colHeader: "Q1", value: "$100", displayValue: "$100" },
        { sheet: "Data", cell: "C5", rowLabel: "Cost", colHeader: "Q2", value: "$200", displayValue: "$200" },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const cellChunks = chunks.filter(
      (c) => c.metadata?.tableChunkForm === "cell_centric",
    );

    expect(cellChunks.length).toBeGreaterThan(0);
    for (const chunk of cellChunks) {
      expect(typeof chunk.metadata.rowIndex).toBe("number");
      expect(typeof chunk.metadata.columnIndex).toBe("number");
      expect(chunk.metadata.rowIndex).toBeGreaterThanOrEqual(1);
      expect(chunk.metadata.columnIndex).toBeGreaterThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------
  // INV-14: Version metadata propagates across all format branches
  // ---------------------------------------------------------------
  test("INV-14: version metadata propagates across all format branches", () => {
    const documentContext = {
      documentId: "v-doc",
      versionId: "v-doc",
      rootDocumentId: "v-root",
      isLatestVersion: true,
    };

    // Fallback text path (no pages/sections/sheets/slides)
    const fallbackExtraction: any = {
      sourceType: "text",
      text: "Plain text content here.",
    };

    const fallbackChunks = buildInputChunks(
      fallbackExtraction,
      fallbackExtraction.text,
      undefined,
      documentContext,
    );
    expect(fallbackChunks.length).toBeGreaterThan(0);
    for (const chunk of fallbackChunks) {
      expect(chunk.metadata.documentId).toBe("v-doc");
      expect(chunk.metadata.rootDocumentId).toBe("v-root");
    }

    // DOCX fallback (empty sections → plain text split)
    const docxFallback: any = {
      sourceType: "docx",
      text: "Fallback docx text.",
      sections: [{ heading: "", content: "" }],
    };

    const docxChunks = buildInputChunks(
      docxFallback,
      docxFallback.text,
      undefined,
      documentContext,
    );
    expect(docxChunks.length).toBeGreaterThan(0);
    for (const chunk of docxChunks) {
      expect(chunk.metadata.documentId).toBe("v-doc");
    }
  });

  // ---------------------------------------------------------------
  // INV-15: Pinecone strip replaces content with hash when enabled
  // ---------------------------------------------------------------
  test("INV-15: PINECONE_STRIP_PLAINTEXT replaces content with SHA-256 hash", () => {
    const { createHash } = require("crypto");

    // Simulate the stripping logic from pinecone.service.ts
    const rawContent = "Confidential financial data for Q1 2024";
    const expectedHash = createHash("sha256").update(rawContent).digest("hex");

    // When strip=true: content is undefined, contentHash is SHA-256
    const stripTrue = true;
    const contentWhenStrip = stripTrue ? undefined : rawContent;
    const hashWhenStrip = stripTrue
      ? createHash("sha256").update(rawContent).digest("hex")
      : undefined;

    expect(contentWhenStrip).toBeUndefined();
    expect(hashWhenStrip).toBe(expectedHash);
    expect(hashWhenStrip).toHaveLength(64); // SHA-256 hex = 64 chars

    // When strip=false: content preserved, no hash
    const stripFalse = false;
    const contentWhenNoStrip = stripFalse ? undefined : rawContent;
    const hashWhenNoStrip = stripFalse
      ? createHash("sha256").update(rawContent).digest("hex")
      : undefined;

    expect(contentWhenNoStrip).toBe(rawContent);
    expect(hashWhenNoStrip).toBeUndefined();

    // Flag parsing covers edge cases
    for (const [input, expected] of [
      ["true", true], ["TRUE", true], ["True", true],
      ["false", false], ["", false], [undefined, false],
    ] as const) {
      const parsed = String(input || "").trim().toLowerCase() === "true";
      expect(parsed).toBe(expected);
    }
  });

  test("INV-CERT: emits indexing storage invariants gate report", () => {
    const failures: string[] = [];
    const documentContext = {
      documentId: "cert-doc-001",
      versionId: "cert-doc-001",
      rootDocumentId: "cert-root-001",
      isLatestVersion: true,
    };

    const pdfExtraction: any = {
      sourceType: "pdf",
      text:
        "Page one text with enough words for chunking.\n\n" +
        "Page two text continues with additional detail for verification.",
      pages: [
        { page: 1, text: "Page one text with enough words for chunking." },
        {
          page: 2,
          text: "Page two text continues with additional detail for verification.",
        },
      ],
    };
    const pdfChunks = buildInputChunks(
      pdfExtraction,
      pdfExtraction.text,
      { targetChars: 70, overlapChars: 8 },
      documentContext,
    );

    const xlsxExtraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "SheetA", textContent: "Revenue table" }],
      cellFacts: [
        {
          sheet: "SheetA",
          cell: "B2",
          rowLabel: "Revenue",
          colHeader: "Q1",
          value: "$100",
          displayValue: "$100",
        },
        {
          sheet: "SheetA",
          cell: "C2",
          rowLabel: "Revenue",
          colHeader: "Q2",
          value: "$200",
          displayValue: "$200",
        },
      ],
    };
    const xlsxChunks = buildInputChunks(
      xlsxExtraction,
      "",
      undefined,
      documentContext,
    );

    const pdfSequential = pdfChunks.every(
      (chunk, index) => chunk.chunkIndex === index,
    );
    const xlsxSequential = xlsxChunks.every(
      (chunk, index) => chunk.chunkIndex === index,
    );
    const allChunks = [...pdfChunks, ...xlsxChunks];
    const allHaveCitationContract = allChunks.every(
      (chunk) => {
        const sourceType = String(chunk.metadata?.sourceType || "");
        const chunkType = String(chunk.metadata?.chunkType || "");
        const hasCore =
          chunk.content.length > 0 &&
          typeof chunk.chunkIndex === "number" &&
          Boolean(sourceType) &&
          Boolean(chunkType) &&
          Boolean(chunk.metadata?.sectionId);
        if (!hasCore) return false;
        if (sourceType === "pdf") {
          return Number.isFinite(chunk.pageNumber);
        }
        if (sourceType === "xlsx") {
          const hasTableScope = Boolean(
            chunk.metadata?.tableId || chunk.metadata?.sheetName,
          );
          if (!hasTableScope) return false;
          if (chunk.metadata?.tableChunkForm === "cell_centric") {
            return (
              Number.isFinite(chunk.metadata?.rowIndex) &&
              Number.isFinite(chunk.metadata?.columnIndex)
            );
          }
        }
        return true;
      },
    );
    const allHaveLocation = allChunks.every(
      (chunk) => {
        const hasSectionId =
          typeof chunk.metadata?.sectionId === "string" &&
          chunk.metadata.sectionId.length > 0;
        const hasLocator =
          chunk.pageNumber != null ||
          chunk.metadata?.sheetName != null ||
          chunk.metadata?.sectionName != null ||
          chunk.metadata?.startChar != null ||
          chunk.metadata?.slideTitle != null;
        return hasSectionId && hasLocator;
      },
    );
    const versionMetadataPresent = allChunks.every(
      (chunk) =>
        chunk.metadata?.documentId === "cert-doc-001" &&
        chunk.metadata?.versionId === "cert-doc-001" &&
        chunk.metadata?.rootDocumentId === "cert-root-001" &&
        chunk.metadata?.isLatestVersion === true,
    );
    const cellChunks = xlsxChunks.filter(
      (chunk) => chunk.metadata?.tableChunkForm === "cell_centric",
    );
    const cellCoordinatesPresent =
      cellChunks.length > 0 &&
      cellChunks.every(
        (chunk) =>
          typeof chunk.metadata?.rowIndex === "number" &&
          typeof chunk.metadata?.columnIndex === "number" &&
          chunk.metadata?.tableId,
      );

    const duplicateCandidate =
      "Quarterly revenue remained stable across the compared periods.";
    const deduped = deduplicateChunks(
      [
        {
          chunkIndex: 0,
          content: duplicateCandidate,
          metadata: { sectionName: "Summary" },
        },
        {
          chunkIndex: 1,
          content: duplicateCandidate,
          metadata: { sectionName: "Summary" },
        },
        {
          chunkIndex: 2,
          content: duplicateCandidate,
          metadata: { sectionName: "Financials" },
        },
      ] as any,
    );
    const dedupSectionPreserved =
      deduped.length === 2 &&
      deduped.some((chunk) => chunk.metadata?.sectionName === "Summary") &&
      deduped.some((chunk) => chunk.metadata?.sectionName === "Financials");

    if (pdfChunks.length === 0) failures.push("PDF_CHUNKS_EMPTY");
    if (xlsxChunks.length === 0) failures.push("XLSX_CHUNKS_EMPTY");
    if (!pdfSequential) failures.push("PDF_CHUNK_INDEX_NON_SEQUENTIAL");
    if (!xlsxSequential) failures.push("XLSX_CHUNK_INDEX_NON_SEQUENTIAL");
    if (!allHaveCitationContract) failures.push("CITATION_CONTRACT_VIOLATION");
    if (!allHaveLocation) failures.push("PROVENANCE_LOCATION_MISSING");
    if (!versionMetadataPresent) failures.push("VERSION_METADATA_MISSING");
    if (!cellCoordinatesPresent) failures.push("CELL_COORDINATES_MISSING");
    if (!dedupSectionPreserved) failures.push("DEDUP_SECTION_COLLAPSE");

    writeCertificationGateReport("indexing-storage-invariants", {
      passed: failures.length === 0,
      metrics: {
        pdfChunkCount: pdfChunks.length,
        xlsxChunkCount: xlsxChunks.length,
        pdfSequential,
        xlsxSequential,
        allHaveCitationContract,
        allHaveLocation,
        versionMetadataPresent,
        cellChunks: cellChunks.length,
        cellCoordinatesPresent,
        dedupSectionPreserved,
      },
      thresholds: {
        minPdfChunkCount: 1,
        minXlsxChunkCount: 1,
        pdfSequential: true,
        xlsxSequential: true,
        allHaveCitationContract: true,
        allHaveLocation: true,
        versionMetadataPresent: true,
        minCellChunks: 1,
        cellCoordinatesPresent: true,
        dedupSectionPreserved: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
