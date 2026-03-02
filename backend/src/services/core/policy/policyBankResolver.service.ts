import * as fs from "fs";
import * as path from "path";

import { getOptionalBank } from "../banks/bankLoader.service";

function resolvePolicyPath(filename: string): string | null {
  const normalized = String(filename || "").trim();
  if (!normalized) return null;

  const candidates = [
    path.join(process.cwd(), "src/data_banks/policies", normalized),
    path.join(process.cwd(), "backend/src/data_banks/policies", normalized),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolvePolicyBank<T = unknown>(
  bankId: string,
  filename: string,
): T | null {
  const fromLoader = getOptionalBank<T>(bankId);
  if (fromLoader) return fromLoader;

  const filePath = resolvePolicyPath(filename);
  if (!filePath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as T;
  } catch {
    return null;
  }
}
