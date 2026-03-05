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
import sharp from "sharp";

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

    expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng+por");
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

  it("skips OCR for low-variance visual-only images without filename hints", async () => {
    const buffer = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    expect(buffer.length).toBeGreaterThan(10 * 1024);
    const result = await extractText(buffer, "image/png", "solid-canvas.png");

    expect(extractWithTesseract).not.toHaveBeenCalled();
    expect((result as any).skipped).toBe(true);
    expect((result as any).skipReason).toContain("low_variance");
  });

  it("extracts connector mime payloads as plain text", async () => {
    const payload = "Title: Quarterly update\nSource: gmail\nBody text here";
    const buffer = Buffer.from(payload, "utf8");
    const result = await extractText(buffer, "message/rfc822", "gmail_msg-1.txt");

    expect(result.sourceType).toBe("text");
    expect(result.text).toContain("Quarterly update");
    expect(result.wordCount).toBeGreaterThan(0);
  });

  describe("Tesseract multi-language support", () => {
    it("uses eng+por by default when no filename is provided", async () => {
      const buffer = Buffer.alloc(20 * 1024);
      await extractText(buffer, "image/png");

      expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng+por");
    });

    it("uses eng+por for a regular filename without language hints", async () => {
      const buffer = Buffer.alloc(20 * 1024);
      await extractText(buffer, "image/png", "receipt-scan.png");

      expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng+por");
    });

    it("uses eng+spa when filename contains _es suffix", async () => {
      const buffer = Buffer.alloc(20 * 1024);
      await extractText(buffer, "image/png", "invoice_es.png");

      expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng+spa");
    });

    it("uses eng+spa when filename contains _spa suffix", async () => {
      const buffer = Buffer.alloc(20 * 1024);
      await extractText(buffer, "image/png", "contract_spa.png");

      expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng+spa");
    });

    it("uses eng+spa when filename contains .es. locale marker", async () => {
      const buffer = Buffer.alloc(20 * 1024);
      await extractText(buffer, "image/png", "report.es.png");

      expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng+spa");
    });

    it("uses eng+spa when filename contains 'spanish'", async () => {
      const buffer = Buffer.alloc(20 * 1024);
      await extractText(buffer, "image/png", "spanish-doc-scan.png");

      expect(extractWithTesseract).toHaveBeenCalledWith(buffer, "eng+spa");
    });
  });
});
