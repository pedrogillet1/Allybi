/**
 * Tests for TesseractFallback service.
 *
 * Mock tesseract.js to avoid heavy WASM initialization in CI.
 */

const mockRecognize = jest.fn();
const mockTerminate = jest.fn();

jest.mock("tesseract.js", () => ({
  createWorker: jest.fn().mockResolvedValue({
    recognize: mockRecognize,
    terminate: mockTerminate,
  }),
}));

import { extractWithTesseract } from "../tesseractFallback.service";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("TesseractFallback", () => {
  it("returns text and normalized confidence on success", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "Hello World", confidence: 85 },
    });

    const result = await extractWithTesseract(Buffer.from("fake image"));

    expect(result.text).toBe("Hello World");
    expect(result.confidence).toBe(0.85); // 85/100
    expect(mockTerminate).toHaveBeenCalled();
  });

  it("returns empty text when OCR finds nothing", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "", confidence: 0 },
    });

    const result = await extractWithTesseract(Buffer.from("blank image"));

    expect(result.text).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("returns empty result on error without throwing", async () => {
    mockRecognize.mockRejectedValue(new Error("WASM load failed"));

    const result = await extractWithTesseract(Buffer.from("bad data"));

    expect(result.text).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("trims whitespace from OCR output", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "  some text with spaces  \n\n", confidence: 72 },
    });

    const result = await extractWithTesseract(Buffer.from("image"));

    expect(result.text).toBe("some text with spaces");
    expect(result.confidence).toBe(0.72);
  });
});
