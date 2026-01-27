// src/components/attachments/utils/attachmentMapper.js
import { AttachmentKind } from "./attachmentTypes";

/**
 * attachmentMapper.js (Koda, ChatGPT-parity)
 * -----------------------------------------
 * Converts many possible backend shapes into ONE canonical attachment shape
 * used by AttachmentsRenderer + pills/buttons.
 *
 * Inputs we commonly see:
 *  - ragSources: [{ docId, title, filename, mimeType, page, url }]
 *  - sourceButtons: { buttons: [{ documentId, title, mimeType }], seeAll: {...} }
 *  - file_action metadata: { files: [{ id, filename, mimeType, folderPath }] }
 *  - folder objects: { folderId, name, path, count }
 *
 * Output canonical:
 *  {
 *    kind: "source"|"file"|"folder"|"unknown",
 *    id, title, filename, mimeType, url,
 *    page, slide, sheet, folderPath, count,
 *    meta
 *  }
 */

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function isArray(x) {
  return Array.isArray(x);
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const a of items) {
    if (!a) continue;
    const key = [
      a.kind,
      a.id || "",
      a.filename || "",
      a.title || "",
      a.page ?? "",
      a.slide ?? "",
      a.sheet ?? "",
      a.folderPath || "",
      a.url || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

export function toCanonicalAttachment(raw) {
  if (!raw) return { kind: AttachmentKind.UNKNOWN, meta: raw };

  if (raw.kind) return raw;

  // SOURCE-like
  if (raw.docId || raw.documentId || raw.locationKey || raw.page || raw.slide || raw.sheet) {
    return {
      kind: AttachmentKind.SOURCE,
      id: raw.docId || raw.documentId || raw.id,
      title: raw.title || raw.filename || raw.name,
      filename: raw.filename || raw.title || raw.name,
      mimeType: raw.mimeType || raw.type,
      url: raw.url,
      page: raw.page,
      slide: raw.slide,
      sheet: raw.sheet,
      folderPath: raw.folderPath,
      meta: raw,
    };
  }

  // FOLDER-like
  if (raw.folderId || raw.path || raw.folderPath) {
    return {
      kind: AttachmentKind.FOLDER,
      id: raw.folderId || raw.id,
      title: raw.name || raw.title || raw.folderName || safeString(raw.path || raw.folderPath),
      folderPath: raw.path || raw.folderPath,
      count: typeof raw.count === "number" ? raw.count : undefined,
      meta: raw,
    };
  }

  // FILE-like
  if (raw.id || raw.filename || raw.mimeType) {
    return {
      kind: AttachmentKind.FILE,
      id: raw.id,
      title: raw.title || raw.filename || raw.name,
      filename: raw.filename || raw.name || raw.title,
      mimeType: raw.mimeType || raw.type,
      url: raw.url,
      folderPath: raw.folderPath,
      meta: raw,
    };
  }

  return { kind: AttachmentKind.UNKNOWN, meta: raw };
}

/**
 * Normalize arrays coming from different fields.
 */
export function mapAttachments(input) {
  const arr = isArray(input) ? input : [];
  return dedupe(arr.map(toCanonicalAttachment));
}

/**
 * Convert a "sourceButtons" payload into canonical attachments.
 * sourceButtons: { buttons: [{documentId,title,mimeType,url?}], seeAll? }
 */
export function mapSourceButtons(sourceButtons) {
  if (!sourceButtons || typeof sourceButtons !== "object") return { items: [], seeAll: null };

  const buttons = isArray(sourceButtons.buttons) ? sourceButtons.buttons : [];
  const items = dedupe(
    buttons.map((b) => ({
      kind: AttachmentKind.SOURCE,
      id: b.documentId || b.docId || b.id,
      title: b.title || b.filename || b.name,
      filename: b.filename || b.title || b.name,
      mimeType: b.mimeType,
      url: b.url,
      meta: b,
    }))
  );

  const seeAll = sourceButtons.seeAll || null;
  return { items, seeAll };
}

/**
 * Convert "file_action" metadata into canonical attachments.
 * metadata: { files: [{id, filename, mimeType, folderPath}] }
 */
export function mapFileAction(meta) {
  if (!meta || typeof meta !== "object") return [];

  const files = isArray(meta.files) ? meta.files : [];
  return dedupe(
    files.map((f) => ({
      kind: AttachmentKind.FILE,
      id: f.id,
      title: f.filename || f.name,
      filename: f.filename || f.name,
      mimeType: f.mimeType || f.type,
      folderPath: f.folderPath,
      meta: f,
    }))
  );
}
