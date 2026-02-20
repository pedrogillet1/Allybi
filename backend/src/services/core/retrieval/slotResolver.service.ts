/**
 * SlotResolver — resolves user queries to entity-role slot contracts.
 *
 * When a user asks "who is the owner?" this service identifies the target
 * role (owner), the extraction mode (STRICT_EXTRACT), forbidden confusion
 * roles (signatory, witness, etc.), and the anchor labels to look for in
 * evidence snippets.
 *
 * Driven entirely by data banks: query_slot_contracts + entity_role_ontology.
 */

import { getBank } from "../banks/bankLoader.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlotContract {
  slotId: string;
  targetRoleId: string;
  extractionMode: "STRICT_EXTRACT" | "ALLOW_INFERENCE" | null;
  forbidden: string[];
  confusionPenalties: Array<{ role: string; penalty: number }>;
  anchorLabels: string[];
  confidence: number;
}

export interface SlotResolutionResult {
  resolved: boolean;
  contract: SlotContract | null;
  isExtractionQuery: boolean;
}

// ---------------------------------------------------------------------------
// Bank shape (subset we need)
// ---------------------------------------------------------------------------

interface SlotPatternEntry {
  id: string;
  patterns: Record<string, string[]>;
  targetRoleId: string;
  extractionMode: "STRICT_EXTRACT" | "ALLOW_INFERENCE";
  forbidden: string[];
  confusionPenalties: Array<{ role: string; penalty: number }>;
  anchorLabels: Record<string, string[]>;
}

interface QuerySlotContractsBank {
  config: { enabled: boolean; minPatternConfidence: number };
  slots: SlotPatternEntry[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const EMPTY_RESULT: SlotResolutionResult = {
  resolved: false,
  contract: null,
  isExtractionQuery: false,
};

/**
 * Resolve a user query to a slot contract.
 *
 * @param query  - raw user query text
 * @param language - detected language code ("en" | "pt" | etc.)
 * @returns SlotResolutionResult with the best matching contract or empty
 */
export function resolveSlot(
  query: string,
  language: string,
): SlotResolutionResult {
  let bank: QuerySlotContractsBank | null;
  try {
    bank = getBank<QuerySlotContractsBank>("query_slot_contracts");
  } catch {
    return EMPTY_RESULT;
  }
  if (!bank?.config?.enabled || !Array.isArray(bank.slots)) {
    return EMPTY_RESULT;
  }

  const minConf = bank.config.minPatternConfidence ?? 0.75;
  const normalizedQuery = query.trim().toLowerCase();
  const lang = language.toLowerCase();

  let bestMatch: { slot: SlotPatternEntry; confidence: number } | null = null;

  for (const slot of bank.slots) {
    // Try language-specific patterns first, then fall back to "en"
    const patterns = slot.patterns[lang] ?? slot.patterns["en"] ?? [];

    for (const pat of patterns) {
      try {
        const rx = new RegExp(pat, "i");
        if (rx.test(normalizedQuery)) {
          // Confidence: 1.0 for exact pattern hit; could be refined later
          // with match quality scoring.
          const confidence = 1.0;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { slot, confidence };
          }
          break; // first matching pattern in this slot is enough
        }
      } catch {
        // Invalid regex in bank — skip silently
      }
    }
  }

  if (!bestMatch || bestMatch.confidence < minConf) {
    return EMPTY_RESULT;
  }

  const s = bestMatch.slot;
  const anchorLabels = s.anchorLabels[lang] ?? s.anchorLabels["en"] ?? [];

  return {
    resolved: true,
    contract: {
      slotId: s.id,
      targetRoleId: s.targetRoleId,
      extractionMode: s.extractionMode ?? null,
      forbidden: s.forbidden ?? [],
      confusionPenalties: s.confusionPenalties ?? [],
      anchorLabels,
      confidence: bestMatch.confidence,
    },
    isExtractionQuery: true,
  };
}
