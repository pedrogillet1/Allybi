import React, { useMemo } from "react";

import gmailSvg from "../../assets/Gmail.svg";
import outlookSvg from "../../assets/outlook.svg";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function formatWhen(value) {
  const v = safeString(value).trim();
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  return v;
}

function providerIcon(provider) {
  const p = safeString(provider).toLowerCase();
  if (p === "gmail") return gmailSvg;
  if (p === "outlook") return outlookSvg;
  return null;
}

export default function EmailPreviewModal({ isOpen, email, onClose }) {
  const e = email || null;
  const provider = safeString(e?.provider).toLowerCase();
  const icon = useMemo(() => providerIcon(provider), [provider]);

  if (!isOpen || !e) return null;

  const subject = safeString(e.subject).trim() || "(no subject)";
  const from = safeString(e.from).trim();
  const to = safeString(e.to).trim();
  const cc = safeString(e.cc).trim();
  const when = formatWhen(e.receivedAt);
  const body = safeString(e.bodyText);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={() => onClose?.()}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />

      <div
        style={{
          position: "relative",
          width: "min(860px, 96vw)",
          maxHeight: "88vh",
          overflow: "hidden",
          borderRadius: 18,
          background: "#fff",
          border: "1px solid #E6E6EC",
          boxShadow: "0 28px 80px rgba(0,0,0,0.20)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Plus Jakarta Sans, sans-serif",
        }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #E6E6EC",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {icon ? <img src={icon} alt="" width={22} height={22} style={{ objectFit: "contain" }} /> : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 850, fontSize: 15, color: "#18181B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {subject}
              </div>
              <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 650, color: "#71717A" }}>
                {provider ? provider.toUpperCase() : "EMAIL"}{when ? ` · ${when}` : ""}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Close"
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              border: "1px solid #E6E6EC",
              background: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#52525B",
              fontWeight: 800,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "14px 16px 0" }}>
          {from ? <Row k="From" v={from} /> : null}
          {to ? <Row k="To" v={to} /> : null}
          {cc ? <Row k="Cc" v={cc} /> : null}
        </div>

        <div style={{ padding: 16, overflow: "auto" }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 13,
              lineHeight: 1.45,
              color: "#111827",
            }}
          >
            {body || "(empty)"}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 10, alignItems: "baseline", padding: "2px 0" }}>
      <div style={{ color: "#71717A", fontWeight: 750, fontSize: 12 }}>{k}</div>
      <div style={{ color: "#27272A", fontWeight: 650, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
    </div>
  );
}
