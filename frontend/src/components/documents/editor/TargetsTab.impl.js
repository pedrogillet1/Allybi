import React, { useMemo, useState, useEffect } from "react";
import cleanDocumentName from "../../../utils/cleanDocumentName";
import { applyEdit } from "../../../services/editingService";

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
  const filename = cleanDocumentName(document?.filename || "Document");
  const docId = document?.id;

  const [query, setQuery] = useState("");

  const [slidesDraftText, setSlidesDraftText] = useState("");
  const [slidesStatus, setSlidesStatus] = useState("");
  const [slidesApplying, setSlidesApplying] = useState(false);

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
        <SectionTitle>DOCX targets</SectionTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <Pill>{filename}</Pill>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find target…"
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
              {blocks.length === 0 ? "No paragraphs loaded yet." : "No matches."}
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
          <SectionTitle>Slide text targets</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill>{filename}</Pill>
            {selectedAnchor ? <Pill>Selected: Slide {selectedAnchor.slideNumber}</Pill> : null}
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
              No text targets found.
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
              }}>
                Slide {slideNumber}
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
          <SectionTitle>Rewrite selected</SectionTitle>
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
            title="Apply rewrite"
          >
            {slidesApplying ? "Applying…" : "Apply rewrite"}
          </button>
        </div>
      </div>
    );
  }

  if (fileType === "excel") {
    return (
      <div style={{ padding: 14 }}>
        <SectionTitle>Spreadsheet targets</SectionTitle>
        <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280" }}>
          Click a cell in the grid to set the target, then edit in the toolbar input.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 14 }}>
      <SectionTitle>Targets</SectionTitle>
      <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 650, fontSize: 12, color: "#6B7280" }}>
        Targets are not available for this file type yet.
      </div>
    </div>
  );
}
