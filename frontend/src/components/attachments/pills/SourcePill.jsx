import React from "react";
import InlineNavPill from "./InlineNavPill";

/**
 * SourcePill.jsx
 *
 * Small wrapper around InlineNavPill that:
 * - Picks the correct file icon based on file type
 * - Uses filename as label (truncated by CSS)
 * - Calls onOpen(source) when clicked
 *
 * Props:
 * - source: {
 *     id?: string
 *     title?: string
 *     filename?: string
 *     url?: string
 *     mimeType?: string
 *     fileType?: string
 *   }
 * - onOpen?: (source) => void
 * - className?: string
 * - style?: object
 */

export default function SourcePill({ source, onOpen, className = "", style = {} }) {
  const filename = String(source?.filename || source?.title || "Untitled").trim() || "Untitled";
  const href = source?.url || null;

  const icon = <FileTypeIcon mimeType={source?.mimeType} fileType={source?.fileType} filename={filename} />;

  // If we have an href but also want to intercept for in-app preview, prefer onOpen.
  const handleClick = () => onOpen?.(source);

  return (
    <InlineNavPill
      label={filename}
      icon={icon}
      href={!onOpen ? href : undefined}
      onClick={onOpen ? handleClick : undefined}
      className={className}
      style={style}
      title={filename}
    />
  );
}

/* ------------------------- Icons ------------------------- */

function FileTypeIcon({ mimeType, fileType, filename }) {
  const type = (fileType || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  const ext = getExt(filename);

  const kind =
    type ||
    (ext === "pdf" ? "pdf" : "") ||
    (["doc", "docx"].includes(ext) ? "doc" : "") ||
    (["png", "jpg", "jpeg", "webp"].includes(ext) ? "img" : "") ||
    (["xls", "xlsx", "csv"].includes(ext) ? "sheet" : "") ||
    (["ppt", "pptx"].includes(ext) ? "slides" : "") ||
    (mime.includes("pdf") ? "pdf" : "") ||
    (mime.includes("word") ? "doc" : "") ||
    (mime.includes("spreadsheet") || mime.includes("excel") ? "sheet" : "") ||
    (mime.includes("presentation") || mime.includes("powerpoint") ? "slides" : "") ||
    (mime.startsWith("image/") ? "img" : "") ||
    "file";

  switch (kind) {
    case "pdf":
      return <PdfBadge />;
    case "doc":
      return <DocBadge />;
    case "sheet":
      return <SheetBadge />;
    case "slides":
      return <SlidesBadge />;
    case "img":
      return <ImageBadge />;
    default:
      return <GenericBadge />;
  }
}

function getExt(name) {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  return n.slice(i + 1).toLowerCase();
}

/* Badge style matches the screenshot (small rounded-square with label) */

function Badge({ bg, label }) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        background: bg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#FFFFFF",
        fontSize: 10,
        fontWeight: 800,
        fontFamily: "Plus Jakarta Sans",
        letterSpacing: 0.3,
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

function PdfBadge() {
  return <Badge bg="#C2410C" label="PDF" />;
}

function DocBadge() {
  return <Badge bg="#1D4ED8" label="DOC" />;
}

function SheetBadge() {
  return <Badge bg="#15803D" label="XLS" />;
}

function SlidesBadge() {
  return <Badge bg="#B45309" label="PPT" />;
}

function ImageBadge() {
  return <Badge bg="#6D28D9" label="IMG" />;
}

function GenericBadge() {
  return <Badge bg="#334155" label="FILE" />;
}
