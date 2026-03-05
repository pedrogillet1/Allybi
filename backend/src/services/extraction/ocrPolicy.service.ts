export type PptxParseFailurePolicy = "warn" | "fail";

export const OCR_DEFAULT_CONFIDENCE_FALLBACK = 0.5;
export const OCR_MIN_DOCUMENT_TEXT_CONFIDENCE = 0.7;

export const OCR_MIN_IMAGE_SIZE_BYTES = 10 * 1024; // 10KB
export const OCR_MIN_IMAGE_EDGE = 48;
export const OCR_MIN_IMAGE_PIXELS = 48 * 48;
export const OCR_LOW_VARIANCE_STDEV_THRESHOLD = 4.5;
export const OCR_LOW_ENTROPY_THRESHOLD = 1.15;

export const PPTX_IMAGE_OCR_LIMIT = 10;
export const MIN_PPTX_IMAGE_OCR_TEXT_LEN = 10;
export const DEFAULT_PPTX_IMAGE_OCR_MIN_CONFIDENCE = 0.6;
export const DEFAULT_PPTX_SLIDE_PARSE_FAILURE_POLICY: PptxParseFailurePolicy =
  "warn";
export const DEFAULT_PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO = 0.25;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function resolveImageOcrConfidence(
  confidence: unknown,
): { confidence: number; estimated: boolean } {
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    return { confidence: clamp01(confidence), estimated: false };
  }
  return { confidence: OCR_DEFAULT_CONFIDENCE_FALLBACK, estimated: true };
}

export function resolvePptxImageOcrMinConfidence(): number {
  const parsed = Number(process.env.PPTX_IMAGE_OCR_MIN_CONFIDENCE);
  if (!Number.isFinite(parsed)) return DEFAULT_PPTX_IMAGE_OCR_MIN_CONFIDENCE;
  return clamp01(parsed);
}

export function resolvePptxParseFailurePolicy(): PptxParseFailurePolicy {
  const raw = String(
    process.env.PPTX_SLIDE_PARSE_FAILURE_POLICY ||
      DEFAULT_PPTX_SLIDE_PARSE_FAILURE_POLICY,
  )
    .trim()
    .toLowerCase();
  return raw === "fail" ? "fail" : "warn";
}

export function resolvePptxParseFailureMaxRatio(): number {
  const parsed = Number(process.env.PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO);
  if (!Number.isFinite(parsed))
    return DEFAULT_PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO;
  return clamp01(parsed);
}

