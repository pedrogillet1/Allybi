import React, { useEffect, useMemo, useRef, useState } from "react";
import "./InlineSuggestionBubble.css";

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

export default function InlineSuggestionBubble({
  containerRef,
  anchorEl,
  title = "Change",
  onAccept,
  onReject,
  onEdit,
  visible = true,
}) {
  const [pos, setPos] = useState({ top: -9999, left: -9999, w: 0, h: 0 });
  const rafRef = useRef(0);

  const canShow = Boolean(visible && containerRef?.current && anchorEl);

  const update = () => {
    const container = containerRef?.current;
    if (!container || !anchorEl) return;
    const cr = container.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    if (!cr || !ar) return;

    const top = (ar.top - cr.top) + container.scrollTop;
    const left = (ar.left - cr.left) + container.scrollLeft;
    setPos({ top, left, w: ar.width, h: ar.height });
  };

  useEffect(() => {
    if (!canShow) return;

    const container = containerRef.current;
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };
    const onResize = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    update();
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    const ro = new ResizeObserver(() => onResize());
    try { ro.observe(container); } catch {}

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      try { ro.disconnect(); } catch {}
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShow, anchorEl]);

  const style = useMemo(() => {
    const container = containerRef?.current;
    if (!container) return { display: "none" };
    const maxLeft = container.scrollWidth;

    const bubbleW = 230;
    const gutter = 12;

    // Prefer to the right; if not enough room, place to the left.
    const rightX = pos.left + pos.w + gutter;
    const leftX = pos.left - bubbleW - gutter;
    const x = (rightX + bubbleW <= maxLeft) ? rightX : Math.max(8, leftX);

    const y = clamp(pos.top + 2, 8, Math.max(8, container.scrollHeight - 44));
    return {
      top: y,
      left: x,
    };
  }, [pos, containerRef]);

  if (!canShow) return null;

  return (
    <div className="koda-inlineSugg" style={style} role="group" aria-label="Change controls">
      <div className="koda-inlineSugg__title" title={title}>{title}</div>
      <div className="koda-inlineSugg__actions">
        <button type="button" className="koda-inlineSugg__btn koda-inlineSugg__btn--primary" onClick={onAccept}>
          Accept
        </button>
        <button type="button" className="koda-inlineSugg__btn" onClick={onReject}>
          Reject
        </button>
        {typeof onEdit === "function" ? (
          <button type="button" className="koda-inlineSugg__btn" onClick={onEdit}>
            Edit
          </button>
        ) : null}
      </div>
    </div>
  );
}

