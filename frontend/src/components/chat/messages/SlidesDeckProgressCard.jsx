import React, { useMemo } from "react";
import "./SlidesDeckProgressCard.css";

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatEta(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s <= 0) return "";
  if (s < 45) return "ETA < 1m";
  const m = Math.max(1, Math.round(s / 60));
  return `ETA ~${m}m`;
}

function relTimeMs(ms) {
  const v = Number(ms || 0);
  if (!Number.isFinite(v) || v <= 0) return "";
  const s = Math.max(1, Math.round(v / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

function estimateEtaSeconds(progress, includeVisuals) {
  const total = Number(progress?.total || 0) || 0;
  if (!total) return 0;

  const slides = Array.isArray(progress?.slides) ? progress.slides : [];
  const doneText = slides.filter((s) => s?.text === "done").length;
  const doneVisuals = includeVisuals ? slides.filter((s) => s?.visuals === "done").length : total;
  const phase = String(progress?.phase || "").toLowerCase().trim();

  const remainingText = Math.max(0, total - doneText);
  const remainingVisuals = Math.max(0, total - doneVisuals);

  // Rough heuristics; this is just to reduce user anxiety.
  const secPerText = 3;
  const secPerVisual = 14;
  const secExport = phase === "thumbnails" ? 10 : 0;
  return remainingText * secPerText + remainingVisuals * secPerVisual + secExport;
}

export default function SlidesDeckProgressCard({
  progress = null,
  isMobile = false, // (kept for sizing parity with other cards)
  title = "Building your slides",
  eventLine = "",
  isStreaming = false,
  onOpenDeck = null, // (href: string) => void
}) {
  const ui = useMemo(() => {
    const total = Number(progress?.total || 0) || 0;
    const slides = Array.isArray(progress?.slides) ? progress.slides : [];
    const phase = String(progress?.phase || "building");
    const deck = progress?.deck || null;
    const visualsEnabled =
      typeof progress?.includeVisuals === "boolean"
        ? Boolean(progress.includeVisuals)
        : true;

    const doneText = slides.filter((s) => s?.text === "done").length;
    const doneVisuals = visualsEnabled ? slides.filter((s) => s?.visuals === "done").length : total;
    const thumb = progress?.thumbnails === "done" ? 1 : 0;
    const outline = phase !== "outlining" ? 1 : 0;

    const p =
      total > 0
        ? clamp01(
            0.10 * outline +
              0.45 * (doneText / total) +
              0.35 * (doneVisuals / total) +
              0.10 * thumb
          )
        : 0;

    const pct = Math.round(p * 100);
    const etaSeconds = estimateEtaSeconds(progress, visualsEnabled);
    const updatedAt = Number(progress?.updatedAt || 0) || 0;

    const deckHref = deck?.url ? String(deck.url).split("#")[0] : "";
    const canOpenDeck = Boolean(deckHref && typeof onOpenDeck === "function");
    const isDone = phase.toLowerCase().trim() === "done" || pct >= 100;

    return {
      total,
      phase,
      pct,
      doneText,
      doneVisuals,
      visualsEnabled,
      etaSeconds,
      updatedAt,
      deckHref,
      canOpenDeck,
      isDone,
    };
  }, [progress, onOpenDeck]);

  const metaBits = [
    ui.total ? `Text ${ui.doneText}/${ui.total}` : "",
    ui.total ? (ui.visualsEnabled ? `Visuals ${ui.doneVisuals}/${ui.total}` : "Visuals off") : "",
    ui.total ? formatEta(ui.etaSeconds) : "",
  ].filter(Boolean);

  return (
    <div
      className={`slides-progress-card slides-builder ${isMobile ? "sb-mobile" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="sb-head">
        <div className="sb-headLeft">
          <div className="sb-titleRow">
            <div className="sb-title">{title}</div>
            {isStreaming ? <div className="sb-live">LIVE</div> : null}
          </div>
          {metaBits.length ? <div className="sb-meta">{metaBits.join(" • ")}</div> : null}
          {eventLine ? <div className="sb-event">{eventLine}</div> : null}
        </div>
      </div>

      <div className="slides-progress-bar sb-bar" aria-label="Overall progress">
        <div className="slides-progress-barFill" style={{ width: `${ui.pct}%` }} />
        {ui.isDone ? null : <div className="slides-progress-barSheen" />}
      </div>

      <div className="sb-foot sb-footSolo">
        <div className="sb-footLeft">
          {ui.total ? `${ui.pct}% (${ui.total} slides)` : "Working…"}
          {ui.updatedAt ? (
            <span className="sb-updated"> • Last update: {relTimeMs(Date.now() - ui.updatedAt)}</span>
          ) : null}
          {ui.isDone ? <span className="sb-ready"> • Deck ready</span> : null}
        </div>
        <div className="sb-footRight">
          {isStreaming ? (
            <span className="sb-hint">Safe to leave: we keep generating in background.</span>
          ) : null}
          {ui.canOpenDeck ? (
            <button
              type="button"
              className="sb-openDeckBtn"
              onClick={() => onOpenDeck?.(ui.deckHref)}
            >
              Open deck
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
