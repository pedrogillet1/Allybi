const CODE_PREFIX_PATTERN = /^([a-z0-9][a-z0-9_]{1,95})\s*:/i;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function stableHashToken(value: string): string {
  // FNV-1a (32-bit) for deterministic, low-collision warning code suffixes.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

export function deriveWarningCode(warning: string): string {
  const normalized = String(warning || "").trim();
  if (!normalized) return "unknown_warning";

  const match = normalized.match(CODE_PREFIX_PATTERN);
  if (match?.[1]) {
    return slugify(match[1]) || "unknown_warning";
  }

  const compact = slugify(normalized);
  if (!compact) return "unknown_warning";

  const parts = compact.split("_").filter(Boolean).slice(0, 6);
  const tokenized = parts.length > 0 ? parts.join("_") : "";
  if (!tokenized) return "unknown_warning";
  if (tokenized === compact) return tokenized;

  const suffix = stableHashToken(compact);
  const maxBaseLen = Math.max(1, 96 - suffix.length - 1);
  const base = tokenized.slice(0, maxBaseLen).replace(/_+$/g, "") || "warning";
  return `${base}_${suffix}`;
}

export function deriveExtractionWarningCodes(
  warnings: string[] | null | undefined,
): string[] {
  if (!Array.isArray(warnings) || warnings.length === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const warning of warnings) {
    const code = deriveWarningCode(String(warning || ""));
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}
