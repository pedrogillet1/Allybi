/**
 * Tests that extractText falls back to Tesseract when Google Vision is unavailable.
 */

jest.mock("../../../extraction/google-vision-ocr.service", () => ({
  getGoogleVisionOcrService: () => ({
    isAvailable: () => false,
    getInitError: () => "No credentials",
  }),
}));

jest.mock("../../../extraction/tesseractFallback.service", () => ({
  extractWithTesseract: jest.fn().mockResolvedValue({
    text: "Fallback OCR text",
    confidence: 0.65,
  }),
}));

// Mock all extractors to avoid heavy dependencies
jest.mock("../../../extraction/pdfExtractor.service", () => ({}));
jest.mock("../../../extraction/docxExtractor.service", () => ({}));
jest.mock("../../../extraction/xlsxExtractor.service", () => ({}));
jest.mock("../../../extraction/pptxExtractor.service", () => ({}));

import { extractText } from "../extractionDispatch.service";
import { extractWithTesseract } from "../../../extraction/tesseractFallback.service";

describe("extractText image fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set default mock
    (extractWithTesseract as jest.Mock).mockResolvedValue({
      text: "Fallback OCR text",
      confidence: 0.65,
    });
  });

  it("falls back to Tesseract when Google Vision is unavailable", async () => {
    const buffer = Buffer.alloc(20 * 1024); // > 10KB to pass size check
    const result = await extractText(buffer, "image/png", "document-scan.png");

    expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng");
    expect(result.text).toBe("Fallback OCR text");
    expect(result.sourceType).toBe("image");
  });

  it("still returns visual-only if Tesseract also returns no text", async () => {
    (extractWithTesseract as jest.Mock).mockResolvedValueOnce({
      text: "",
      confidence: 0,
    });

    const buffer = Buffer.alloc(20 * 1024);
    const result = await extractText(buffer, "image/png", "photo.png");

    expect(result.text).toBe("");
    expect((result as any).skipped).toBe(true);
  });

  it("skips OCR entirely for small images (< 10KB)", async () => {
    const buffer = Buffer.alloc(5 * 1024); // < 10KB
    const result = await extractText(buffer, "image/png", "tiny.png");

    expect(extractWithTesseract).not.toHaveBeenCalled();
    expect(result.text).toBe("");
    expect((result as any).skipped).toBe(true);
  });

  it("skips OCR for filename patterns like logo/icon", async () => {
    const buffer = Buffer.alloc(20 * 1024);
    const result = await extractText(buffer, "image/png", "company-logo.png");

    expect(extractWithTesseract).not.toHaveBeenCalled();
    expect((result as any).skipped).toBe(true);
  });
});
