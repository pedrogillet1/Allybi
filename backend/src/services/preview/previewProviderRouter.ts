/**
 * Preview Provider Router
 *
 * Determines which cloud service to use for preview PDF generation
 * based on document MIME type. Routes:
 *   - PPTX → Google Slides (when configured) or CloudConvert
 *   - DOCX/XLSX/etc → CloudConvert
 *   - PDF/TXT/MD/CSV → NONE (no preview needed)
 */

export enum PreviewProvider {
  CLOUDCONVERT = "cloudconvert",
  GOOGLE_SLIDES = "google_slides",
  NONE = "none",
}

// File extensions that don't need preview conversion
const SKIP_EXTENSIONS = ["txt", "md", "csv", "json", "xml", "html", "htm"];

// MIME types that are already viewable natively (no conversion needed)
const NATIVE_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const PPTX_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
];

/**
 * Choose the best preview provider for a given MIME type.
 *
 * Priority for PPTX:
 *   1. Google Slides API (if GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_SLIDES_FOLDER_ID set)
 *   2. CloudConvert (fallback)
 *
 * Everything else that needs conversion → CloudConvert.
 */
export function choosePreviewProvider(
  mimeType: string,
  filename?: string,
): PreviewProvider {
  // Skip native formats
  if (NATIVE_MIME_TYPES.includes(mimeType)) {
    return PreviewProvider.NONE;
  }

  // Skip by extension
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && SKIP_EXTENSIONS.includes(ext)) {
      return PreviewProvider.NONE;
    }
  }

  // PPTX: prefer Google Slides when configured
  if (PPTX_MIME_TYPES.includes(mimeType)) {
    const hasGoogleSlides = !!(
      process.env.GOOGLE_APPLICATION_CREDENTIALS &&
      process.env.GOOGLE_SLIDES_FOLDER_ID
    );
    return hasGoogleSlides
      ? PreviewProvider.GOOGLE_SLIDES
      : PreviewProvider.CLOUDCONVERT;
  }

  // All other Office formats → CloudConvert
  if (
    mimeType.startsWith("application/vnd.openxmlformats") ||
    mimeType.startsWith("application/vnd.ms-") ||
    mimeType === "application/msword" ||
    mimeType === "application/rtf" ||
    mimeType.startsWith("application/vnd.oasis.opendocument")
  ) {
    return PreviewProvider.CLOUDCONVERT;
  }

  return PreviewProvider.NONE;
}
