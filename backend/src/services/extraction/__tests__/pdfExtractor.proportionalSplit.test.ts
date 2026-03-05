/**
 * Tests for F-02: PDF proportional page split when no separators found.
 *
 * Mocks pdf-parse to return multi-page text without form feeds or page markers,
 * then verifies proportional splitting produces the expected page count.
 */

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(function () {
    return {
      getInfo: jest.fn().mockResolvedValue({ total: 3 }),
      getText: jest.fn().mockResolvedValue({
        // 3 pages worth of text, no form feeds or page markers
        text: "First page content with enough text to be meaningful. This section covers the introduction and background material for the document. " +
          "Second page continues with more detailed analysis. The results show significant improvements in all measured areas compared to prior work. " +
          "Third page contains the conclusion and recommendations. Based on the findings we recommend proceeding with the proposed approach.",
      }),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

jest.mock("../../extraction/google-vision-ocr.service", () => ({
  __esModule: true,
  default: {
    isAvailable: () => false,
    getInitializationError: () => "test",
  },
}));

jest.mock("../../extraction/documentAiTableExtractor.service", () => ({
  extractTablesWithDocumentAI: jest.fn(),
}));

jest.mock("../../extraction/pdfOutlineExtractor.service", () => ({
  extractPdfOutline: jest.fn().mockResolvedValue([]),
}));

import { extractPdfWithAnchors } from "../pdfExtractor.service";

describe("PDF proportional page split (F-02)", () => {
  it("splits text into multiple pages proportionally when no separators exist", async () => {
    const buffer = Buffer.alloc(1024); // Dummy buffer (pdf-parse is mocked)

    const result = await extractPdfWithAnchors(buffer);

    // Should have 3 pages (matching pageCount from getInfo)
    expect(result.pageCount).toBe(3);
    expect(result.pages.length).toBe(3);

    // Each page should have some text (not empty)
    for (const page of result.pages) {
      expect(page.text.length).toBeGreaterThan(0);
    }

    // Should include extraction warning about proportional split
    expect(result.extractionWarnings).toBeDefined();
    expect(result.extractionWarnings).toContain("no_page_separators_proportional_split");
  });

  it("does not split when there is only 1 page", async () => {
    // Override the mock for this test
    const { PDFParse } = require("pdf-parse");
    PDFParse.mockImplementationOnce(function () {
      return {
        getInfo: jest.fn().mockResolvedValue({ total: 1 }),
        getText: jest.fn().mockResolvedValue({
          text: "Single page document with some text content.",
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
    });

    const buffer = Buffer.alloc(1024);
    const result = await extractPdfWithAnchors(buffer);

    expect(result.pages.length).toBe(1);
    // No proportional split warning for single page
    if (result.extractionWarnings) {
      expect(result.extractionWarnings).not.toContain("no_page_separators_proportional_split");
    }
  });
});
