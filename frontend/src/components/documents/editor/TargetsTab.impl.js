import React, { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import cleanDocumentName from "../../../utils/cleanDocumentName";
import { applyEdit } from "../../../services/editingService";
import api from "../../../services/api";

function SectionTitle({ children }) {
  return (
    <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 950, fontSize: 12, color: "#111827", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Pill({ children }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid #E5E7EB",
      background: "white",
      fontFamily: "Plus Jakarta Sans",
      fontWeight: 850,
      fontSize: 12,
      color: "#111827",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function clip(s, n = 140) {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n).trimEnd() + "…";
}

export default function TargetsTab({
  document,
  fileType, // word|excel|powerpoint|image|pdf|...
  docxBlocks = [],
  docxSelectedId,
  onSelectDocxParagraphId,
  slidesAnchors = [],
  slidesSelectedAnchorId,
  onSelectSlidesAnchorId,
  onSlidesApplied,
}) {
  const { t } = useTranslation();
  const filename = cleanDocumentName(document?.filename || "Document");
  const docId = document?.id;

  const [query, setQuery] = useState("");

  const [slidesDraftText, setSlidesDraftText] = useState("");
  const [slidesStatus, setSlidesStatus] = useState("");
  const [slidesApplying, setSlidesApplying] = useState(false);
  const slideThumbnailCache = useRef(new Map());
  const [slideThumbnails, setSlideThumbnails] = useState({});

  const slidesAnchorsArr = useMemo(() => (Array.isArray(slidesAnchors) ? slidesAnchors : []), [slidesAnchors]);
  const slidesGrouped = useMemo(() => {
    const m = new Map();
    for (const a of slidesAnchorsArr) {
      const n = Number(a?.slideNumber || 0) || 0;
      if (n <= 0) continue;
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(a);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [slidesAnchorsArr]);

  const selectedAnchor = useMemo(() => {
    const id = String(slidesSelectedAnchorId || "");
    if (!id) return null;
    return slidesAnchorsArr.find((a) => a?.objectId === id) || null;
  }, [slidesAnchorsArr, slidesSelectedAnchorId]);

  // Fetch slide thumbnails for visible slide groups
  useEffect(() => {
    if (fileType !== "powerpoint" || !docId || slidesGrouped.length === 0) return;
    let cancelled = false;
    const slideNumbers = slidesGrouped.map(([n]) => n);
    const missing = slideNumbers.filter((n) => !slideThumbnailCache.current.has(n));
    if (missing.length === 0) return;

    (async () => {
      try {
        const maxSlide = Math.max(...slideNumbers);
        const res = await api.get(`/api/documents/${docId}/slides`, { params: { page: 1, pageSize: maxSlide } });
        const slides = res?.data?.slides || [];
        const newThumbs = {};
        for (const s of slides) {
          if (s.hasImage && s.imageUrl) {
            slideThumbnailCache.current.set(s.slideNumber, s.imageUrl);
            newThumbs[s.slideNumber] = s.imageUrl;
          }
        }
        if (!cancelled) {
          setSlideThumbnails((prev) => ({ ...prev, ...newThumbs }));
        }
      } catch {
        // Thumbnails are non-critical — silently ignore
      }
    })();

    return () => { cancelled = true; };
  }, [fileType, docId, slidesGrouped]);

  // Keep draft text synced to selected anchor (only when empty or equal to previous anchor text).
  useEffect(() => {
    if (!selectedAnchor) return;
    setSlidesDraftText((prev) => (!prev || prev === String(selectedAnchor.text || "") ? String(selectedAnchor.text || "") : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnchor?.objectId]);

  const applySlidesRewrite = async () => {
    if (!docId || !selectedAnchor?.objectId) return;
    const beforeText = String(selectedAnchor.text || "").trim();
    const proposedText = String(slidesDraftText || "").trim();
    if (!proposedText) {
      setSlidesStatus("Cannot apply empty text.");
      return;
    }
    if (proposedText === beforeText) {
      setSlidesStatus("No changes to apply.");
      return;
    }

    setSlidesApplying(true);
    setSlidesStatus("");
    try {
      await applyEdit({
        instruction: `Manual edit in viewer: ${filename}`,
        operator: "REWRITE_SLIDE_TEXT",
        domain: "slides",
        documentId: docId,
        targetHint: selectedAnchor.objectId,
        target: {
          id: selectedAnchor.objectId,
          label: `${selectedAnchor.label} (Slide ${selectedAnchor.slideNumber})`,
          confidence: 1,
          candidates: [],
          decisionMargin: 1,
          isAmbiguous: false,
          resolutionReason: "viewer_selection",
        },
        beforeText: beforeText || "(empty)",
        proposedText,
        slidesCandidates: slidesAnchorsArr.slice(0, 3).map((a) => ({
          objectId: a.objectId,
          label: a.label,
          text: a.text,
          slideNumber: a.slideNumber,
        })),
        userConfirmed: true,
      });

      setSlidesStatus("Applied. Refreshing…");
      onSlidesApplied?.();
      setSlidesStatus("Applied.");
      setTimeout(() => setSlidesStatus(""), 1500);
    } catch (e) {
      setSlidesStatus(e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || "Apply failed.");
    } finally {
      setSlidesApplying(false);
    }
  };

  if (fileType === "word") {
    const blocks = Array.isArray(docxBlocks) ? docxBlocks : [];
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? blocks
      : blocks.filter((b) => {
        const txt = String(b?.text || "").toLowerCase();
        const path = Array.isArray(b?.sectionPath) ? b.sectionPath.join(" / ").toLowerCase() : "";
        return txt.includes(q) || path.includes(q);
      });

    return (
      <div style={{ padding: 14 }}>
        <SectionTitle>{t("editor.targetsTab.docxTargets")}</SectionTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <Pill>{filename}</Pill>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("editor.targetsTab.findTarget")}
          style={{
            width: "100%",
            height: 36,
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            padding: "0 12px",
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 700,
            fontSize: 13,
            outline: "none",
            marginBottom: 12,
            background: "white",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280" }}>
              {blocks.length === 0 ? t("editor.targetsTab.noParagraphs") : t("editor.targetsTab.noMatches")}
            </div>
          ) : filtered.map((b) => {
            const id = b?.paragraphId;
            if (!id) return null;
            const path = Array.isArray(b?.sectionPath) && b.sectionPath.length ? b.sectionPath.join(" / ") : "";
            const title = path || "Paragraph";
            const selected = docxSelectedId === id;
            return (
              <button
                key={id}
                onClick={() => onSelectDocxParagraphId?.(id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 12,
                  border: selected ? "1px solid #111827" : "1px solid #E5E7EB",
                  background: selected ? "rgba(17,24,39,0.06)" : "white",
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
                title={path ? `${path}` : id}
              >
                <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 900, fontSize: 12, color: "#111827" }}>
                  {title}
                </div>
                <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                  {clip(b?.text || "", 180)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (fileType === "powerpoint") {
    return (
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <SectionTitle>{t("editor.targetsTab.slideTargets")}</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill>{filename}</Pill>
            {selectedAnchor ? <Pill>{t("editor.targetsTab.selectedSlide", { number: selectedAnchor.slideNumber })}</Pill> : null}
          </div>
        </div>

        <div style={{
          maxHeight: 280,
          overflow: "auto",
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          background: "white",
        }}>
          {slidesGrouped.length === 0 ? (
            <div style={{ padding: 12, fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280" }}>
              {t("editor.targetsTab.noTargets")}
            </div>
          ) : slidesGrouped.map(([slideNumber, items]) => (
            <div key={slideNumber} style={{ borderTop: "1px solid #F3F4F6" }}>
              <div style={{
                padding: "10px 12px",
                fontFamily: "Plus Jakarta Sans",
                fontWeight: 950,
                fontSize: 12,
                color: "#111827",
                background: "rgba(17,24,39,0.03)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                {slideThumbnails[slideNumber] ? (
                  <img
                    src={slideThumbnails[slideNumber]}
                    alt={t("editor.targetsTab.slide", { number: slideNumber })}
                    loading="lazy"
                    style={{
                      width: 120,
                      height: "auto",
                      borderRadius: 6,
                      border: "1px solid #E5E7EB",
                      flexShrink: 0,
                    }}
                  />
                ) : null}
                <span>{t("editor.targetsTab.slide", { number: slideNumber })}</span>
              </div>
              {items.map((a) => {
                const selected = slidesSelectedAnchorId === a.objectId;
                return (
                  <button
                    key={a.objectId}
                    onClick={() => onSelectSlidesAnchorId?.(a.objectId)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      background: selected ? "rgba(17,24,39,0.06)" : "white",
                      padding: "10px 12px",
                      cursor: "pointer",
                      borderTop: "1px solid #F3F4F6",
                    }}
                    title={a.text}
                  >
                    <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 900, fontSize: 12, color: "#111827" }}>
                      {a.label}
                    </div>
                    <div style={{
                      fontFamily: "Plus Jakarta Sans",
                      fontWeight: 650,
                      fontSize: 12,
                      color: "#6B7280",
                      marginTop: 2,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {a.text}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle>{t("editor.targetsTab.rewriteSelected")}</SectionTitle>
          <textarea
            value={slidesDraftText}
            onChange={(e) => setSlidesDraftText(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              padding: 10,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 700,
              fontSize: 13,
              outline: "none",
              background: "white",
            }}
          />
          {slidesStatus ? (
            <div style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: "rgba(249,250,251,0.9)",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 850,
              fontSize: 12,
              color: "#111827",
            }}>
              {slidesStatus}
            </div>
          ) : null}
          <button
            onClick={applySlidesRewrite}
            disabled={!selectedAnchor || slidesApplying}
            style={{
              height: 38,
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 950,
              fontSize: 13,
              cursor: (!selectedAnchor || slidesApplying) ? "not-allowed" : "pointer",
              opacity: (!selectedAnchor || slidesApplying) ? 0.75 : 1,
            }}
            title={t("editor.targetsTab.applyRewrite")}
          >
            {slidesApplying ? t("editor.toolbar.applying") : t("editor.targetsTab.applyRewrite")}
          </button>
        </div>
      </div>
    );
  }

  if (fileType === "excel") {
    return (
      <div style={{ padding: 14 }}>
        <SectionTitle>{t("editor.targetsTab.spreadsheetTargets")}</SectionTitle>
        <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280" }}>
          {t("editor.targetsTab.spreadsheetHint")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 14 }}>
      <SectionTitle>{t("editor.targetsTab.targets")}</SectionTitle>
      <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280" }}>
        {t("editor.targetsTab.targetsUnavailable")}
      </div>
    </div>
  );
}
