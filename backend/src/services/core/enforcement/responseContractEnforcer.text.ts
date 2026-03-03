export function normalizeNewlines(
  text: string,
  maxConsecutive: number = 2,
): string {
  let out = (text || "").replace(/\r\n/g, "\n");
  const re = new RegExp(`\\n{${maxConsecutive + 1},}`, "g");
  out = out.replace(re, "\n".repeat(maxConsecutive));
  return out.trim();
}

export function detectJsonLike(text: string): boolean {
  const value = text.trim();
  if (/^\s*```json\b/i.test(value)) return true;
  if (/^\s*\{\s*"/.test(value)) return true;
  if (/^\s*\[\s*\{/.test(value)) return true;
  return false;
}

export function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}
