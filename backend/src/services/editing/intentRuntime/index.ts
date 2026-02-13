/**
 * Intent Runtime — public API.
 *
 * Main entry point for the data-driven intent-to-plan engine.
 * Pipeline: segment → match → slotFill → assemble → worklog
 *
 * Usage:
 *   const result = analyzeMessageToPlan({
 *     message: "In SUMMARY 1!D35:D48, set every cell to 0",
 *     domain: "excel",
 *     viewerContext: { sheetName: "SUMMARY 1" },
 *     language: "en",
 *   });
 */

import type {
  AnalyzeInput,
  IntentPlan,
  ClarificationNeeded,
  MatchResult,
  SlotFillResult,
} from "./types";
import { segmentMessage } from "./segmenter";
import { matchAllSegments } from "./matcher";
import { fillSlots } from "./slotFill";
import { assemblePlan } from "./planAssembler";

// Re-export types for external consumers
export type {
  AnalyzeInput,
  IntentPlan,
  ClarificationNeeded,
  IntentPattern,
  ResolvedPlanStep,
  WorklogStep,
  OperatorCatalog,
  OperatorCatalogEntry,
} from "./types";

export { clearCaches } from "./loaders";
export { runCoverage, generateMarkdownReport } from "./coverage";

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function detectLanguage(message: string): "en" | "pt" {
  const low = String(message || "").toLowerCase();
  if (/\b(portugu[eê]s|pt-br|pt)\b/.test(low)) return "pt";
  if (/[ãõçáâêôàéíóú]/.test(low)) return "pt";
  return "en";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeMessageToPlan(
  input: AnalyzeInput,
): IntentPlan | ClarificationNeeded | null {
  const message = String(input.message || "").trim();
  if (!message) return null;

  const language = input.language || detectLanguage(message);
  const domain = input.domain;

  // 1. Segment the message into directives
  const segments = segmentMessage(message, language);
  if (segments.length === 0) return null;

  // 2. Match each segment against pattern banks
  const matchResults: MatchResult[] = matchAllSegments(
    segments,
    domain,
    language,
  );

  // If no segments matched, return null (fall through to existing pipeline)
  const hasAnyMatch = matchResults.some((r) => r.bestMatch !== null);
  if (!hasAnyMatch) return null;

  // 3. Fill slots for each matched segment
  const slotResults: SlotFillResult[] = matchResults.map((mr) => {
    if (!mr.bestMatch) {
      return { filled: {}, missing: [] };
    }
    return fillSlots(
      mr.bestMatch.pattern,
      mr.segment.text,
      input.viewerContext,
    );
  });

  // 4. Assemble the plan
  const result = assemblePlan({
    matchResults,
    slotResults,
    domain,
    language,
  });

  // If plan has zero ops, return null to fall through
  if (result.kind === "plan" && result.ops.length === 0) return null;

  return result;
}
