/**
 * Extract the first introductory sentence from message text.
 * Used in nav_pills mode to show a brief intro above navigation pills.
 */
export function extractIntroSentence(text) {
  if (!text) return "";
  // Strip markdown list lines and bold markers
  let cleaned = text.replace(/^\s*[-*]\s+.+$/gm, '').replace(/^\s*\d+\.\s+.+$/gm, '').trim();
  cleaned = cleaned.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
  if (!cleaned) return "";
  // Take first sentence (up to first period, ?, !, or colon followed by whitespace)
  const match = cleaned.match(/^[^]*?[.!?:](?:\s|$)/);
  return match ? match[0].trim() : cleaned.slice(0, 200).trim();
}
