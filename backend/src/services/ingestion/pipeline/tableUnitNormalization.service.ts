/**
 * Table unit normalization for cell-centric indexing.
 *
 * This parser is intentionally conservative: if unit detection is ambiguous,
 * it returns null instead of guessing.
 */

export interface NormalizedCellUnit {
  unitRaw: string | null;
  unitNormalized: string | null;
  numericValue: number | null;
}

export type UnitPattern = {
  normalized: string;
  patterns: RegExp[];
};

export const UNIT_PATTERNS: UnitPattern[] = [
  {
    normalized: "currency_brl",
    patterns: [/\br\$/i, /\bbrl\b/i, /\breais?\b/i],
  },
  {
    normalized: "currency_usd",
    patterns: [/\busd\b/i, /\$[0-9]/, /\bdollars?\b/i],
  },
  {
    normalized: "currency_eur",
    patterns: [/\beur\b/i, /€/],
  },
  {
    normalized: "currency_gbp",
    patterns: [/\bgbp\b/i, /£/],
  },
  {
    normalized: "currency_jpy",
    patterns: [/\bjpy\b/i, /¥/],
  },
  {
    normalized: "percent",
    patterns: [/%/, /\bpct\b/i, /\bpercent(age)?\b/i],
  },
  {
    normalized: "mass_kg",
    patterns: [/\bkg\b/i, /\bkgs\b/i, /\bkilograms?\b/i],
  },
  {
    normalized: "mass_g",
    patterns: [/\bg\b/, /\bgrams?\b/i],
  },
  {
    normalized: "mass_lb",
    patterns: [/\blb\b/i, /\blbs\b/i, /\bpounds?\b/i],
  },
  {
    normalized: "length_km",
    patterns: [/\bkm\b/i, /\bkilometers?\b/i],
  },
  {
    normalized: "length_m",
    patterns: [/\bm\b/, /\bmeters?\b/i],
  },
  {
    normalized: "length_cm",
    patterns: [/\bcm\b/i, /\bcentimeters?\b/i],
  },
  {
    normalized: "duration_ms",
    patterns: [/\bms\b/i, /\bmilliseconds?\b/i],
  },
  {
    normalized: "duration_s",
    patterns: [/\bsec\b/i, /\bseconds?\b/i, /\bs\b/],
  },
  {
    normalized: "duration_min",
    patterns: [/\bmin\b/i, /\bminutes?\b/i],
  },
  {
    normalized: "duration_h",
    patterns: [/\bhr\b/i, /\bhours?\b/i, /\bh\b/],
  },
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function parseLocaleNumber(raw: string): number | null {
  const value = clean(raw);
  if (!value) return null;

  // Keep digits/sign/separators only.
  let normalized = value.replace(/[^\d,.\-+]/g, "");
  if (!normalized) return null;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // 1.234,56 -> 1234.56
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56 -> 1234.56
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    // If comma has 1-2 decimals after it, treat as decimal separator.
    const decimals = normalized.length - lastComma - 1;
    if (decimals > 0 && decimals <= 2) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectUnitRaw(text: string): { raw: string; normalized: string } | null {
  const source = clean(text).toLowerCase();
  if (!source) return null;

  for (const entry of UNIT_PATTERNS) {
    for (const pattern of entry.patterns) {
      const match = source.match(pattern);
      if (match && match[0]) {
        let raw = match[0];
        if (entry.normalized.startsWith("currency_")) {
          if (raw.includes("r$")) raw = "R$";
          else if (raw.includes("$")) raw = "$";
          else if (raw.includes("€")) raw = "€";
          else if (raw.includes("£")) raw = "£";
          else if (raw.includes("¥")) raw = "¥";
        }
        return { raw, normalized: entry.normalized };
      }
    }
  }
  return null;
}

export function normalizeCellUnit(params: {
  value?: string | null;
  colHeader?: string | null;
  rowLabel?: string | null;
}): NormalizedCellUnit {
  const value = clean(params.value);
  const colHeader = clean(params.colHeader);
  const rowLabel = clean(params.rowLabel);

  const fromValue = detectUnitRaw(value);
  const fromHeader = detectUnitRaw(colHeader);
  const fromRow = detectUnitRaw(rowLabel);
  const winner = fromValue || fromHeader || fromRow;

  return {
    unitRaw: winner?.raw ?? null,
    unitNormalized: winner?.normalized ?? null,
    numericValue: parseLocaleNumber(value),
  };
}
