/**
 * Extract a file extension from a filename or MIME type.
 */
export function extFromFilename(filename = "", mimeType = "") {
  const f = String(filename || "");
  const dot = f.lastIndexOf(".");
  if (dot !== -1 && dot < f.length - 1) return f.slice(dot + 1).toLowerCase();

  const m = String(mimeType || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("sheet")) return "xlsx";
  if (m.includes("presentation") || m.includes("powerpoint")) return "pptx";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.startsWith("image/")) return m.split("/")[1] || "img";
  if (m.includes("text/markdown")) return "md";
  if (m.includes("text/plain")) return "txt";
  return "";
}

/**
 * Normalize a source/attachment object into a consistent shape.
 */
export function normalizeAttachment(src) {
  if (!src) return null;
  return {
    id: src.docId || src.documentId || src.id,
    title: src.title || src.filename || src.name || "Document",
    filename: src.filename || src.title || src.name,
    mimeType: src.mimeType || "application/octet-stream",
    url: src.url || null,
    page: src.page || null,
    slide: src.slide || null,
    sheet: src.sheet || null,
  };
}
