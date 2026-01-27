// src/components/attachments/inline/InlineFolderButton.jsx
import React, { useMemo } from "react";
import folderIcon from "../../../assets/folder_icon.svg";
import "./InlineFolderButton.css";

/**
 * InlineFolderButton.jsx (ChatGPT-parity, in-message)
 * --------------------------------------------------
 * Folder button that appears inline inside chat content (not the Sources row).
 * Matches the same “readable button” style as InlineDocumentButton:
 *  - folder icon (folder_icon.svg)
 *  - folder label with ellipsis
 *  - subtle hover
 *
 * Props:
 *  - folder: {
 *      id?, folderId?,
 *      name?, title?,
 *      path?, folderPath?,
 *      count? (optional)
 *    }
 *  - onOpen: (folder) => void
 *  - variant: "inline" | "compact"
 */

function getFolderName(folder) {
  return folder?.name || folder?.title || folder?.folderName || folder?.path || folder?.folderPath || "Folder";
}

export default function InlineFolderButton({
  folder,
  onOpen,
  variant = "inline",
  className = "",
  style = {},
}) {
  const name = useMemo(() => getFolderName(folder), [folder]);
  const id = folder?.id || folder?.folderId || null;
  const folderPath = folder?.path || folder?.folderPath || null;

  const count = typeof folder?.count === "number" ? folder.count : null;

  return (
    <button
      type="button"
      className={`koda-inline-folder-btn ${variant === "compact" ? "koda-inline-folder-btn-compact" : ""} ${className}`}
      onClick={() => onOpen?.({ ...folder, id, folderPath })}
      title={name}
      aria-label={`Open folder ${name}`}
      style={style}
    >
      <span className="koda-inline-folder-icon" aria-hidden="true">
        <img src={folderIcon} alt="" />
      </span>

      <span className="koda-inline-folder-text">{name}</span>

      {count != null ? <span className="koda-inline-folder-count">{count}</span> : null}

      <span className="koda-inline-folder-arrow" aria-hidden="true">›</span>
    </button>
  );
}
