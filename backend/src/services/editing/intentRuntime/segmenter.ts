/**
 * Multi-intent segmenter.
 *
 * Splits a single user message into multiple directive segments,
 * respecting quoted strings and recognizing language-specific connectors.
 */

import type { Segment } from "./types";
import { getConnectors } from "./loaders";

// ---------------------------------------------------------------------------
// Default connector patterns (used when lexicon bank is unavailable)
// ---------------------------------------------------------------------------

const DEFAULT_CONNECTORS_EN = [
  "and then",
  "and also",
  "after that",
  "then",
  "also",
  "plus",
  "as well",
  "additionally",
  "furthermore",
  "next",
  "and",
];

const DEFAULT_CONNECTORS_PT = [
  "em seguida",
  "além disso",
  "e também",
  "e depois",
  "depois",
  "também",
  "a seguir",
  "adicionalmente",
  "então",
  "e",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function segmentMessage(
  message: string,
  language: "en" | "pt",
): Segment[] {
  const text = String(message || "").trim();
  if (!text) return [];

  // Try loading connectors from lexicon banks, fall back to defaults
  let connectors = getConnectors(language);
  if (!connectors.length) {
    connectors =
      language === "pt" ? DEFAULT_CONNECTORS_PT : DEFAULT_CONNECTORS_EN;
  }

  // Sort connectors by length descending so longer phrases match first
  const sorted = [...connectors].sort((a, b) => b.length - a.length);

  // Build a combined regex from connectors
  const escaped = sorted.map((c) =>
    c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  // Match: comma-space, semicolon-space, or a connector bounded by word boundaries
  const separatorParts = ["[;]\\s*", ",\\s+"];
  if (escaped.length > 0) {
    separatorParts.push(`\\b(?:${escaped.join("|")})\\b`);
  }
  const separatorRegex = new RegExp(`(?:${separatorParts.join("|")})`, "i");

  // Split while respecting quoted strings
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    // Track quotes
    if (ch === '"' || ch === "'") {
      if (!quote) {
        quote = ch as '"' | "'";
      } else if (quote === ch) {
        quote = null;
      }
      current += ch;
      continue;
    }

    // Only try separator matching outside quotes
    if (!quote) {
      const rest = text.slice(i);
      const m = rest.match(separatorRegex);
      if (m && m.index === 0) {
        if (current.trim()) segments.push(current.trim());
        current = "";
        i += m[0].length - 1;
        continue;
      }

      // Also split on numbered list items: "1. ... 2. ..."
      const numberedMatch = rest.match(/^(?:\n|\r\n?)\s*\d+[.)]\s+/);
      if (numberedMatch) {
        if (current.trim()) segments.push(current.trim());
        current = "";
        i += numberedMatch[0].length - 1;
        continue;
      }

      // Also split on bullet items
      const bulletMatch = rest.match(/^(?:\n|\r\n?)\s*[-•*]\s+/);
      if (bulletMatch) {
        if (current.trim()) segments.push(current.trim());
        current = "";
        i += bulletMatch[0].length - 1;
        continue;
      }
    }

    current += ch;
  }
  if (current.trim()) segments.push(current.trim());

  // If nothing was split, return original message as single segment
  if (segments.length === 0) segments.push(text);

  return segments.map((s, idx) => ({ text: s, index: idx }));
}
