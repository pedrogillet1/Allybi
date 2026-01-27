/**
 * Normalize whitespace for consistent markdown rendering.
 * - CRLF / CR → LF
 * - Collapse runs of spaces/tabs to a single space
 * - Collapse 3+ blank lines to 2
 * - Trim leading/trailing whitespace
 */
export function normalizeWhitespace(s) {
  if (!s) return "";
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip "Sources:" labels that the LLM sometimes injects into the body.
 * i18n-aware: matches English, Portuguese, Spanish variants.
 */
export function stripSourcesLabels(s) {
  if (!s) return "";
  return s.replace(/^(?:Sources|Fontes|Fuentes)\s*:\s*$/gim, "").trim();
}
