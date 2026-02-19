import crypto from "crypto";
import type { SpreadsheetModel, StyleModel } from "./spreadsheetModel.types";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepSort(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => deepSort(item));
  if (!isObject(input)) return input;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) out[key] = deepSort(input[key]);
  return out;
}

function stripEmpty(input: unknown): unknown {
  if (Array.isArray(input)) {
    const values = input
      .map((item) => stripEmpty(item))
      .filter((v) => v !== undefined);
    return values.length ? values : undefined;
  }
  if (!isObject(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const clean = stripEmpty(v);
    if (clean === undefined) continue;
    if (typeof clean === "string" && clean.trim() === "") continue;
    out[k] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

export function normalizeStyle(
  style: Partial<StyleModel> | null | undefined,
): StyleModel | null {
  const clean = stripEmpty(style) as StyleModel | undefined;
  if (!clean) return null;
  return deepSort(clean) as StyleModel;
}

export function mergeStyleModels(
  base: StyleModel | null | undefined,
  patch: Partial<StyleModel>,
): StyleModel {
  const source = (base || {}) as Record<string, unknown>;
  const delta = (patch || {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };

  for (const [k, v] of Object.entries(delta)) {
    if (isObject(v) && isObject(out[k])) {
      out[k] = { ...(out[k] as Record<string, unknown>), ...v };
    } else if (v === undefined) {
      continue;
    } else {
      out[k] = v;
    }
  }

  return (normalizeStyle(out) || {}) as StyleModel;
}

export function styleFingerprint(style: Partial<StyleModel>): string {
  const normalized = normalizeStyle(style) || {};
  const payload = JSON.stringify(normalized);
  return crypto.createHash("sha1").update(payload).digest("hex");
}

export function registerStyle(
  model: SpreadsheetModel,
  style?: Partial<StyleModel> | null,
): string | undefined {
  const normalized = normalizeStyle(style);
  if (!normalized) return undefined;
  const hash = styleFingerprint(normalized);
  const key = `s_${hash.slice(0, 12)}`;

  if (!model.styles[key]) {
    model.styles[key] = normalized;
    return key;
  }

  const existing = JSON.stringify(model.styles[key]);
  const incoming = JSON.stringify(normalized);
  if (existing === incoming) return key;

  let i = 2;
  while (model.styles[`${key}_${i}`]) i += 1;
  const finalKey = `${key}_${i}`;
  model.styles[finalKey] = normalized;
  return finalKey;
}
