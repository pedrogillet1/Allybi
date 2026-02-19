function normalizeWhitespaceForEdit(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapRatio(left: string, right: string): number {
  const a = new Set(
    normalizeWhitespaceForEdit(left)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const b = new Set(
    normalizeWhitespaceForEdit(right)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const token of a) if (b.has(token)) hit += 1;
  return hit / Math.max(a.size, b.size);
}

export function looksLikeTruncatedSpanPayload(
  originalText: string,
  proposedText: string,
): boolean {
  const before = normalizeWhitespaceForEdit(originalText);
  const after = normalizeWhitespaceForEdit(proposedText);
  if (!before || !after) return false;
  if (before === after) return false;
  // Genuine span edits should still submit the full paragraph payload to EDIT_SPAN.
  // If it collapses to a tiny fragment with low token overlap, block it.
  const tooShort = after.length < Math.max(24, Math.floor(before.length * 0.6));
  const overlap = tokenOverlapRatio(before, after);
  return tooShort && overlap < 0.35;
}
