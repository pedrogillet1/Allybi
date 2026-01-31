import React from "react";
import InlineNavPill from "./InlineNavPill";
import cleanDocumentName from "../../../utils/cleanDocumentName";

// Asset file-type icons
import pdfIcon from "../../../assets/pdf.svg";
import docIcon from "../../../assets/doc-icon.png";
import jpgIcon from "../../../assets/jpg-icon.png";
import pngIcon from "../../../assets/png-icon.png";
import txtIcon from "../../../assets/txt-icon.png";
import xlsIcon from "../../../assets/xls.png";
import pptxIcon from "../../../assets/pptx.png";
import movIcon from "../../../assets/mov.png";
import mp4Icon from "../../../assets/mp4.png";
import mp3Icon from "../../../assets/mp3.svg";

/**
 * SourcePill.jsx
 *
 * Small wrapper around InlineNavPill that:
 * - Picks the correct file icon based on file type
 * - Uses filename as label (truncated by CSS)
 * - Calls onOpen(source) when clicked
 */

/** Clean source name for display */
const cleanDisplayName = cleanDocumentName;

export default function SourcePill({ source, onOpen, className = "", style = {} }) {
  const rawName = String(source?.filename || source?.title || "Untitled").trim() || "Untitled";
  const filename = cleanDisplayName(rawName) || "Untitled";
  const href = source?.url || null;

  const icon = source?.type === 'folder'
    ? <FolderIcon />
    : <FileTypeIcon mimeType={source?.mimeType} fileType={source?.fileType} filename={filename} />;

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

export function FileTypeIcon({ mimeType, fileType, filename }) {
  const type = (fileType || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  const ext = getExt(filename);

  const kind =
    type ||
    (ext === "pdf" ? "pdf" : "") ||
    (["doc", "docx"].includes(ext) ? "doc" : "") ||
    (["png"].includes(ext) ? "png" : "") ||
    (["jpg", "jpeg"].includes(ext) ? "jpg" : "") ||
    (["xls", "xlsx", "csv"].includes(ext) ? "xls" : "") ||
    (["ppt", "pptx"].includes(ext) ? "pptx" : "") ||
    (["txt"].includes(ext) ? "txt" : "") ||
    (["mov"].includes(ext) ? "mov" : "") ||
    (["mp4"].includes(ext) ? "mp4" : "") ||
    (["mp3", "wav", "aac"].includes(ext) ? "mp3" : "") ||
    (["webp"].includes(ext) ? "png" : "") ||
    (mime.includes("pdf") ? "pdf" : "") ||
    (mime.includes("word") ? "doc" : "") ||
    (mime.includes("spreadsheet") || mime.includes("excel") ? "xls" : "") ||
    (mime.includes("presentation") || mime.includes("powerpoint") ? "pptx" : "") ||
    (mime.includes("text/plain") ? "txt" : "") ||
    (mime.startsWith("image/png") ? "png" : "") ||
    (mime.startsWith("image/jpeg") ? "jpg" : "") ||
    (mime.startsWith("image/") ? "jpg" : "") ||
    (mime.startsWith("video/mp4") ? "mp4" : "") ||
    (mime.startsWith("video/") ? "mov" : "") ||
    (mime.startsWith("audio/") ? "mp3" : "") ||
    "file";

  const iconMap = {
    pdf: pdfIcon,
    doc: docIcon,
    jpg: jpgIcon,
    png: pngIcon,
    txt: txtIcon,
    xls: xlsIcon,
    pptx: pptxIcon,
    mov: movIcon,
    mp4: mp4Icon,
    mp3: mp3Icon,
  };

  const src = iconMap[kind] || pdfIcon;

  return (
    <img
      src={src}
      alt=""
      style={{ width: 30, height: 30, borderRadius: 3, objectFit: "contain", flexShrink: 0, imageRendering: '-webkit-optimize-contrast' }}
      aria-hidden="true"
    />
  );
}

function FolderIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" style={{ flexShrink: 0 }} shapeRendering="geometricPrecision">
      <rect width="30" height="30" rx="3" fill="#F3F4F6"/>
      <path d="M7 11C7 10.2 7.3 9.5 7.9 8.9C8.5 8.3 9.2 8 10 8H12L14 10H20C20.8 10 21.5 10.3 22.1 10.9C22.7 11.5 23 12.2 23 13V19C23 19.8 22.7 20.5 22.1 21.1C21.5 21.7 20.8 22 20 22H10C9.2 22 8.5 21.7 7.9 21.1C7.3 20.5 7 19.8 7 19V11Z" fill="#9CA3AF"/>
    </svg>
  );
}

export function getExt(name) {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  return n.slice(i + 1).toLowerCase();
}
