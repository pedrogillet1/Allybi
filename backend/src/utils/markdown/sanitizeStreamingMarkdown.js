/**
 * Auto-close unclosed code fences during streaming so the markdown
 * renderer doesn't break mid-stream. Pure render-time; does not
 * mutate stored content.
 */
export function balanceCodeFences(text, isStreaming) {
  const t = String(text ?? "");
  if (!isStreaming) return t;
  const fenceCount = (t.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) return t + "\n```";
  return t;
}
