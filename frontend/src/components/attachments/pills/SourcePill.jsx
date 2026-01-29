import React from "react";
import InlineNavPill from "./InlineNavPill";

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

export default function SourcePill({ source, onOpen, className = "", style = {} }) {
  const filename = String(source?.filename || source?.title || "Untitled").trim() || "Untitled";
  const href = source?.url || null;

  const icon = <FileTypeIcon mimeType={source?.mimeType} fileType={source?.fileType} filename={filename} />;

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
      style={{ width: 30, height: 30, borderRadius: 3, objectFit: "contain", flexShrink: 0 }}
      aria-hidden="true"
    />
  );
}

function getExt(name) {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  return n.slice(i + 1).toLowerCase();
}
