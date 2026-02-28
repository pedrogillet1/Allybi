import { describe, expect, test } from "@jest/globals";

import { deriveOcrSignals } from "../../services/extraction/ocrSignals.service";

describe("OCR signals contract", () => {
  test("keeps explicit applied outcome and confidence", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      fullText: "Invoice total 123",
      extraction: {
        ocrAttempted: true,
        ocrUsed: true,
        ocrSuccess: true,
        ocrConfidence: 0.91,
        ocrOutcome: "applied",
      },
    });

    expect(result.ocrAttempted).toBe(true);
    expect(result.ocrUsed).toBe(true);
    expect(result.ocrSuccess).toBe(true);
    expect(result.ocrConfidence).toBe(0.91);
    expect(result.ocrOutcome).toBe("applied");
  });

  test("infers skipped_heuristic from skip reason", () => {
    const result = deriveOcrSignals({
      mimeType: "image/jpeg",
      fullText: "",
      extraction: {
        skipped: true,
        skipReason:
          "Image saved as visual-only (filename matches skip pattern: /logo/i)",
      },
    });

    expect(result.ocrOutcome).toBe("skipped_heuristic");
    expect(result.ocrUsed).toBe(false);
    expect(result.ocrConfidence).toBeNull();
  });

  test("infers provider_unavailable from skip reason", () => {
    const result = deriveOcrSignals({
      mimeType: "image/jpeg",
      fullText: "",
      extraction: {
        skipped: true,
        skipReason:
          "Image saved as visual-only (Image OCR unavailable (Google Vision not initialized): no credentials)",
      },
    });

    expect(result.ocrOutcome).toBe("provider_unavailable");
    expect(result.ocrUsed).toBe(false);
    expect(result.ocrConfidence).toBeNull();
  });

  test("infers runtime_error from OCR error marker", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      fullText: "",
      extraction: {
        skipped: true,
        skipReason: "Image saved as visual-only (ocr_error: EPIPE)",
      },
    });

    expect(result.ocrOutcome).toBe("runtime_error");
    expect(result.ocrUsed).toBe(false);
  });

  test("infers no_text when OCR attempted but no extracted text", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      fullText: "",
      extraction: {
        ocrAttempted: true,
        ocrUsed: false,
        ocrSuccess: false,
      },
    });

    expect(result.ocrOutcome).toBe("no_text");
    expect(result.ocrAttempted).toBe(true);
    expect(result.ocrUsed).toBe(false);
    expect(result.ocrConfidence).toBeNull();
  });

  test("clamps confidence and defaults to not_attempted", () => {
    const result = deriveOcrSignals({
      mimeType: "application/pdf",
      fullText: "",
      extraction: {
        ocrUsed: false,
        ocrConfidence: 2.5,
      },
    });

    expect(result.ocrOutcome).toBe("not_attempted");
    expect(result.ocrConfidence).toBeNull();
  });
});
