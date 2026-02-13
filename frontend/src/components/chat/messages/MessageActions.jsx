// src/components/chat/MessageActions.jsx
import React, { useMemo, useState, useCallback } from "react";
import copyDuplicateIcon from "../../../assets/copy-duplicate.svg";
import refreshSyncIcon from "../../../assets/refresh-sync.svg";

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
    <img
      src={copyDuplicateIcon}
      alt=""
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        filter: "brightness(0) invert(0.2)",
      }}
    />
  );
}

function RefreshIcon({ spinning = false }) {
  return (
    <img
      src={refreshSyncIcon}
      alt=""
      aria-hidden="true"
      className={spinning ? "koda-spin" : ""}
      style={{
        width: 18,
        height: 18,
        filter: "brightness(0) invert(0.2)",
      }}
    />
  );
}

const css = `
.koda-msg-actions{
  display:flex;
  align-items:center;
  gap: 2px;
}

.koda-msg-actions .koda-action-btn:first-child{
  margin-left: -6px;
}

.koda-action-btn{
  appearance:none;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 6px;
  border-radius: 10px;
  color: rgba(0,0,0,0.55);
  transition: background 120ms ease, color 120ms ease, transform 120ms ease;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  width: 32px;
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
