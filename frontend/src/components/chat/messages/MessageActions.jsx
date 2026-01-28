// src/components/chat/MessageActions.jsx
import React, { useMemo, useState, useCallback } from "react";

/**
 * MessageActions.jsx (ChatGPT-parity)
 * ----------------------------------
 * Actions under assistant messages:
 *  - Copy
 *  - Regenerate (optional)
 *
 * Notes:
 *  - Parent should hide this for nav_pills mode and while streaming.
 *
 * Props:
 *  - message: { id, role, content }
 *  - onCopy?: (message) => void
 *  - onRegenerate?: (messageId) => void
 *  - isRegenerating?: boolean
 *  - className?: string
 *  - style?: object
 */

export default function MessageActions({
  message,
  onCopy,
  onRegenerate,
  isRegenerating = false,
  className = "",
  style = {},
}) {
  const canCopy =
    message?.role === "assistant" && (message?.content || "").trim().length > 0;

  const actions = useMemo(() => {
    const a = [];
    if (canCopy) a.push("copy");
    if (typeof onRegenerate === "function") a.push("regen");
    return a;
  }, [canCopy, onRegenerate]);

  if (!actions.length) return null;

  return (
    <div
      className={`koda-msg-actions ${className}`}
      style={style}
      role="group"
      aria-label="Message actions"
    >
      {actions.includes("copy") ? (
        <CopyAction
          message={message}
          onCopy={onCopy}
        />
      ) : null}

      {actions.includes("regen") ? (
        <IconButton
          label={isRegenerating ? "Regenerating…" : "Regenerate"}
          disabled={isRegenerating}
          onClick={() => onRegenerate?.(message?.id)}
        >
          <RefreshIcon spinning={isRegenerating} />
        </IconButton>
      ) : null}

      <style>{css}</style>
    </div>
  );
}

function CopyAction({ message, onCopy }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (typeof onCopy === "function") {
      onCopy(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      return;
    }

    const ok = await copyToClipboard(message?.content);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }, [message, onCopy]);

  return (
    <IconButton label={copied ? "Copied" : "Copy"} onClick={handleCopy}>
      <CopyIcon />
    </IconButton>
  );
}

function IconButton({ label, onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      className="koda-action-btn"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    return true;
  } catch {
    // fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = String(text || "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M5 15V7a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function RefreshIcon({ spinning = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={spinning ? "koda-spin" : ""}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

const css = `
.koda-msg-actions{
  display:flex;
  align-items:center;
  gap: 10px;
}

.koda-action-btn{
  appearance:none;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: 10px;
  color: rgba(0,0,0,0.55);
  transition: background 120ms ease, color 120ms ease, transform 120ms ease;
  user-select: none;
}

.koda-action-btn:hover{
  background: rgba(0,0,0,0.04);
  color: rgba(0,0,0,0.80);
}

.koda-action-btn:active{
  transform: scale(0.98);
}

.koda-action-btn:disabled{
  cursor: default;
  opacity: 0.45;
}

.koda-spin{
  animation: kodaSpin 900ms linear infinite;
}

@keyframes kodaSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;
