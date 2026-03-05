export type OcrOutcome =
  | "not_attempted"
  | "applied"
  | "no_text"
  | "skipped_heuristic"
  | "provider_unavailable"
  | "runtime_error";

export interface OcrSignals {
  ocrAttempted: boolean;
  ocrUsed: boolean;
  ocrSuccess: boolean;
  ocrConfidence: number | null;
  ocrPageCount: number | null;
  ocrMode: string | null;
  ocrOutcome: OcrOutcome;
}

function clamp01(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function inferOutcomeFromSkipReason(reason: string): OcrOutcome {
  const low = reason.toLowerCase();
  if (
    low.includes("filename matches skip pattern") ||
    low.includes("image too small")
  ) {
    return "skipped_heuristic";
  }
  if (low.includes("not initialized") || low.includes("unavailable")) {
    return "provider_unavailable";
  }
  if (low.includes("ocr_error")) {
    return "runtime_error";
  }
  if (low.includes("contains no text")) {
    return "no_text";
  }
  return "not_attempted";
}

function normalizeOutcome(value: unknown): OcrOutcome | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  switch (raw) {
    case "not_attempted":
    case "applied":
    case "no_text":
    case "skipped_heuristic":
    case "provider_unavailable":
    case "runtime_error":
      return raw;
    default:
      return null;
  }
}

export function deriveOcrSignals(input: {
  mimeType: string;
  extraction: Record<string, unknown> | null | undefined;
  fullText: string;
}): OcrSignals {
  const extraction: {
    ocrPageCount?: unknown;
    ocrMode?: unknown;
    ocrUsed?: unknown;
    ocrApplied?: unknown;
    ocrAttempted?: unknown;
    ocrSuccess?: unknown;
    ocrConfidence?: unknown;
    confidence?: unknown;
    ocrOutcome?: unknown;
    skipReason?: unknown;
    skipped?: unknown;
  } = input.extraction || {};
  const isImageMime = String(input.mimeType || "").startsWith("image/");
  const fullText = String(input.fullText || "");

  const ocrPageCount = Number.isFinite(Number(extraction.ocrPageCount))
    ? Number(extraction.ocrPageCount)
    : null;
  const ocrMode =
    typeof extraction.ocrMode === "string"
      ? String(extraction.ocrMode)
      : null;

  const ocrUsed = Boolean(
    extraction.ocrUsed ||
    extraction.ocrApplied ||
    (ocrPageCount ?? 0) > 0,
  );
  const ocrAttempted =
    typeof extraction.ocrAttempted === "boolean"
      ? Boolean(extraction.ocrAttempted)
      : ocrUsed;

  const ocrSuccess =
    typeof extraction.ocrSuccess === "boolean"
      ? Boolean(extraction.ocrSuccess)
      : ocrUsed && fullText.trim().length > 0;

  // Confidence should be recorded only when OCR was actually applied.
  const confidenceCandidate =
    extraction.ocrConfidence ??
    (ocrUsed && isImageMime ? extraction.confidence : null);
  const ocrConfidence = ocrUsed ? clamp01(confidenceCandidate) : null;

  const explicitOutcome = normalizeOutcome(extraction.ocrOutcome);
  if (explicitOutcome) {
    return {
      ocrAttempted,
      ocrUsed,
      ocrSuccess,
      ocrConfidence,
      ocrPageCount,
      ocrMode,
      ocrOutcome: explicitOutcome,
    };
  }

  const skipReason = String(extraction.skipReason || "");
  const skipped = Boolean(extraction.skipped);

  let ocrOutcome: OcrOutcome = "not_attempted";
  if (ocrSuccess) {
    ocrOutcome = "applied";
  } else if (skipped && skipReason) {
    ocrOutcome = inferOutcomeFromSkipReason(skipReason);
  } else if (ocrAttempted || ocrUsed) {
    ocrOutcome = "no_text";
  }

  return {
    ocrAttempted,
    ocrUsed,
    ocrSuccess,
    ocrConfidence,
    ocrPageCount,
    ocrMode,
    ocrOutcome,
  };
}
