import React, { useMemo } from "react";
import InlineNavPill from "./InlineNavPill";

/**
 * FilePill.jsx
 *
 * ChatGPT-like file pill that uses your existing assets-folder icons.
 *
 * Props:
 * - file: {
 *    id?: string
 *    filename?: string
 *    title?: string
 *    url?: string
 *    mimeType?: string
 *    fileType?: string
 *  }
 * - onOpen?: (file) => void   // in-app preview/open handler
 * - className?: string
 * - style?: object
 */

import PdfIcon from "../../assets/pdf.svg";
import DocIcon from "../../assets/doc.svg";
import SheetIcon from "../../assets/sheet.svg";
import SlidesIcon from "../../assets/slides.svg";
import ImageIcon from "../../assets/image.svg";
import FileIcon from "../../assets/file.svg";

export default function FilePill({ file, onOpen, className = "", style = {} }) {
  const filename = String(file?.filename || file?.title || "Untitled").trim() || "Untitled";
  const href = file?.url || null;

  const iconSrc = useMemo(() => {
    const ext = getExt(filename);
    const mime = String(file?.mimeType || "").toLowerCase();
    const type = String(file?.fileType || "").toLowerCase();

    const kind =
      type ||
      (ext === "pdf" ? "pdf" : "") ||
      (["doc", "docx"].includes(ext) ? "doc" : "") ||
      (["xls", "xlsx", "csv"].includes(ext) ? "sheet" : "") ||
      (["ppt", "pptx"].includes(ext) ? "slides" : "") ||
      (["png", "jpg", "jpeg", "webp"].includes(ext) ? "img" : "") ||
      (mime.includes("pdf") ? "pdf" : "") ||
      (mime.includes("word") ? "doc" : "") ||
      (mime.includes("spreadsheet") || mime.includes("excel") ? "sheet" : "") ||
      (mime.includes("presentation") || mime.includes("powerpoint") ? "slides" : "") ||
      (mime.startsWith("image/") ? "img" : "") ||
      "file";

    switch (kind) {
      case "pdf":
        return PdfIcon;
      case "doc":
        return DocIcon;
      case "sheet":
        return SheetIcon;
      case "slides":
        return SlidesIcon;
      case "img":
        return ImageIcon;
      default:
        return FileIcon;
    }
  }, [filename, file?.mimeType, file?.fileType]);

  const icon = (
    <span className="koda-source-pill__icon" aria-hidden="true">
      <img src={iconSrc} alt="" />
    </span>
  );

  const handleClick = () => onOpen?.(file);

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

function getExt(name) {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  return n.slice(i + 1).toLowerCase();
}
