/**
 * Shared MIME registry for ingestion/extraction/preview decisions.
 *
 * Keep this as the single source of truth to avoid drift between:
 * - upload acceptance
 * - extractor dispatch routing
 * - preview generation eligibility
 */

export const PDF_MIMES: readonly string[] = ["application/pdf"];

export const DOCX_MIMES: readonly string[] = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export const XLSX_MIMES: readonly string[] = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

export const PPTX_MIMES: readonly string[] = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
];

export const PREVIEW_CONVERTIBLE_OFFICE_MIMES: readonly string[] = [
  ...DOCX_MIMES,
  ...XLSX_MIMES,
  ...PPTX_MIMES,
];

const EXTRACTABLE_MIME_SET = new Set<string>([
  ...PDF_MIMES,
  ...DOCX_MIMES,
  ...XLSX_MIMES,
  ...PPTX_MIMES,
]);

const PREFERRED_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "application/vnd.ms-powerpoint": ".ppt",
};

export function normalizeMimeType(mimeType: string | null | undefined): string {
  const raw = String(mimeType || "").trim().toLowerCase();
  if (!raw) return "";
  const [baseType] = raw.split(";");
  return String(baseType || "").trim();
}

export function isPdfMime(mimeType: string): boolean {
  return PDF_MIMES.includes(normalizeMimeType(mimeType));
}

export function isDocxMime(mimeType: string): boolean {
  return DOCX_MIMES.includes(normalizeMimeType(mimeType));
}

export function isXlsxMime(mimeType: string): boolean {
  return XLSX_MIMES.includes(normalizeMimeType(mimeType));
}

export function isPptxMime(mimeType: string): boolean {
  return PPTX_MIMES.includes(normalizeMimeType(mimeType));
}

export function isTextMime(mimeType: string): boolean {
  return normalizeMimeType(mimeType).startsWith("text/");
}

export function isImageMime(mimeType: string): boolean {
  return normalizeMimeType(mimeType).startsWith("image/");
}

export function isMimeTypeSupportedForExtraction(mimeType: string): boolean {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return false;
  if (EXTRACTABLE_MIME_SET.has(normalized)) return true;
  if (normalized.startsWith("text/")) return true;
  if (normalized.startsWith("image/")) return true;
  return false;
}

export function needsPreviewPdfGenerationForMime(mimeType: string): boolean {
  const normalized = normalizeMimeType(mimeType);
  return PREVIEW_CONVERTIBLE_OFFICE_MIMES.includes(normalized);
}

export function getPreferredExtensionForMime(
  mimeType: string | null | undefined,
): string {
  const normalized = normalizeMimeType(mimeType);
  return PREFERRED_EXTENSION_BY_MIME[normalized] || "";
}
