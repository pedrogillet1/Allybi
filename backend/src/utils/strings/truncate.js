/**
 * Truncate a string to `max` characters with an ellipsis.
 */
export function truncateFilename(name, max = 60) {
  const s = String(name || "").trim();
  if (!s) return "Untitled";
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
}

/**
 * Normalize a conversation title for sidebar display.
 * Falls back to "New chat" if blank.
 */
export function normalizeTitle(conv, max = 60) {
  const raw = String(conv?.title || "New chat").trim();
  return truncateFilename(raw, max);
}
