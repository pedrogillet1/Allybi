import React from "react";

/**
 * InlineNavPill.jsx
 *
 * ChatGPT-like inline “source pill” used under messages.
 * - Renders as a rounded pill with an optional file-type icon and truncated filename
 * - Keyboard accessible
 * - No extra microcopy
 *
 * Props:
 * - label: string (display text, usually filename)
 * - icon?: ReactNode (optional icon element)
 * - onClick?: () => void
 * - href?: string (optional link; if present uses <a>)
 * - title?: string (optional tooltip override)
 * - className?: string
 * - style?: object
 */

export default function InlineNavPill({
  label,
  icon,
  onClick,
  href,
  title,
  className = "",
  style = {},
}) {
  const safeLabel = String(label ?? "").trim() || "Untitled";

  const content = (
    <>
      {icon ? <span className="koda-source-pill__icon">{icon}</span> : null}
      <span className="koda-source-pill__text">{safeLabel}</span>
    </>
  );

  // Link mode
  if (href) {
    return (
      <a
        className={`koda-source-pill ${className}`}
        style={style}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title || safeLabel}
        aria-label={safeLabel}
      >
        {content}
      </a>
    );
  }

  // Button mode
  return (
    <button
      type="button"
      className={`koda-source-pill ${className}`}
      style={style}
      onClick={onClick}
      title={title || safeLabel}
      aria-label={safeLabel}
    >
      {content}
    </button>
  );
}
