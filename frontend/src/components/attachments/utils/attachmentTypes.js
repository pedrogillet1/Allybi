/**
 * attachmentHelpers.js
 *
 * Small, deterministic helpers for Koda message attachments and source pills.
 * - No user-facing microcopy
 * - No network calls
 *
 * Expected “attachment/source” shape (flexible):
 * {
 *   id?: string,
 *   title?: string,
 *   filename?: string,
 *   url?: string,
 *   previewUrl?: string,
 *   mimeType?: string,
 *   fileType?: string,   // optional normalized kind
 *   sizeBytes?: number,
 *   createdAt?: string,
 *   updatedAt?: string
 * }
 */

import PdfIcon from "../assets/pdf.svg";
import DocIcon from "../assets/doc.svg";
import SheetIcon from "../assets/sheet.svg";
import SlidesIcon from "../assets/slides.svg";
import ImageIcon from "../assets/image.svg";
import FolderIcon from "../assets/folder.svg";
import FileIcon from "../assets/file.svg";

/** ---------- Type detection ---------- */

export function getExtension(name) {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  return n.slice(i + 1).toLowerCase();
}

/**
 * Normalize an attachment/file “kind” from fileType/mimeType/extension.
 * Returns one of: pdf | doc | sheet | slides | image | folder | file
 */
export function getFileKind({ fileType, mimeType, filename, isFolder } = {}) {
  if (isFolder) return "folder";

  const type = String(fileType || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  const ext = getExtension(filename);

  const kind =
    type ||
    (ext === "pdf" ? "pdf" : "") ||
    (["doc", "docx"].includes(ext) ? "doc" : "") ||
    (["xls", "xlsx", "csv"].includes(ext) ? "sheet" : "") ||
    (["ppt", "pptx"].includes(ext) ? "slides" : "") ||
    (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? "image" : "") ||
    (mime.includes("pdf") ? "pdf" : "") ||
    (mime.includes("word") ? "doc" : "") ||
    (mime.includes("spreadsheet") || mime.includes("excel") ? "sheet" : "") ||
    (mime.includes("presentation") || mime.includes("powerpoint") ? "slides" : "") ||
    (mime.startsWith("image/") ? "image" : "") ||
    "file";

  // normalize aliases
  if (kind === "img") return "image";
  return kind;
}

/** ---------- Icon resolution ---------- */

export function getKindIcon(kind) {
  switch (kind) {
    case "pdf":
      return PdfIcon;
    case "doc":
      return DocIcon;
    case "sheet":
      return SheetIcon;
    case "slides":
      return SlidesIcon;
    case "image":
      return ImageIcon;
    case "folder":
      return FolderIcon;
    default:
      return FileIcon;
  }
}

export function getFileIconSrc(file) {
  const kind = getFileKind({
    fileType: file?.fileType,
    mimeType: file?.mimeType,
    filename: file?.filename || file?.title,
    isFolder: !!file?.isFolder,
  });
  return getKindIcon(kind);
}

/** ---------- Label / formatting ---------- */

export function normalizeLabel(file) {
  const label = String(file?.filename || file?.title || file?.path || "Untitled").trim();
  if (!label) return "Untitled";
  return label.length > 80 ? label.slice(0, 80) + "…" : label;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

/** ---------- Sorting / grouping ---------- */

export function sortByUpdatedDesc(list) {
  return [...(list || [])].sort((a, b) => {
    const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return tb - ta;
  });
}

/**
 * Deduplicate by id if present, else by (filename+url).
 * Keeps first occurrence (deterministic).
 */
export function dedupeAttachments(list) {
  const seen = new Set();
  const out = [];
  for (const it of list || []) {
    const key = it?.id
      ? `id:${it.id}`
      : `f:${String(it?.filename || it?.title || "").toLowerCase()}|u:${String(it?.url || "").toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** ---------- Navigation helpers ---------- */

export function isExternalUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function getOpenUrl(file) {
  // Prefer previewUrl for in-app preview if provided; else url
  return file?.previewUrl || file?.url || null;
}
