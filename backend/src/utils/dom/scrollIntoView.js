/**
 * Scroll an element into view safely. No-ops if element is null
 * or scrollIntoView is unavailable.
 */
export function scrollIntoViewSafe(el, opts) {
  if (!el || typeof el.scrollIntoView !== "function") return;
  el.scrollIntoView({ block: "nearest", behavior: "smooth", ...opts });
}

/**
 * Returns true when a scrollable element is near its bottom edge.
 */
export function isNearBottom(el, thresholdPx = 120) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx;
}
