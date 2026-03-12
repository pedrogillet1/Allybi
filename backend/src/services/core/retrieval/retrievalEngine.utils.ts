import crypto from "crypto";
import type { BankLoader } from "./retrieval.types";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Safely load a bank by ID, returning null on failure instead of throwing.
 */
export function safeGetBank<T = unknown>(bankLoader: BankLoader, bankId: string): T | null {
  try {
    return bankLoader.getBank<T>(bankId);
  } catch {
    return null;
  }
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isProductionEnv(env: string): boolean {
  return env === "production";
}

export function stableLocationKey(
  docId: string,
  location: {
    page?: number | null;
    sheet?: string | null;
    slide?: number | null;
    sectionKey?: string | null;
  },
  fallbackId: string,
): string {
  const parts = [
    `d:${docId}`,
    location.page != null ? `p:${location.page}` : "",
    location.sheet ? `s:${location.sheet}` : "",
    location.slide != null ? `sl:${location.slide}` : "",
    location.sectionKey ? `sec:${location.sectionKey}` : "",
  ].filter(Boolean);
  const base = parts.join("|");
  return base.length ? base : `d:${docId}|c:${fallbackId}`;
}
