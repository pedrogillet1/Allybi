import { describe, expect, test } from "@jest/globals";
import { deriveOcrSignals } from "./ocrSignals.service";
import type { OcrSignals } from "./ocrSignals.service";

// ---------------------------------------------------------------------------
// deriveOcrSignals — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe("deriveOcrSignals", () => {
  // =========================================================================
  // Baseline: no OCR metadata at all
  // =========================================================================

  test("returns not_attempted when extraction is null", () => {
    const result = deriveOcrSignals({
      mimeType: "application/pdf",
      extraction: null,
      fullText: "some text",
    });
    expect(result.ocrAttempted).toBe(false);
    expect(result.ocrUsed).toBe(false);
    expect(result.ocrSuccess).toBe(false);
    expect(result.ocrConfidence).toBeNull();
    expect(result.ocrPageCount).toBeNull();
    expect(result.ocrMode).toBeNull();
    expect(result.ocrOutcome).toBe("not_attempted");
  });

  test("returns not_attempted when extraction is undefined", () => {
    const result = deriveOcrSignals({
      mimeType: "application/pdf",
      extraction: undefined,
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("not_attempted");
    expect(result.ocrUsed).toBe(false);
  });

  test("returns not_attempted when extraction is empty object", () => {
    const result = deriveOcrSignals({
      mimeType: "text/plain",
      extraction: {},
      fullText: "hello",
    });
    expect(result.ocrOutcome).toBe("not_attempted");
  });

  // =========================================================================
  // OCR successfully applied
  // =========================================================================

  test("detects applied OCR via ocrUsed flag", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true, ocrConfidence: 0.92 },
      fullText: "extracted text from image",
    });
    expect(result.ocrAttempted).toBe(true);
    expect(result.ocrUsed).toBe(true);
    expect(result.ocrSuccess).toBe(true);
    expect(result.ocrConfidence).toBeCloseTo(0.92, 2);
    expect(result.ocrOutcome).toBe("applied");
  });

  test("detects applied OCR via ocrApplied flag", () => {
    const result = deriveOcrSignals({
      mimeType: "image/jpeg",
      extraction: { ocrApplied: true },
      fullText: "some ocr text",
    });
    expect(result.ocrUsed).toBe(true);
    expect(result.ocrSuccess).toBe(true);
    expect(result.ocrOutcome).toBe("applied");
  });

  test("detects applied OCR via ocrPageCount > 0", () => {
    const result = deriveOcrSignals({
      mimeType: "application/pdf",
      extraction: { ocrPageCount: 3 },
      fullText: "text on 3 pages",
    });
    expect(result.ocrUsed).toBe(true);
    expect(result.ocrPageCount).toBe(3);
    expect(result.ocrOutcome).toBe("applied");
  });

  // =========================================================================
  // ocrSuccess inference
  // =========================================================================

  test("ocrSuccess is false when ocrUsed but fullText is empty", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true },
      fullText: "",
    });
    expect(result.ocrUsed).toBe(true);
    expect(result.ocrSuccess).toBe(false);
    // ocrAttempted but not successful => no_text
    expect(result.ocrOutcome).toBe("no_text");
  });

  test("ocrSuccess is false when fullText is only whitespace", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true },
      fullText: "   \n  ",
    });
    expect(result.ocrSuccess).toBe(false);
    expect(result.ocrOutcome).toBe("no_text");
  });

  test("ocrSuccess respects explicit boolean override", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true, ocrSuccess: false },
      fullText: "text exists",
    });
    // Explicit ocrSuccess=false overrides text-presence inference
    expect(result.ocrSuccess).toBe(false);
  });

  // =========================================================================
  // ocrAttempted inference
  // =========================================================================

  test("ocrAttempted inherits from ocrUsed when not explicitly set", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true },
      fullText: "text",
    });
    expect(result.ocrAttempted).toBe(true);
  });

  test("ocrAttempted respects explicit boolean", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrAttempted: true, ocrUsed: false },
      fullText: "",
    });
    expect(result.ocrAttempted).toBe(true);
    expect(result.ocrUsed).toBe(false);
    // Attempted but not used — outcome is no_text
    expect(result.ocrOutcome).toBe("no_text");
  });

  // =========================================================================
  // Explicit outcome field
  // =========================================================================

  test("uses explicit ocrOutcome when present and valid", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrOutcome: "provider_unavailable" },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("provider_unavailable");
  });

  test("ignores invalid explicit ocrOutcome value", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrOutcome: "some_garbage_value" },
      fullText: "",
    });
    // Should fall through to inferred outcome
    expect(result.ocrOutcome).toBe("not_attempted");
  });

  test("explicit outcome normalizes casing", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrOutcome: "APPLIED" },
      fullText: "text",
    });
    expect(result.ocrOutcome).toBe("applied");
  });

  test("explicit outcome trims whitespace", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrOutcome: "  runtime_error  " },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("runtime_error");
  });

  // =========================================================================
  // Skip reason inference
  // =========================================================================

  test("infers skipped_heuristic from filename skip reason", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { skipped: true, skipReason: "filename matches skip pattern" },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("skipped_heuristic");
  });

  test("infers skipped_heuristic from image too small", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { skipped: true, skipReason: "image too small (64x64)" },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("skipped_heuristic");
  });

  test("infers provider_unavailable from not initialized", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: {
        skipped: true,
        skipReason: "OCR provider not initialized",
      },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("provider_unavailable");
  });

  test("infers provider_unavailable from unavailable", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: {
        skipped: true,
        skipReason: "Google Vision API unavailable",
      },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("provider_unavailable");
  });

  test("infers runtime_error from ocr_error", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: {
        skipped: true,
        skipReason: "ocr_error: timeout after 30s",
      },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("runtime_error");
  });

  test("infers no_text from contains no text", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: {
        skipped: true,
        skipReason: "Image contains no text",
      },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("no_text");
  });

  test("falls back to not_attempted for unrecognized skip reason", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: {
        skipped: true,
        skipReason: "something entirely unknown",
      },
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("not_attempted");
  });

  // =========================================================================
  // Confidence clamping
  // =========================================================================

  test("clamps confidence above 1 to 1", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true, ocrConfidence: 1.5 },
      fullText: "text",
    });
    expect(result.ocrConfidence).toBe(1);
  });

  test("clamps confidence below 0 to 0", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true, ocrConfidence: -0.3 },
      fullText: "text",
    });
    expect(result.ocrConfidence).toBe(0);
  });

  test("confidence is null for non-finite values", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true, ocrConfidence: "not a number" },
      fullText: "text",
    });
    expect(result.ocrConfidence).toBeNull();
  });

  test("confidence is null when ocrUsed is false", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: false, ocrConfidence: 0.9 },
      fullText: "text",
    });
    expect(result.ocrConfidence).toBeNull();
  });

  test("falls back to extraction.confidence for images when ocrUsed", () => {
    const result = deriveOcrSignals({
      mimeType: "image/jpeg",
      extraction: { ocrUsed: true, confidence: 0.88 },
      fullText: "text",
    });
    expect(result.ocrConfidence).toBeCloseTo(0.88, 2);
  });

  test("does not fall back to extraction.confidence for non-image mimes", () => {
    const result = deriveOcrSignals({
      mimeType: "application/pdf",
      extraction: { ocrUsed: true, confidence: 0.88 },
      fullText: "text",
    });
    // For non-image mimes, the confidence fallback path resolves to null,
    // but clamp01(null) -> Number(null)=0 -> clamped to 0
    expect(result.ocrConfidence).toBe(0);
  });

  // =========================================================================
  // ocrPageCount
  // =========================================================================

  test("extracts ocrPageCount from extraction", () => {
    const result = deriveOcrSignals({
      mimeType: "application/pdf",
      extraction: { ocrPageCount: 7, ocrUsed: true },
      fullText: "text",
    });
    expect(result.ocrPageCount).toBe(7);
  });

  test("ocrPageCount is null for non-numeric values", () => {
    const result = deriveOcrSignals({
      mimeType: "application/pdf",
      extraction: { ocrPageCount: "unknown" },
      fullText: "",
    });
    expect(result.ocrPageCount).toBeNull();
  });

  // =========================================================================
  // ocrMode
  // =========================================================================

  test("extracts ocrMode from extraction", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrMode: "google_vision", ocrUsed: true },
      fullText: "text",
    });
    expect(result.ocrMode).toBe("google_vision");
  });

  test("ocrMode is null when not a string", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrMode: 42 },
      fullText: "",
    });
    expect(result.ocrMode).toBeNull();
  });

  // =========================================================================
  // Edge: mimeType handling
  // =========================================================================

  test("handles null mimeType gracefully", () => {
    const result = deriveOcrSignals({
      mimeType: null as any,
      extraction: {},
      fullText: "",
    });
    expect(result.ocrOutcome).toBe("not_attempted");
  });

  test("handles null fullText gracefully", () => {
    const result = deriveOcrSignals({
      mimeType: "image/png",
      extraction: { ocrUsed: true },
      fullText: null as any,
    });
    // fullText coerced to "" — ocrSuccess should be false
    expect(result.ocrSuccess).toBe(false);
  });
});
