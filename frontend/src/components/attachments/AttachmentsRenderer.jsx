// src/components/attachments/AttachmentsRenderer.jsx
import React, { useMemo } from "react";
import SourcePill from "./pills/SourcePill";
import FilePill from "./pills/FilePill";
import FolderPill from "./pills/FolderPill";

/**
 * AttachmentsRenderer.jsx (ChatGPT-parity, centralized)
 * ----------------------------------------------------
 * This is the ONE place that decides how to render any “attachment-like” payload:
 *  - source buttons/pills (assistant sources)
 *  - file pills (open/where/discover results)
 *  - folder pills
 *  - inline file lists (if you ever need list rendering)
 *
 * Design principles:
 *  - Input is normalized to a small internal shape
 *  - Rendering is deterministic
 *  - No "Sources:" label here (SourcesRow handles that label)
 *  - nav_pills behavior is enforced by parent (intro line only, no actions)
 *
 * Props:
 *  - attachments: array of attachment objects (any shape)
 *  - variant:
 *      - "sources"  => used below assistant messages (pill look)
 *      - "inline"   => used inside a chat message bubble (pill look)
 *  - onFileClick(attachment)
 *  - onFolderClick(attachment)
 *  - onSeeAllClick?(payload)
 *
 * Attachment normalized shape:
 *  {
 *    kind: "file"|"folder"|"source"|"unknown",
 *    id?: string,
 *    title?: string,
 *    filename?: string,
 *    mimeType?: string,
 *    url?: string,
 *    page?: number,
 *    slide?: number,
 *    sheet?: string,
 *    folderPath?: string,
 *    meta?: any
 *  }
 */

function normalizeAttachments(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];

  for (const raw of arr) {
    if (!raw) continue;

    // Already normalized?
    if (raw.kind) {
      out.push(raw);
      continue;
    }

    // Source buttons common shapes:
    // {docId,title,filename,mimeType,url,page,...}
    // {documentId,title,mimeType, ...}
    if (raw.docId || raw.documentId || raw.locationKey || raw.page || raw.slide || raw.sheet) {
      out.push({
        kind: "source",
        id: raw.docId || raw.documentId || raw.id,
        title: raw.title || raw.filename || raw.name,
        filename: raw.filename || raw.title || raw.name,
        mimeType: raw.mimeType,
        url: raw.url,
        page: raw.page,
        slide: raw.slide,
        sheet: raw.sheet,
        folderPath: raw.folderPath,
        meta: raw,
      });
      continue;
    }

    // Folder shapes:
    // {folderId,name,path} or {id,name,folderPath}
    if (raw.folderId || raw.path || raw.folderPath) {
      out.push({
        kind: "folder",
        id: raw.folderId || raw.id,
        title: raw.name || raw.title || raw.folderName,
        folderPath: raw.path || raw.folderPath,
        meta: raw,
      });
      continue;
    }

    // File shapes:
    // {id,filename,mimeType,url}
    if (raw.id || raw.filename || raw.mimeType) {
      out.push({
        kind: "file",
        id: raw.id,
        title: raw.title || raw.filename || raw.name,
        filename: raw.filename || raw.name || raw.title,
        mimeType: raw.mimeType || raw.type,
        url: raw.url,
        meta: raw,
      });
      continue;
    }

    out.push({ kind: "unknown", meta: raw });
  }

  // Dedupe (stable)
  const seen = new Set();
  const deduped = [];
  for (const a of out) {
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
    deduped.push(a);
  }

  return deduped;
}

export default function AttachmentsRenderer({
  attachments = [],
  variant = "sources",
  onFileClick,
  onFolderClick,
  onSeeAllClick,
  className = "",
  style = {},
}) {
  const items = useMemo(() => normalizeAttachments(attachments), [attachments]);

  if (!items.length) return null;

  return (
    <div className={`koda-attachments ${className}`} style={style}>
      <div className="koda-attachments-row">
        {items.map((a, idx) => {
          if (a.kind === "source") {
            return (
              <SourcePill
                key={`${a.id || "src"}-${a.locationKey || idx}`}
                source={a}
                variant={variant}
                onClick={() => {
                  // Prefer URL if present, otherwise call onFileClick
                  if (a.url) window.open(a.url, "_blank", "noopener,noreferrer");
                  else onFileClick?.(a);
                }}
              />
            );
          }

          if (a.kind === "folder") {
            return (
              <FolderPill
                key={`${a.id || "folder"}-${idx}`}
                folder={a}
                variant={variant}
                onClick={() => onFolderClick?.(a)}
              />
            );
          }

          if (a.kind === "file") {
            return (
              <FilePill
                key={`${a.id || "file"}-${idx}`}
                file={a}
                variant={variant}
                onClick={() => {
                  if (a.url) window.open(a.url, "_blank", "noopener,noreferrer");
                  else onFileClick?.(a);
                }}
              />
            );
          }

          return null;
        })}
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
.koda-attachments{
  display: block;
  width: 100%;
}

.koda-attachments-row{
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
`;
