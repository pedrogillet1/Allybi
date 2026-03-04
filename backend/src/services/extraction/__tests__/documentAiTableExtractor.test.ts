/**
 * Tests for documentAiTableExtractor.service.ts
 *
 * Mocks @google-cloud/documentai to avoid real API calls.
 */

const mockProcessDocument = jest.fn();

jest.mock("@google-cloud/documentai", () => ({
  DocumentProcessorServiceClient: jest.fn().mockImplementation(() => ({
    processDocument: mockProcessDocument,
  })),
}));

jest.mock("../../../utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { extractTablesWithDocumentAI } from "../documentAiTableExtractor.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    DOCUMENT_AI_ENABLED: "true",
    DOCUMENT_AI_PROCESSOR_ID: "test-processor-id",
    DOCUMENT_AI_LOCATION: "us",
    GCP_PROJECT_ID: "test-project",
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

/**
 * Build a minimal Document AI response with tables.
 * `documentText` is the full text blob that textAnchor offsets refer to.
 */
function buildDocAiResponse(
  documentText: string,
  pages: Array<{
    pageNumber: number;
    tables: Array<{
      headerRows: Array<{ cells: Array<{ text: string; start: number; end: number }> }>;
      bodyRows: Array<{ cells: Array<{ text: string; start: number; end: number }> }>;
    }>;
  }>,
) {
  return [
    {
      document: {
        text: documentText,
        pages: pages.map((p) => ({
          pageNumber: p.pageNumber,
          tables: p.tables.map((t) => ({
            headerRows: t.headerRows.map((hr) => ({
              cells: hr.cells.map((c) => ({
                layout: {
                  textAnchor: {
                    textSegments: [
                      { startIndex: c.start, endIndex: c.end },
                    ],
                  },
                },
              })),
            })),
            bodyRows: t.bodyRows.map((br) => ({
              cells: br.cells.map((c) => ({
                layout: {
                  textAnchor: {
                    textSegments: [
                      { startIndex: c.start, endIndex: c.end },
                    ],
                  },
                },
              })),
            })),
          })),
        })),
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("documentAiTableExtractor", () => {
  it("extracts 2 tables across pages and returns correct markdown", async () => {
    // Build a document text that the offsets refer to
    const docText = "ItemQtyNameAge";
    //                0123456789...
    // Table 1 on page 1: header=[Item,Qty], body row=[A,1]
    // Table 2 on page 2: header=[Name,Age], body row=[Bob,30]

    mockProcessDocument.mockResolvedValue(
      buildDocAiResponse(docText, [
        {
          pageNumber: 1,
          tables: [
            {
              headerRows: [
                {
                  cells: [
                    { text: "Item", start: 0, end: 4 },
                    { text: "Qty", start: 4, end: 7 },
                  ],
                },
              ],
              bodyRows: [
                {
                  cells: [
                    { text: "A", start: 0, end: 1 },
                    { text: "1", start: 4, end: 5 },
                  ],
                },
              ],
            },
          ],
        },
        {
          pageNumber: 2,
          tables: [
            {
              headerRows: [
                {
                  cells: [
                    { text: "Name", start: 7, end: 11 },
                    { text: "Age", start: 11, end: 14 },
                  ],
                },
              ],
              bodyRows: [
                {
                  cells: [
                    { text: "Bob", start: 7, end: 10 },
                    { text: "30", start: 11, end: 13 },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    );

    const result = await extractTablesWithDocumentAI(Buffer.from("fake-pdf"));

    expect(result).not.toBeNull();
    expect(result!.tableCount).toBe(2);
    expect(result!.pages).toHaveLength(2);
    expect(result!.pages[0].page).toBe(1);
    expect(result!.pages[1].page).toBe(2);

    // Each page should have exactly 1 table in markdown form
    expect(result!.pages[0].tables).toHaveLength(1);
    expect(result!.pages[1].tables).toHaveLength(1);

    // Markdown should contain pipe separators and dashes
    expect(result!.pages[0].tables[0]).toContain("|");
    expect(result!.pages[0].tables[0]).toContain("---");
    expect(result!.pages[1].tables[0]).toContain("|");
    expect(result!.pages[1].tables[0]).toContain("---");
  });

  it("returns null without throwing when Document AI is unavailable", async () => {
    mockProcessDocument.mockRejectedValue(
      new Error("UNAVAILABLE: Service unavailable"),
    );

    const result = await extractTablesWithDocumentAI(Buffer.from("fake-pdf"));

    expect(result).toBeNull();
  });

  it("returns empty result when document has no tables", async () => {
    mockProcessDocument.mockResolvedValue([
      {
        document: {
          text: "Just some text without tables.",
          pages: [
            {
              pageNumber: 1,
              tables: [],
            },
          ],
        },
      },
    ]);

    const result = await extractTablesWithDocumentAI(Buffer.from("fake-pdf"));

    expect(result).not.toBeNull();
    expect(result!.pages).toEqual([]);
    expect(result!.tableCount).toBe(0);
  });

  it("returns null when DOCUMENT_AI_ENABLED is false", async () => {
    process.env.DOCUMENT_AI_ENABLED = "false";

    const result = await extractTablesWithDocumentAI(Buffer.from("fake-pdf"));

    expect(result).toBeNull();
    // processDocument should never be called
    expect(mockProcessDocument).not.toHaveBeenCalled();
  });

  it("returns null when DOCUMENT_AI_ENABLED is not set", async () => {
    delete process.env.DOCUMENT_AI_ENABLED;

    const result = await extractTablesWithDocumentAI(Buffer.from("fake-pdf"));

    expect(result).toBeNull();
    expect(mockProcessDocument).not.toHaveBeenCalled();
  });

  it("returns null when DOCUMENT_AI_PROCESSOR_ID is not set", async () => {
    delete process.env.DOCUMENT_AI_PROCESSOR_ID;

    const result = await extractTablesWithDocumentAI(Buffer.from("fake-pdf"));

    expect(result).toBeNull();
    expect(mockProcessDocument).not.toHaveBeenCalled();
  });
});
