import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

function clip(s, n = 120) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length <= n ? t : t.slice(0, n).trimEnd() + "…";
}

function statusLabel(status) {
  if (status === "applied") return { text: "Applied", bg: "rgba(16,185,129,0.12)", fg: "#065F46", border: "rgba(16,185,129,0.25)" };
  if (status === "applying") return { text: "Applying", bg: "rgba(59,130,246,0.12)", fg: "#1D4ED8", border: "rgba(59,130,246,0.25)" };
  if (status === "blocked") return { text: "Needs review", bg: "rgba(245,158,11,0.14)", fg: "#92400E", border: "rgba(245,158,11,0.25)" };
  if (status === "failed") return { text: "Failed", bg: "rgba(239,68,68,0.10)", fg: "#991B1B", border: "rgba(239,68,68,0.22)" };
  return { text: "Pending", bg: "rgba(17,24,39,0.06)", fg: "#111827", border: "rgba(17,24,39,0.12)" };
}

function Pill({ children, tone = "neutral" }) {
  const t =
    tone === "success"
      ? { bg: "rgba(16,185,129,0.12)", fg: "#065F46", border: "rgba(16,185,129,0.25)" }
      : tone === "danger"
        ? { bg: "rgba(239,68,68,0.10)", fg: "#991B1B", border: "rgba(239,68,68,0.22)" }
        : { bg: "rgba(17,24,39,0.06)", fg: "#111827", border: "rgba(17,24,39,0.12)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 26,
        padding: "0 10px",
        borderRadius: 999,
        border: `1px solid ${t.border}`,
        background: t.bg,
        color: t.fg,
        fontFamily: "Plus Jakarta Sans",
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Btn({ label, onClick, disabled, kind = "secondary" }) {
  const style =
    kind === "primary"
      ? {
          background: "#111827",
          color: "white",
          border: "1px solid #111827",
        }
      : {
          background: "white",
          color: "#111827",
          border: "1px solid #E5E7EB",
        };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 34,
        padding: "0 12px",
        borderRadius: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "Plus Jakarta Sans",
        fontWeight: 900,
        fontSize: 12,
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {label}
    </button>
  );
}

/**
 * ChangesTab (DocumentViewer)
 * - Shows an audit log of Allybi edits in this document.
 * - Viewer chat remains conversation-only; changes are tracked here.
 */
export default function ChangesTab({
  entries = [],
  onUndo,
  onRetry,
  onOpenDoc,
  onGoToTarget,
}) {
  const { t } = useTranslation();
  const list = useMemo(() => (Array.isArray(entries) ? entries : []), [entries]);

  if (list.length === 0) {
    return (
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 950, fontSize: 13, color: "#111827" }}>
          {t("editor.changesTab.noChanges")}
        </div>
        <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280", marginTop: 4 }}>
          {t("editor.changesTab.noChangesHint")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      {list.map((e) => {
        const session = e?.session || {};
        const status = statusLabel(e?.status);
        const location = session?.locationLabel || session?.target?.label || t("editor.changesTab.edit");
        const instruction = session?.instruction || "";
        const revisionId = e?.revisionId || e?.appliedRevisionId || null;
        const canUndo = e?.status === "applied" && Boolean(revisionId || session?.documentId);
        const canRetry = e?.status === "failed" || e?.status === "blocked";
        const canLocate = Boolean(session?.target?.id || session?.targetId);

        return (
          <div
            key={e?.id || e?.key || `${session?.documentId || "doc"}:${session?.operator || "op"}:${location}:${clip(instruction, 40)}`}
            style={{
              borderRadius: 16,
              border: "1px solid #E5E7EB",
              background: "white",
              boxShadow: "0 12px 32px rgba(17, 24, 39, 0.06)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 26,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: `1px solid ${status.border}`,
                  background: status.bg,
                  color: status.fg,
                  fontFamily: "Plus Jakarta Sans",
                  fontWeight: 950,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {status.text}
              </span>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 950, fontSize: 13, color: "#111827", lineHeight: "18px" }}>
                  {location}
                </div>
                {instruction ? (
                  <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    {clip(instruction, 160)}
                  </div>
                ) : null}
                {e?.error ? (
                  <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 750, fontSize: 12, color: "#991B1B", marginTop: 8 }}>
                    {clip(e.error, 260)}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ padding: 12, paddingTop: 0, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {session?.domain ? <Pill>{String(session.domain).toUpperCase()}</Pill> : null}
              {session?.operator ? <Pill>{String(session.operator)}</Pill> : null}
              {e?.autoApplied ? <Pill tone="success">Auto</Pill> : null}
              {e?.status === "failed" ? <Pill tone="danger">Error</Pill> : null}

              <div style={{ flex: 1 }} />

              <Btn
                label={t("editor.changesTab.locate")}
                disabled={!canLocate}
                onClick={() => onGoToTarget?.(e)}
              />
              <Btn
                label={t("editor.changesTab.retry")}
                disabled={!canRetry}
                onClick={() => onRetry?.(e)}
              />
              <Btn
                label={t("editor.changesTab.undo")}
                disabled={!canUndo}
                onClick={() => onUndo?.(e)}
              />
              <Btn
                label={t("editor.changesTab.open")}
                disabled={!revisionId}
                onClick={() => onOpenDoc?.(revisionId)}
                kind="primary"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

