import React from "react";

/**
 * FailedMessage.jsx
 *
 * ChatGPT-like failed message UI for assistant or user messages.
 * - No panic red
 * - Clear "Retry" affordance
 * - Optional "Copy error" for debugging (can hide in production)
 *
 * Props:
 * - title?: string
 * - detail?: string
 * - onRetry?: () => void
 * - onCopyDetail?: () => void
 * - showCopy?: boolean
 */
export default function FailedMessage({
  title = "Something went wrong",
  detail,
  onRetry,
  onCopyDetail,
  showCopy = false,
}) {
  return (
    <div style={styles.wrap} role="status" aria-live="polite">
      <div style={styles.icon} aria-hidden="true">
        {/* simple warning icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 9v5"
            stroke="#6C6B6E"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 17h.01"
            stroke="#6C6B6E"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="#6C6B6E"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div style={styles.body}>
        <div style={styles.title}>{title}</div>

        {detail ? (
          <div style={styles.detail} title={detail}>
            {detail}
          </div>
        ) : null}

        <div style={styles.actions}>
          {onRetry ? (
            <button type="button" onClick={onRetry} style={styles.retryBtn}>
              Retry
            </button>
          ) : null}

          {showCopy && detail && (
            <button
              type="button"
              onClick={() => {
                if (onCopyDetail) return onCopyDetail();
                try {
                  navigator.clipboard?.writeText?.(detail);
                } catch {}
              }}
              style={styles.copyBtn}
            >
              Copy details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    width: "100%",
    display: "flex",
    gap: 12,
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #E6E6EC",
    background: "#FFFFFF",
    alignItems: "flex-start",
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    border: "1px solid #E6E6EC",
    background: "#F5F5F5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "Plus Jakarta Sans",
    fontSize: 14,
    fontWeight: 800,
    color: "#32302C",
    lineHeight: "20px",
  },
  detail: {
    marginTop: 6,
    fontFamily: "Plus Jakarta Sans",
    fontSize: 13,
    fontWeight: 600,
    color: "#6C6B6E",
    lineHeight: "18px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    opacity: 0.95,
  },
  actions: {
    marginTop: 10,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  retryBtn: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #E6E6EC",
    background: "#F5F5F5",
    color: "#32302C",
    fontFamily: "Plus Jakarta Sans",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    transition: "background 150ms ease, transform 120ms ease",
  },
  copyBtn: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #E6E6EC",
    background: "#FFFFFF",
    color: "#32302C",
    fontFamily: "Plus Jakarta Sans",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    transition: "background 150ms ease, transform 120ms ease",
  },
};
