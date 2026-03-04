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
  scaleRaw: string | null;
  scaleMultiplier: number | null;
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
    patterns: [/\busd\b/i, /\$\s*[0-9]/, /\bdollars?\b/i],
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
    patterns: [/\bgrams?\b/i, /\d\s+g\b/i],
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
    patterns: [/\bmeters?\b/i, /\d\s*m\b(?!\w)/],
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
    patterns: [/\bseconds?\b/i, /\bsecs?\b/i, /\d\s*s\b/],
  },
  {
    normalized: "duration_min",
    patterns: [/\bmin\b/i, /\bminutes?\b/i],
  },
  {
    normalized: "duration_h",
    patterns: [/\bhours?\b/i, /\bhrs?\b/i, /\d\s*h\b/i],
  },
];

const SCALE_PATTERNS: { pattern: RegExp; multiplier: number; raw: string }[] = [
  { pattern: /\bbillions?\b/i, multiplier: 1e9, raw: "billions" },
  { pattern: /\bbn\b/i, multiplier: 1e9, raw: "bn" },
  { pattern: /\bmillions?\b/i, multiplier: 1e6, raw: "millions" },
  { pattern: /\bmn\b/i, multiplier: 1e6, raw: "mn" },
  { pattern: /\bmm\b/i, multiplier: 1e6, raw: "mm" },
  { pattern: /\bthousands?\b/i, multiplier: 1e3, raw: "thousands" },
  { pattern: /'\s*000\b/, multiplier: 1e3, raw: "'000" },
  { pattern: /\bk\b/i, multiplier: 1e3, raw: "k" },
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function detectScale(
  text: string,
): { raw: string; multiplier: number } | null {
  const source = clean(text).toLowerCase();
  for (const entry of SCALE_PATTERNS) {
    if (entry.pattern.test(source)) {
      return { raw: entry.raw, multiplier: entry.multiplier };
    }
  }
  return null;
}

function parseLocaleNumber(raw: string): number | null {
  let value = clean(raw);
  if (!value) return null;

  // Accounting negative: (1,500) → -1500
  const parenMatch = value.match(/^\((.+)\)$/);
  if (parenMatch) {
    value = "-" + parenMatch[1];
  }

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

function detectUnitRaw(
  text: string,
): { raw: string; normalized: string } | null {
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

  const scaleFromHeader = detectScale(colHeader);
  const scaleFromRow = detectScale(rowLabel);
  const scale = scaleFromHeader || scaleFromRow;

  let numericValue = parseLocaleNumber(value);
  if (numericValue !== null && scale) {
    numericValue = numericValue * scale.multiplier;
  }

  return {
    unitRaw: winner?.raw ?? null,
    unitNormalized: winner?.normalized ?? null,
    numericValue,
    scaleRaw: scale?.raw ?? null,
    scaleMultiplier: scale?.multiplier ?? null,
  };
}

export interface UnitConsistencyResult {
  consistent: boolean;
  dominantUnit: string | null;
  conflicts: Array<{ cellRef?: string; unit: string | null }>;
}

export function checkRowUnitConsistency(
  cells: Array<{ unitNormalized?: string | null; cellRef?: string }>,
): UnitConsistencyResult {
  const unitCounts = new Map<string, number>();

  for (const cell of cells) {
    if (cell.unitNormalized) {
      unitCounts.set(
        cell.unitNormalized,
        (unitCounts.get(cell.unitNormalized) || 0) + 1,
      );
    }
  }

  if (unitCounts.size <= 1) {
    const dominant = unitCounts.size === 1
      ? [...unitCounts.keys()][0]
      : null;
    return { consistent: true, dominantUnit: dominant, conflicts: [] };
  }

  let dominantUnit: string | null = null;
  let maxCount = 0;
  for (const [unit, count] of unitCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantUnit = unit;
    }
  }

  const conflicts = cells
    .filter((c) => c.unitNormalized && c.unitNormalized !== dominantUnit)
    .map((c) => ({ cellRef: c.cellRef, unit: c.unitNormalized ?? null }));

  return { consistent: false, dominantUnit, conflicts };
}
