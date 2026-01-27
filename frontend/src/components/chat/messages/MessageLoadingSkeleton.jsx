import React from "react";
import "./MessageLoadingSkeleton.css";

/**
 * MessageLoadingSkeleton.jsx
 *
 * ChatGPT-like "thinking" skeleton for assistant messages.
 * - Works inside the assistant bubble
 * - Subtle shimmer + staggered bars
 * - Respects reduced-motion
 *
 * Props:
 * - lines?: number (default 3)
 * - compact?: boolean (smaller bars, less padding)
 */
export default function MessageLoadingSkeleton({ lines = 3, compact = false }) {
  const safeLines = Math.max(1, Math.min(lines, 6));

  return (
    <div className={`koda-skel ${compact ? "koda-skel--compact" : ""}`} aria-label="Loading">
      {Array.from({ length: safeLines }).map((_, i) => (
        <div
          key={i}
          className="koda-skel__line"
          style={{
            width: lineWidth(i, safeLines),
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * ChatGPT-ish widths: first line longer, later lines shorter.
 */
function lineWidth(i, total) {
  if (total === 1) return "68%";
  if (i === 0) return "74%";
  if (i === total - 1) return "46%";
  return "62%";
}
