// src/components/chat/MessageActions.jsx
import React, { useMemo } from "react";

/**
 * MessageActions.jsx (ChatGPT-parity)
 * ----------------------------------
 * Goals:
 *  - Simple, icon-first actions under assistant messages:
 *      - Copy
 *      - Regenerate (optional)
 *      - Feedback (optional hook)
 *  - Never show in nav_pills mode (handled by parent)
 *  - Never show during streaming (handled by parent)
 *
 * Props:
 *  - message: { id, role, content, answerMode, navType }
 *  - onCopy?: (message) => void
 *  - onRegenerate?: (messageId) => void
 *  - onFeedback?: (messageId, rating) => void
 *  - isRegenerating?: boolean
 */

export default function MessageActions({
  message,
  onCopy,
  onRegenerate,
  onFeedback,
  isRegenerating = false,
  className = "",
  style = {},
}) {
  const canCopy = message?.role === "assistant" && (message?.content || "").trim().length > 0;

  const actions = useMemo(() => {
    const a = [];
    if (canCopy) a.push("copy");
    if (typeof onRegenerate === "function") a.push("regen");
    if (typeof onFeedback === "function") a.push("feedback");
    return a;
  }, [canCopy, onRegenerate, onFeedback]);

  if (!actions.length) return null;

  return (
    <div className={`koda-msg-actions ${className}`} style={style} role="group" aria-label="Message actions">
      {actions.includes("copy") ? (
        <IconButton
          label="Copy"
          onClick={() => (typeof onCopy === "function" ? onCopy(message) : copyToClipboard(message?.content))}
        >
          <CopyIcon />
        </IconButton>
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

      {actions.includes("feedback") ? (
        <div className="koda-msg-actions-feedback" aria-label="Feedback">
          <IconButton label="Good" onClick={() => onFeedback?.(message?.id, "up")}>
            <ThumbUpIcon />
          </IconButton>
          <IconButton label="Bad" onClick={() => onFeedback?.(message?.id, "down")}>
            <ThumbDownIcon />
          </IconButton>
        </div>
      ) : null}

      <style>{css}</style>
    </div>
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
  } catch {
    // ignore
  }
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1Zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H10V7h9v14Z"
      />
    </svg>
  );
}

function RefreshIcon({ spinning = false }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={spinning ? "koda-spin" : ""}
    >
      <path
        fill="currentColor"
        d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-8.66 3.54l-1.42 1.42A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7Zm-5 7a5 5 0 0 1 8.66-3.54l1.42-1.42A7 7 0 0 0 5 13c0 3.87 3.13 7 7 7v3l4-4-4-4v3c-2.76 0-5-2.24-5-5Z"
      />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 21H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h4v11Zm2 0h6.3a2 2 0 0 0 1.96-1.6l1.2-6.5A2 2 0 0 0 18.5 10H14V6.5a2.5 2.5 0 0 0-5 0V10l-2 2v7a2 2 0 0 0 2 2Z"
      />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15 3h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4V3ZM13 3H6.7a2 2 0 0 0-1.96 1.6l-1.2 6.5A2 2 0 0 0 5.5 14H10v3.5a2.5 2.5 0 0 0 5 0V14l2-2V5a2 2 0 0 0-2-2Z"
      />
    </svg>
  );
}

const css = `
.koda-msg-actions{
  display:flex;
  align-items:center;
  gap: 10px;
}

.koda-msg-actions-feedback{
  display:flex;
  align-items:center;
  gap: 6px;
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
