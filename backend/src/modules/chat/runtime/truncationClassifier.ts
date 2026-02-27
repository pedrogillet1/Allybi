const PROVIDER_TRUNCATION_REASONS = new Set([
  "length",
  "max_tokens",
  "max_output_tokens",
]);

const TRIM_REPAIR_CODES = new Set([
  "SOFT_MAX_TOKENS_TRIMMED",
  "HARD_MAX_TOKENS_TRIMMED",
  "HARD_MAX_CHARS_TRIMMED",
  "HARD_MAX_TOKENS_EMERGENCY_TRIMMED",
  "SHORT_CONSTRAINT_TRIMMED_TOKENS",
  "SHORT_CONSTRAINT_TRIMMED_CHARS",
]);

export const SEMANTIC_TRUNCATION_DETECTOR_VERSION = "semantic_v2";

export interface ProviderTruncationState {
  occurred: boolean;
  reason: string | null;
}

export interface SemanticTruncationState {
  occurred: boolean;
  reason: string | null;
  detectorVersion: string;
  signals: string[];
}

export interface VisibleTruncationInput {
  finalText: string;
  enforcementRepairs?: string[] | null;
  providerTruncation?: ProviderTruncationState | null;
}

function toReason(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasStrongTerminalClosure(text: string): boolean {
  return /[.!?。！？]$/.test(text);
}

function hasStructuredTerminalClosure(text: string): boolean {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const last = lines[lines.length - 1];
  if (/^\|.*\|$/.test(last)) return true;
  if (/^[-*]\s+\S+/.test(last)) return true;
  if (/^\d+\.\s+\S+/.test(last)) return true;
  if (/^>\s+\S+/.test(last)) return true;
  return false;
}

function hasUnbalancedMarkdownOrDelimiters(text: string): boolean {
  const codeFenceCount = (text.match(/```/g) || []).length;
  if (codeFenceCount % 2 !== 0) return true;

  const inlineBacktickCount = (text.match(/`/g) || []).length;
  if (inlineBacktickCount % 2 !== 0) return true;

  const parensOpen = (text.match(/\(/g) || []).length;
  const parensClose = (text.match(/\)/g) || []).length;
  if (parensOpen !== parensClose) return true;

  const bracketsOpen = (text.match(/\[/g) || []).length;
  const bracketsClose = (text.match(/\]/g) || []).length;
  if (bracketsOpen !== bracketsClose) return true;

  const doubleQuotes = (text.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) return true;

  const leftCurlyQuotes = (text.match(/“/g) || []).length;
  const rightCurlyQuotes = (text.match(/”/g) || []).length;
  if (leftCurlyQuotes !== rightCurlyQuotes) return true;

  return false;
}

function endsWithContinuationPunctuation(text: string): boolean {
  return /[,:;\-\/\\(“"']$/.test(text);
}

function looksSemanticallyIncomplete(text: string): boolean {
  const value = String(text || "").trim();
  if (!value) return true;
  if (hasUnbalancedMarkdownOrDelimiters(value)) return true;
  if (hasStrongTerminalClosure(value)) return false;
  if (hasStructuredTerminalClosure(value)) return false;
  if (endsWithContinuationPunctuation(value)) return true;

  const words = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length >= 10) return true;
  if (value.length >= 120) return true;
  return false;
}

export function normalizeFinishReason(value: unknown): string {
  return toReason(value);
}

export function classifyProviderTruncation(
  telemetry?: Record<string, unknown> | null,
): ProviderTruncationState {
  const reason = toReason(
    telemetry && typeof telemetry === "object" ? telemetry.finishReason : null,
  );
  const occurred = PROVIDER_TRUNCATION_REASONS.has(reason);
  return {
    occurred,
    reason: occurred ? reason : null,
  };
}

export function classifyVisibleTruncation(
  input: VisibleTruncationInput,
): SemanticTruncationState {
  const signals: string[] = [];
  const repairs = Array.isArray(input.enforcementRepairs)
    ? input.enforcementRepairs
    : [];
  const provider = input.providerTruncation || {
    occurred: false,
    reason: null,
  };

  if (repairs.some((repair) => TRIM_REPAIR_CODES.has(String(repair || "")))) {
    signals.push("enforcer_trim_repair");
    const incompleteAfterTrim = looksSemanticallyIncomplete(input.finalText);
    if (incompleteAfterTrim) {
      signals.push("semantic_incomplete_after_trim");
      return {
        occurred: true,
        reason: "enforcer_trimmed",
        detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
        signals,
      };
    }
    signals.push("semantic_complete_after_trim");
    return {
      occurred: false,
      reason: null,
      detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
      signals,
    };
  }

  if (!provider.occurred) {
    return {
      occurred: false,
      reason: null,
      detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
      signals,
    };
  }

  if (looksSemanticallyIncomplete(input.finalText)) {
    signals.push("provider_overflow");
    signals.push("semantic_incomplete");
    return {
      occurred: true,
      reason: "semantic_incomplete_after_provider_overflow",
      detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
      signals,
    };
  }

  signals.push("provider_overflow");
  signals.push("semantic_complete");
  return {
    occurred: false,
    reason: null,
    detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
    signals,
  };
}

export function isSemanticTruncationV2Enabled(env = process.env): boolean {
  const value = String(env.TRUNCATION_SEMANTIC_V2_ENABLED || "")
    .trim()
    .toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no" || value === "off") {
    return false;
  }
  const nodeEnv = String(env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging";
}
