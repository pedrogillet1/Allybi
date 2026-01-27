import React from "react";
import InlineNavPill from "./InlineNavPill";

/**
 * FolderPill.jsx
 *
 * ChatGPT-like folder pill (rounded outline) using an assets-folder icon.
 *
 * Props:
 * - folder: {
 *    id?: string
 *    name?: string
 *    title?: string
 *    path?: string
 *    url?: string
 *  }
 * - onOpen?: (folder) => void
 * - className?: string
 * - style?: object
 */

import FolderIcon from "../assets/folder.svg";

export default function FolderPill({ folder, onOpen, className = "", style = {} }) {
  const label = String(folder?.name || folder?.title || folder?.path || "Untitled").trim() || "Untitled";
  const href = folder?.url || null;

  const icon = (
    <span className="koda-source-pill__icon" aria-hidden="true">
      <img src={FolderIcon} alt="" />
    </span>
  );

  const handleClick = () => onOpen?.(folder);

  return (
    <InlineNavPill
      label={label}
      icon={icon}
      href={!onOpen ? href : undefined}
      onClick={onOpen ? handleClick : undefined}
      className={className}
      style={style}
      title={label}
    />
  );
}
