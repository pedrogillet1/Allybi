// src/components/chat/DebugOverlay.jsx
import React, { useMemo, useState } from "react";

/**
 * DebugOverlay.jsx (ChatGPT-parity, dev-safe)
 * -------------------------------------------
 * Purpose:
 *  - Optional on-screen debug HUD for chat pipeline visibility:
 *      - streaming state
 *      - selected answerMode / navType
 *      - intent / operator / confidence (if provided)
 *      - sources count / attachments count
 *      - correlation / request ids (if available)
 *
 * Safety:
 *  - Designed to be DEV/LOCAL only. In production you should disable it.
 *  - Never shows raw internal document paths or secrets.
 *
 * Usage:
 *  <DebugOverlay enabled={enableDebug} data={...} />
 */

export default function DebugOverlay({
  enabled = false,
  data = {},
  position = "bottom-right", // "top-right" | "bottom-right" | "bottom-left"
}) {
  const [collapsed, setCollapsed] = useState(false);

  const placementStyle = useMemo(() => {
    const base = { position: "fixed", zIndex: 99999 };
    if (position === "top-right") return { ...base, top: 16, right: 16 };
    if (position === "bottom-left") return { ...base, bottom: 16, left: 16 };
    return { ...base, bottom: 16, right: 16 };
  }, [position]);

  if (!enabled) return null;

  const safe = sanitize(data);

  return (
    <div style={placementStyle}>
      <div style={wrapStyle}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          style={toggleStyle}
          aria-label={collapsed ? "Open debug overlay" : "Collapse debug overlay"}
        >
          {collapsed ? "Debug ▸" : "Debug ▾"}
        </button>

        {!collapsed ? (
          <div style={panelStyle}>
            <Row k="stream" v={safe.streamingState} />
            <Row k="answerMode" v={safe.answerMode} />
            <Row k="navType" v={safe.navType} />
            <Row k="operator" v={safe.operator} />
            <Row k="intent" v={safe.intent} />
            <Row k="confidence" v={safe.confidence} />
            <Row k="sources" v={safe.sourcesCount} />
            <Row k="attachments" v={safe.attachmentsCount} />
            <Row k="conversationId" v={safe.conversationId} />
            <Row k="requestId" v={safe.requestId} />
            <Row k="correlationId" v={safe.correlationId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ k, v }) {
  if (v == null || v === "") return null;
  return (
    <div style={rowStyle}>
      <div style={keyStyle}>{k}</div>
      <div style={valStyle} title={String(v)}>{String(v)}</div>
    </div>
  );
}

function sanitize(data) {
  const d = data || {};
  return {
    streamingState: d.debugStreamingState ?? d.isStreaming ? "streaming" : (d.streamingState ?? "idle"),
    answerMode: d.answerMode ?? d.lastAssistant?.answerMode ?? "",
    navType: d.navType ?? d.lastAssistant?.navType ?? "",
    operator: d.operator ?? d.intentData?.operator ?? "",
    intent: d.intent ?? d.intentData?.intent ?? "",
    confidence: d.confidence ?? d.intentData?.confidence ?? "",
    sourcesCount:
      d.sourcesCount ??
      (Array.isArray(d.lastAssistant?.sources) ? d.lastAssistant.sources.length : (Array.isArray(d.sources) ? d.sources.length : "")),
    attachmentsCount:
      d.attachmentsCount ??
      (Array.isArray(d.lastAssistant?.attachments) ? d.lastAssistant.attachments.length : ""),
    conversationId: d.conversationId ?? d.currentConversation?.id ?? "",
    requestId: d.requestId ?? d.lastRequestId ?? "",
    correlationId: d.correlationId ?? d.lastCorrelationId ?? "",
  };
}

const wrapStyle = {
  width: 280,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial',
};

const toggleStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  cursor: "pointer",
  fontSize: 12.5,
  fontWeight: 700,
  textAlign: "left",
};

const panelStyle = {
  marginTop: 8,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
};

const rowStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "4px 0",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const keyStyle = {
  width: 92,
  fontSize: 11,
  fontWeight: 800,
  color: "rgba(0,0,0,0.55)",
  textTransform: "lowercase",
};

const valStyle = {
  flex: 1,
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(0,0,0,0.85)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
