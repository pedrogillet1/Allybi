import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

export default function ChatEmptyState({
  isMobile = false,
  onPickPrompt,
  onUpload,
  onOpenTools,
  connected = { gmail: false, outlook: false, slack: false },
}) {
  const { t } = useTranslation();

  const chips = useMemo(() => {
    const base = [
      { label: t('chatEmptyState.prompts.summarizePdf.label'), prompt: t('chatEmptyState.prompts.summarizePdf.text') },
      { label: t('chatEmptyState.prompts.findClause.label'), prompt: t('chatEmptyState.prompts.findClause.text') },
      { label: t('chatEmptyState.prompts.rewriteFormally.label'), prompt: t('chatEmptyState.prompts.rewriteFormally.text') },
      { label: t('chatEmptyState.prompts.createSlide.label'), prompt: t('chatEmptyState.prompts.createSlide.text') },
      { label: t('chatEmptyState.prompts.searchEmail.label'), prompt: t('chatEmptyState.prompts.searchEmail.text') },
      { label: t('chatEmptyState.prompts.searchSlack.label'), prompt: t('chatEmptyState.prompts.searchSlack.text') },
    ];
    return isMobile ? base.slice(0, 4) : base;
  }, [isMobile, t]);

  const toolBadges = [
    connected.gmail ? t('chatEmptyState.toolBadges.gmailConnected') : t('chatEmptyState.toolBadges.connectGmail'),
    connected.slack ? t('chatEmptyState.toolBadges.slackConnected') : t('chatEmptyState.toolBadges.connectSlack'),
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
              {t('chatEmptyState.heading')}
            </div>
            <div style={{ marginTop: 6, fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 550, fontSize: 13.5, color: "#6B7280" }}>
              {t('chatEmptyState.subtitle')}
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
                title={t('chatEmptyState.openTools')}
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
              title={t('chatEmptyState.usePrompt')}
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
            {t('chatEmptyState.uploadFiles')}
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
            {t('chatEmptyState.tools')}
          </button>
        </div>
      </div>
    </div>
  );
}
