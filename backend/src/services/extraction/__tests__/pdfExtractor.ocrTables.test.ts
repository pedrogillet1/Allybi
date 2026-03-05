jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(function () {
    return {
      getInfo: jest.fn().mockResolvedValue({ total: 1 }),
      getText: jest.fn().mockResolvedValue({ text: "" }),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

const mockProcessPdfPages = jest.fn();
jest.mock("../google-vision-ocr.service", () => ({
  __esModule: true,
  default: {
    isAvailable: () => true,
    processPdfPages: (...args: unknown[]) => mockProcessPdfPages(...args),
  },
}));

jest.mock("../documentAiTableExtractor.service", () => ({
  extractTablesWithDocumentAI: jest.fn().mockResolvedValue(null),
}));

jest.mock("../pdfOutlineExtractor.service", () => ({
  extractPdfOutline: jest.fn().mockResolvedValue([]),
}));

import { extractPdfWithAnchors } from "../pdfExtractor.service";

describe("pdfExtractor OCR table parity", () => {
  const originalDocAi = process.env.DOCUMENT_AI_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DOCUMENT_AI_ENABLED = "false";
    mockProcessPdfPages.mockResolvedValue({
      pageCount: 1,
      confidence: 0.9,
      mode: "direct",
      warnings: [],
      pages: [
        {
          page: 1,
          text: "Metric     Value\nRevenue    100\nEBITDA     20",
          confidence: 0.92,
        },
      ],
    });
  });

  afterAll(() => {
    process.env.DOCUMENT_AI_ENABLED = originalDocAi;
  });

  it("extracts structured tables when OCR path is used", async () => {
    const result = await extractPdfWithAnchors(Buffer.alloc(1024));

    expect(result.ocrApplied).toBe(true);
    expect(result.extractedTables).toBeDefined();
    expect(result.extractedTables!.length).toBeGreaterThan(0);
    expect(result.extractedTables![0].tableMethod).toBe("heuristic");
    expect(result.text).toContain("|");
    expect(result.text).toContain("Revenue");
  });
});
