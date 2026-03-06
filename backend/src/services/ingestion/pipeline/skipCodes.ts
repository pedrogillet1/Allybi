export const KNOWN_SKIP_CODES = [
  "NO_TEXT_CONTENT",
  "PDF_TEXT_EMPTY",
  "DOCX_TEXT_EMPTY",
  "XLSX_TEXT_EMPTY",
  "PPTX_TEXT_EMPTY",
  "TEXT_FILE_EMPTY",
  "IMAGE_VISUAL_ONLY",
  "IMAGE_OCR_EMPTY",
  "OCR_REQUIRED_UNAVAILABLE",
  "FILE_INVALID",
  "UNSUPPORTED_TYPE",
  "FILE_TOO_LARGE",
  "FILE_CORRUPTED",
  "FILE_EMPTY",
  "HEADER_MISMATCH",
  "PASSWORD_PROTECTED",
  "OCR_QUALITY_LOW",
] as const;

export type SkipCode = (typeof KNOWN_SKIP_CODES)[number];

const KNOWN_SKIP_CODE_SET = new Set<string>(KNOWN_SKIP_CODES);

export function isKnownSkipCode(value: unknown): value is SkipCode {
  return typeof value === "string" && KNOWN_SKIP_CODE_SET.has(value);
}

export function toSkipCode(
  value: unknown,
  fallback: SkipCode = "FILE_INVALID",
): SkipCode {
  if (isKnownSkipCode(value)) return value;
  return fallback;
}
