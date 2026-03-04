/**
 * Tests for PPTXImageExtractorService - Tesseract OCR integration.
 *
 * Mocks file system, sharp, adm-zip, storage, and tesseract to isolate
 * the OCR gating logic without touching real files or WASM.
 */

const mockExtractWithTesseract = jest.fn();
jest.mock("../extraction/tesseractFallback.service", () => ({
  extractWithTesseract: mockExtractWithTesseract,
}));

// Stub env config - default to OCR disabled
const mockConfig: Record<string, string> = {
  PPTX_IMAGE_OCR_ENABLED: "false",
};
jest.mock("../../config/env", () => ({
  config: new Proxy(
    {},
    {
      get(_target, prop: string) {
        return mockConfig[prop];
      },
    },
  ),
}));

// Stub logger
jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Stub sharp - returns a chainable object that writes a fake file
jest.mock("sharp", () => {
  const sharpInstance = {
    png: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(undefined),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from("composite")),
    composite: jest.fn().mockReturnThis(),
  };
  return jest.fn(() => sharpInstance);
});

// Stub storage
jest.mock("../../config/storage", () => ({
  uploadFile: jest.fn().mockResolvedValue(undefined),
  getSignedUrl: jest.fn().mockResolvedValue("https://signed.url/img.png"),
}));

// Stub adm-zip
const mockGetEntries = jest.fn();
const mockGetEntry = jest.fn();
jest.mock("adm-zip", () => {
  return jest.fn().mockImplementation(() => ({
    getEntries: mockGetEntries,
    getEntry: mockGetEntry,
  }));
});

// Stub fs
jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    rmSync: jest.fn(),
    promises: {
      readFile: jest.fn().mockResolvedValue(Buffer.from("fake-image-data")),
    },
  };
});

import { PPTXImageExtractorService } from "./pptxImageExtractor.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build minimal ZIP entries that mapImagesToSlides can parse. */
function setupZipEntries(imageCount: number) {
  // Build media image entries
  const mediaEntries = Array.from({ length: imageCount }, (_, i) => ({
    entryName: `ppt/media/image${i + 1}.png`,
    isDirectory: false,
    getData: () => Buffer.from(`image-data-${i + 1}`),
  }));

  // Build a single slide XML entry
  const slideEntry = {
    entryName: "ppt/slides/slide1.xml",
    isDirectory: false,
    getData: () => Buffer.from("<xml/>"),
  };

  // Build the rels entry that references all images
  const relationships = Array.from(
    { length: imageCount },
    (_, i) =>
      `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.png"/>`,
  ).join("");
  const relsXml = `<Relationships>${relationships}</Relationships>`;
  const relsEntry = {
    entryName: "ppt/slides/_rels/slide1.xml.rels",
    isDirectory: false,
    getData: () => Buffer.from(relsXml),
  };

  const allEntries = [...mediaEntries, slideEntry, relsEntry];

  mockGetEntries.mockReturnValue(allEntries);
  mockGetEntry.mockImplementation((path: string) => {
    return allEntries.find((e) => e.entryName === path) || null;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.PPTX_IMAGE_OCR_ENABLED = "false";
});

describe("PPTXImageExtractorService - Image OCR", () => {
  const service = new PPTXImageExtractorService();
  const fakeFilePath = "/tmp/test.pptx";
  const fakeDocId = "doc-123";
  const defaultOpts = { uploadToGCS: false, outputDir: "/tmp/out" };

  it("does NOT call extractWithTesseract when PPTX_IMAGE_OCR_ENABLED=false", async () => {
    setupZipEntries(3);
    mockConfig.PPTX_IMAGE_OCR_ENABLED = "false";

    const result = await service.extractImages(fakeFilePath, fakeDocId, defaultOpts);

    expect(result.success).toBe(true);
    expect(mockExtractWithTesseract).not.toHaveBeenCalled();
  });

  it("calls extractWithTesseract on each image when PPTX_IMAGE_OCR_ENABLED=true", async () => {
    setupZipEntries(3);
    mockConfig.PPTX_IMAGE_OCR_ENABLED = "true";
    mockExtractWithTesseract.mockResolvedValue({
      text: "This is some extracted OCR text from the image",
      confidence: 0.85,
    });

    const result = await service.extractImages(fakeFilePath, fakeDocId, defaultOpts);

    expect(result.success).toBe(true);
    expect(mockExtractWithTesseract).toHaveBeenCalledTimes(3);
    // Verify called with buffer and language string
    expect(mockExtractWithTesseract).toHaveBeenCalledWith(
      expect.any(Buffer),
      "eng+por",
    );
    // Verify ocrText is set on images
    const allImages = result.slides!.flatMap((s) => s.images);
    expect(allImages.every((img) => img.ocrText !== undefined)).toBe(true);
  });

  it("ignores OCR text when result is <= 10 characters", async () => {
    setupZipEntries(2);
    mockConfig.PPTX_IMAGE_OCR_ENABLED = "true";
    // First image: short text (should be ignored)
    mockExtractWithTesseract
      .mockResolvedValueOnce({ text: "short", confidence: 0.5 })
      // Second image: long enough text (should be stored)
      .mockResolvedValueOnce({
        text: "This text is longer than ten characters",
        confidence: 0.9,
      });

    const result = await service.extractImages(fakeFilePath, fakeDocId, defaultOpts);

    expect(result.success).toBe(true);
    const allImages = result.slides!.flatMap((s) => s.images);
    expect(allImages[0].ocrText).toBeUndefined();
    expect(allImages[1].ocrText).toBe("This text is longer than ten characters");
  });

  it("limits OCR processing to first 10 images", async () => {
    setupZipEntries(15);
    mockConfig.PPTX_IMAGE_OCR_ENABLED = "true";
    mockExtractWithTesseract.mockResolvedValue({
      text: "OCR text that is certainly longer than ten chars",
      confidence: 0.8,
    });

    const result = await service.extractImages(fakeFilePath, fakeDocId, defaultOpts);

    expect(result.success).toBe(true);
    // Should be called exactly 10 times despite 15 images
    expect(mockExtractWithTesseract).toHaveBeenCalledTimes(10);
    // First 10 images should have ocrText, remaining 5 should not
    const allImages = result.slides!.flatMap((s) => s.images);
    expect(allImages.length).toBe(15);
    const withOcr = allImages.filter((img) => img.ocrText);
    const withoutOcr = allImages.filter((img) => !img.ocrText);
    expect(withOcr.length).toBe(10);
    expect(withoutOcr.length).toBe(5);
  });
});
