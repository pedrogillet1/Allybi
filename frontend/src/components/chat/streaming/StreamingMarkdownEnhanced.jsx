// src/components/chat/StreamingMarkdownEnhanced.jsx
import React, { useMemo } from "react";
import StreamingMarkdown from "./StreamingMarkdown";

/**
 * StreamingMarkdownEnhanced.jsx (ChatGPT-parity)
 * ---------------------------------------------
 * This component is the “message-safe renderer” wrapper that:
 *  - Uses StreamingMarkdown for safe markdown rendering (no raw HTML)
 *  - Applies last-mile text hygiene that ChatGPT-like UIs do:
 *      - removes accidental "Sources:" labels from body (sources are attachments)
 *      - trims excessive whitespace
 *      - avoids flicker when streaming
 *
 * It does NOT:
 *  - add user-facing templates
 *  - alter meaning
 *
 * Props:
 *  - content: string
 *  - isStreaming?: boolean
 *  - documents?: array (for clickable doc names)
 *  - onOpenPreview?: (docId, docName, pageNumber?) => void
 *  - onUpload?: () => void
 *  - className?: string
 */

function normalizeWhitespace(s) {
  return (s ?? "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripSourcesLabels(s) {
  if (!s) return "";
  return s.replace(/\b(Sources|Fontes|Fuentes)\s*:\s*\n?/gi, "").trim();
}

export default function StreamingMarkdownEnhanced({
  content,
  isStreaming = false,
  documents = [],
  onOpenPreview,
  onUpload,
  className = "",
}) {
  const cleaned = useMemo(() => {
    const t = normalizeWhitespace(content || "");
    return stripSourcesLabels(t);
  }, [content]);

  return (
    <div className={`koda-streaming-markdown-enhanced ${className}`}>
      <StreamingMarkdown
        content={cleaned}
        isStreaming={isStreaming}
        documents={documents}
        onOpenPreview={onOpenPreview}
        onUpload={onUpload}
      />
    </div>
  );
}
