const CODE_PREFIX_PATTERN = /^([a-z0-9][a-z0-9_]{1,95})\s*:/i;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
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
  return parts.length > 0 ? parts.join("_") : "unknown_warning";
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

