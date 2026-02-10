import React, { useMemo } from "react";

export default function ChatEmptyState({
  isMobile = false,
  onPickPrompt,
  onUpload,
  onOpenTools,
  connected = { gmail: false, outlook: false, slack: false },
}) {
  const chips = useMemo(() => {
    const base = [
      { label: "Summarize this PDF", prompt: "Summarize the attached PDF in 5 bullets." },
      { label: "Find a clause", prompt: "Find the termination clause and quote it." },
      { label: "Rewrite formally", prompt: "Rewrite the highlighted paragraph to sound more formal and concise." },
      { label: "Create a slide", prompt: "Create 1 slide summarizing the key points (title + 5 bullets)." },
      { label: "Search email", prompt: "Search my email for the latest thread about invoices and summarize it." },
      { label: "Search Slack", prompt: "Find Slack messages about project Orion from the last 30 days." },
    ];
    return isMobile ? base.slice(0, 4) : base;
  }, [isMobile]);

  const toolBadges = [
    connected.gmail ? "Gmail connected" : "Connect Gmail",
    connected.slack ? "Slack connected" : "Connect Slack",
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: isMobile ? "18px 14px" : "24px 18px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 820,
          border: "1px solid #E6E6EC",
          borderRadius: 22,
          background: "white",
          boxShadow: "0 18px 44px rgba(17, 24, 39, 0.08)",
          padding: isMobile ? 16 : 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 850, fontSize: 18, color: "#18181B" }}>
              What do you want to do?
            </div>
            <div style={{ marginTop: 6, fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 550, fontSize: 13.5, color: "#6B7280" }}>
              Ask about your files, edit content, or use connected tools.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {toolBadges.map((txt) => (
              <button
                key={txt}
                type="button"
                onClick={() => onOpenTools?.()}
                style={{
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: "1px solid #E6E6EC",
                  background: "#F9FAFB",
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                  fontWeight: 750,
                  fontSize: 12.5,
                  color: "#3F3F46",
                  cursor: "pointer",
                }}
                title="Open tools"
              >
                {txt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onPickPrompt?.(c.prompt)}
              style={{
                textAlign: "left",
                border: "1px solid #EEF2F7",
                background: "#F9FAFB",
                borderRadius: 16,
                padding: "12px 14px",
                cursor: "pointer",
                fontFamily: "Plus Jakarta Sans, sans-serif",
                fontWeight: 750,
                fontSize: 14,
                color: "#111827",
              }}
              title="Use this prompt"
            >
              {c.label}
              <div style={{ marginTop: 6, fontWeight: 550, fontSize: 12.5, color: "#6B7280", lineHeight: 1.35 }}>
                {c.prompt}
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onUpload?.()}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              fontFamily: "Plus Jakarta Sans, sans-serif",
              fontWeight: 850,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Upload files
          </button>
          <button
            type="button"
            onClick={() => onOpenTools?.()}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #E6E6EC",
              background: "white",
              color: "#111827",
              fontFamily: "Plus Jakarta Sans, sans-serif",
              fontWeight: 850,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Tools
          </button>
        </div>
      </div>
    </div>
  );
}

