/**
 * Deduplicate an array of objects by a key function.
 * Keeps the first occurrence.
 */
export function dedupeByKey(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
