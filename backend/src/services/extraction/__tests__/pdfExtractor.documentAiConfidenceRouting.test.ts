const nativeText = [
  "Executive summary with diverse tokens alpha beta gamma delta epsilon zeta eta theta.",
  "Metric     Value",
  "Revenue    100",
  "EBITDA     20",
  "Additional narrative for reliability and accounting context.",
].join("\n");

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(function () {
    return {
      getInfo: jest.fn().mockResolvedValue({ total: 1 }),
      getText: jest.fn().mockResolvedValue({ text: nativeText }),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

const mockDocAi = jest.fn();
jest.mock("../documentAiTableExtractor.service", () => ({
  extractTablesWithDocumentAI: (...args: unknown[]) => mockDocAi(...args),
}));

jest.mock("../google-vision-ocr.service", () => ({
  __esModule: true,
  default: {
    isAvailable: () => false,
    processPdfPages: jest.fn(),
  },
}));

jest.mock("../pdfOutlineExtractor.service", () => ({
  extractPdfOutline: jest.fn().mockResolvedValue([]),
}));

import { extractPdfWithAnchors } from "../pdfExtractor.service";

describe("pdfExtractor Document AI confidence routing", () => {
  const originalDocAiEnabled = process.env.DOCUMENT_AI_ENABLED;
  const originalThreshold = process.env.DOCUMENT_AI_TABLE_MIN_CONFIDENCE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DOCUMENT_AI_ENABLED = "true";
    process.env.DOCUMENT_AI_TABLE_MIN_CONFIDENCE = "0.8";
  });

  afterAll(() => {
    process.env.DOCUMENT_AI_ENABLED = originalDocAiEnabled;
    process.env.DOCUMENT_AI_TABLE_MIN_CONFIDENCE = originalThreshold;
  });

  function buildDocAiResult(confidence: number) {
    return {
      tableCount: 1,
      pages: [
        {
          page: 1,
          tables: [
            "| Metric | Value |\n| --- | --- |\n| Revenue | 100 |\n",
          ],
          structuredTables: [
            {
              rowCount: 2,
              colCount: 2,
              markdown:
                "| Metric | Value |\n| --- | --- |\n| Revenue | 100 |\n",
              cells: [
                { rowIndex: 0, colIndex: 0, text: "Metric", isHeader: true },
                { rowIndex: 0, colIndex: 1, text: "Value", isHeader: true },
                { rowIndex: 1, colIndex: 0, text: "Revenue", isHeader: false },
                { rowIndex: 1, colIndex: 1, text: "100", isHeader: false },
              ],
            },
          ],
        },
      ],
      tableConfidences: [{ page: 1, tableIndex: 0, confidence }],
    };
  }

  test("falls back to heuristic when Document AI confidence is below threshold", async () => {
    mockDocAi.mockResolvedValue(buildDocAiResult(0.2));

    const result = await extractPdfWithAnchors(Buffer.alloc(1024));

    expect(result.extractedTables).toBeDefined();
    expect(result.extractedTables!.length).toBeGreaterThan(0);
    expect(result.extractedTables![0].tableMethod).toBe("heuristic");
    expect(result.extractedTables![0].fallbackReason).toBe(
      "document_ai_low_confidence",
    );
    expect(
      result.extractionWarnings?.some((w) =>
        w.includes("document_ai_table_low_confidence_page_1_table_0"),
      ),
    ).toBe(true);
  });

  test("keeps Document AI tables when confidence meets threshold", async () => {
    mockDocAi.mockResolvedValue(buildDocAiResult(0.96));

    const result = await extractPdfWithAnchors(Buffer.alloc(1024));
    const docAiTable = result.extractedTables?.find(
      (table) => table.tableMethod === "document_ai",
    );

    expect(docAiTable).toBeDefined();
    expect(docAiTable?.tableConfidence).toBeCloseTo(0.96, 3);
    expect(docAiTable?.fallbackReason).toBeUndefined();
  });
});
