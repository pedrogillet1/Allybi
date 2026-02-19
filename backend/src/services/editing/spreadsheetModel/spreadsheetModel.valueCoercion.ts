import type { CellType, CellValue } from "./spreadsheetModel.types";

export type TypedCellValue = {
  v: CellValue;
  t: CellType;
};

export function coerceScalarToTypedValue(input: unknown): TypedCellValue {
  if (input === null || input === undefined) return { v: null, t: "s" };

  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { v: String(input), t: "s" };
    return { v: input, t: "n" };
  }

  if (typeof input === "boolean") return { v: input, t: "b" };

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { v: null, t: "d" };
    return { v: input.toISOString(), t: "d" };
  }

  const raw = String(input).trim();
  if (!raw) return { v: "", t: "s" };
  if (/^(null|empty|blank)$/i.test(raw)) return { v: null, t: "s" };
  if (/^(true|false)$/i.test(raw))
    return { v: raw.toLowerCase() === "true", t: "b" };

  const pct = raw.match(/^(-?[\d,.]+)\s*%$/);
  if (pct?.[1]) {
    const n = Number(pct[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return { v: n / 100, t: "n" };
  }

  const numberLike = /^-?[\d,]+(?:\.\d+)?$/;
  if (numberLike.test(raw)) {
    const n = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(n)) return { v: n, t: "n" };
  }

  const dateLike = /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/;
  if (dateLike.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return { v: d.toISOString(), t: "d" };
  }

  return { v: raw, t: "s" };
}

export function normalizeFormula(input: unknown): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return raw.startsWith("=") ? raw.slice(1).trim() : raw;
}
