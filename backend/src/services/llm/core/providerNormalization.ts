import type { LLMProvider } from "./llmErrors.types";

export type CanonicalProvider = "openai" | "google";

function normalizeRaw(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Canonical provider mapping used by routing, gateway execution, telemetry,
 * and admin cost accounting. Unknown values intentionally return null.
 */
export function canonicalizeProvider(value: unknown): CanonicalProvider | null {
  const raw = normalizeRaw(value);
  if (!raw || raw === "unknown") return null;

  if (
    raw === "google" ||
    raw === "gemini" ||
    raw.includes("google") ||
    raw.includes("gemini")
  ) {
    return "google";
  }

  if (raw === "openai" || raw.includes("openai") || raw.startsWith("gpt")) {
    return "openai";
  }

  return null;
}

export function canonicalizeProviderWithUnknown(
  value: unknown,
): CanonicalProvider | "unknown" {
  return canonicalizeProvider(value) ?? "unknown";
}

export function canonicalizeToLlmProvider(value: unknown): LLMProvider {
  return canonicalizeProviderWithUnknown(value);
}
