// src/components/attachments/inline/InlineDocumentButton.jsx
import React, { useMemo } from "react";
import FileIcons from "../../FileIcons";

/**
 * InlineDocumentButton.jsx (ChatGPT-parity, in-message)
 * ----------------------------------------------------
 * This is the “button that appears in the place of the chat”
 * (inside the assistant message body area), matching your screenshot style:
 *
 *  - a short intro line can be rendered by the message (not here)
 *  - this button is readable, pill-like, slightly larger than source pills
 *  - uses your custom SVG icon set via FileIcons
 *
 * Props:
 *  - document: {
 *      id, docId, documentId,
 *      title?, filename?, name?,
 *      mimeType?
 *    }
 *  - onOpen: (document) => void
 *  - variant: "inline" | "compact" (inline is default)
 */

function displayName(doc) {
  return doc?.title || doc?.filename || doc?.name || "Document";
}

function extFrom(doc) {
  const name = displayName(doc);
  const mime = doc?.mimeType || doc?.type || "";

  const dot = String(name).lastIndexOf(".");
  if (dot !== -1 && dot < String(name).length - 1) return String(name).slice(dot + 1).toLowerCase();

  const m = String(mime).toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("sheet")) return "xlsx";
  if (m.includes("presentation") || m.includes("powerpoint")) return "pptx";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.startsWith("image/")) return m.split("/")[1] || "img";
  if (m.includes("text/markdown")) return "md";
  if (m.includes("text/plain")) return "txt";
  return "";
}

export default function InlineDocumentButton({
  document,
  onOpen,
  variant = "inline",
  className = "",
  style = {},
}) {
  const name = useMemo(() => displayName(document), [document]);
  const mimeType = document?.mimeType || document?.type || "";
  const ext = useMemo(() => extFrom(document), [document]);

  const id = document?.id || document?.docId || document?.documentId || null;

  return (
    <button
      type="button"
      className={`koda-inline-doc-btn ${variant === "compact" ? "koda-inline-doc-btn-compact" : ""} ${className}`}
      onClick={() => onOpen?.({ ...document, id })}
      title={name}
      aria-label={`Open ${name}`}
      style={style}
    >
      <span className="koda-inline-doc-icon" aria-hidden="true">
        <FileIcons mimeType={mimeType} ext={ext} size={18} />
      </span>

      <span className="koda-inline-doc-text">{name}</span>

      <span className="koda-inline-doc-arrow" aria-hidden="true">›</span>

      <style>{css}</style>
    </button>
  );
}

const css = `
.koda-inline-doc-btn{
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(24, 24, 24, 0.55);
  cursor: pointer;
  max-width: min(640px, 92vw);
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  user-select: none;
}

.koda-inline-doc-btn:hover{
  background: rgba(0,0,0,0.02);
  border-color: rgba(24, 24, 24, 0.70);
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}

.koda-inline-doc-btn:active{
  transform: scale(0.99);
}

.koda-inline-doc-btn-compact{
  padding: 8px 12px;
  border-radius: 12px;
}

.koda-inline-doc-icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex: 0 0 auto;
}

.koda-inline-doc-text{
  font-size: 14px;
  font-weight: 600;
  color: rgba(0,0,0,0.88);
  line-height: 1.15;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.koda-inline-doc-arrow{
  margin-left: 2px;
  font-size: 18px;
  line-height: 1;
  color: rgba(0,0,0,0.45);
  flex: 0 0 auto;
}

@media (max-width: 520px){
  .koda-inline-doc-text{ max-width: 240px; }
}
`;
