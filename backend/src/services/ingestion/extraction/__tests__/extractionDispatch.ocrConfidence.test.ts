/**
 * Tests for F-03: OCR confidence fallback uses 0.5 (not 0.8) when provider
 * returns undefined confidence.
 */

const mockExtractTextWithRetry = jest.fn();

jest.mock("../../../extraction/google-vision-ocr.service", () => ({
  getGoogleVisionOcrService: () => ({
    isAvailable: () => true,
    extractTextWithRetry: mockExtractTextWithRetry,
    getInitError: () => null,
  }),
}));

jest.mock("../../../extraction/tesseractFallback.service", () => ({
  extractWithTesseract: jest.fn(),
}));

jest.mock("../../../extraction/pdfExtractor.service", () => ({}));
jest.mock("../../../extraction/docxExtractor.service", () => ({}));
jest.mock("../../../extraction/xlsxExtractor.service", () => ({}));
jest.mock("../../../extraction/pptxExtractor.service", () => ({}));

import { extractText } from "../extractionDispatch.service";

describe("extractText image OCR confidence fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses 0.5 when OCR provider returns undefined confidence", async () => {
    mockExtractTextWithRetry.mockResolvedValueOnce({
      text: "Some extracted text from image",
      confidence: undefined,
    });

    const buffer = Buffer.alloc(20 * 1024); // > 10KB
    const result = await extractText(buffer, "image/png", "scan.png");

    expect(result.sourceType).toBe("image");
    expect(result.confidence).toBe(0.5);
    expect(result.extractionWarnings).toBeDefined();
    expect(result.extractionWarnings![0]).toContain("ocr_confidence_estimated");
  });

  it("uses actual confidence when OCR provider returns a value", async () => {
    mockExtractTextWithRetry.mockResolvedValueOnce({
      text: "Some extracted text from image",
      confidence: 0.92,
    });

    const buffer = Buffer.alloc(20 * 1024);
    const result = await extractText(buffer, "image/png", "scan.png");

    expect(result.sourceType).toBe("image");
    expect(result.confidence).toBe(0.92);
    expect(result.extractionWarnings).toBeUndefined();
  });
});
