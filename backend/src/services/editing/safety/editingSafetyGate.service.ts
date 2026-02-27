import type {
  EditPlan,
  EditSafetyGateDecision,
  EditTrustLevel,
} from "../editing.types";

const DESTRUCTIVE_RUNTIME_OPERATORS = new Set([
  "DELETE_SHEET",
  "EDIT_RANGE",
  "REPLACE_SLIDE_IMAGE",
]);

const DESTRUCTIVE_CANONICAL_MARKERS = [
  "DELETE",
  "REMOVE",
  "FIND_REPLACE",
  "REWRITE_SECTION",
  "MERGE",
  "SPLIT",
  "SORT_RANGE",
  "FILTER_APPLY",
  "SET_RANGE_VALUES",
  "SET_RANGE_FORMULAS",
];

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |the )?(previous|prior) instructions/i,
  /ignore (all |the )?(safety|policy|guardrail)/i,
  /system prompt/i,
  /developer message/i,
  /jailbreak/i,
  /do anything now/i,
  /bypass (all |the )?(rules|policies|checks)/i,
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function coerceEditTrustLevel(value: unknown): EditTrustLevel {
  const v = asString(value).toLowerCase();
  if (v === "trusted_user") return "trusted_user";
  if (v === "untrusted_content") return "untrusted_content";
  return "normal_user";
}

function parseRangeCellCount(targetId: string): number {
  const raw = asString(targetId);
  const range =
    raw.indexOf("!") >= 0 ? raw.slice(raw.indexOf("!") + 1).trim() : raw;
  const m = range.match(
    /^([A-Za-z]{1,3})(\d{1,7})(?::([A-Za-z]{1,3})(\d{1,7}))?$/,
  );
  if (!m) return 0;
  const colToIndex = (col: string): number => {
    let out = 0;
    const up = col.toUpperCase();
    for (let i = 0; i < up.length; i += 1) {
      const code = up.charCodeAt(i);
      if (code < 65 || code > 90) return 0;
      out = out * 26 + (code - 64);
    }
    return out;
  };
  const c1 = colToIndex(m[1]);
  const r1 = Number(m[2]);
  const c2 = m[3] ? colToIndex(m[3]) : c1;
  const r2 = m[4] ? Number(m[4]) : r1;
  if (!Number.isFinite(c1) || !Number.isFinite(c2)) return 0;
  return Math.max(1, (Math.abs(c2 - c1) + 1) * (Math.abs(r2 - r1) + 1));
}

function isValidConfirmationToken(token: string | undefined): boolean {
  const t = asString(token).toLowerCase();
  if (!t) return false;
  return (
    t.startsWith("confirm:") ||
    t.startsWith("editing-confirm-") ||
    t.startsWith("edit-confirm-")
  );
}

export class EditingSafetyGateService {
  evaluate(input: {
    plan: EditPlan;
    beforeText: string;
    proposedText: string;
    targetId?: string | null;
    userConfirmed: boolean;
    confirmationToken?: string;
    trustLevel?: EditTrustLevel;
  }): EditSafetyGateDecision {
    const trustLevel = coerceEditTrustLevel(input.trustLevel);
    const canonical = asString(input.plan.canonicalOperator).toUpperCase();
    const textCorpus = `${input.plan.normalizedInstruction}\n${input.beforeText}\n${input.proposedText}`;
    const injectionDetected = INJECTION_PATTERNS.some((rx) =>
      rx.test(textCorpus),
    );
    const destructiveByRuntime = DESTRUCTIVE_RUNTIME_OPERATORS.has(
      input.plan.operator,
    );
    const destructiveByCanonical = DESTRUCTIVE_CANONICAL_MARKERS.some((m) =>
      canonical.includes(m),
    );
    const bulkRangeCells = parseRangeCellCount(String(input.targetId || ""));
    const largeBlastRadius = bulkRangeCells >= 500;
    const destructive =
      destructiveByRuntime || destructiveByCanonical || largeBlastRadius;

    const requiresConfirmationToken =
      destructive &&
      (destructiveByCanonical ||
        trustLevel !== "trusted_user" ||
        injectionDetected ||
        largeBlastRadius);
    const hasToken = isValidConfirmationToken(input.confirmationToken);

    const reasons: string[] = [];
    if (destructive) reasons.push("destructive_operation");
    if (largeBlastRadius)
      reasons.push(`blast_radius_cells:${String(bulkRangeCells)}`);
    if (injectionDetected) reasons.push("prompt_injection_detected");
    if (trustLevel === "untrusted_content")
      reasons.push("untrusted_content_source");
    if (requiresConfirmationToken && !hasToken)
      reasons.push("confirmation_token_required");
    if (destructive && !input.userConfirmed)
      reasons.push("user_confirmation_required");

    let riskScore = 0.1;
    if (destructive) riskScore += 0.35;
    if (largeBlastRadius) riskScore += 0.2;
    if (injectionDetected) riskScore += 0.35;
    if (trustLevel === "untrusted_content") riskScore += 0.2;
    if (trustLevel === "trusted_user") riskScore -= 0.05;
    riskScore = clamp01(riskScore);

    if (
      destructive &&
      injectionDetected &&
      trustLevel !== "trusted_user" &&
      !hasToken
    ) {
      return {
        decision: "block",
        trustLevel,
        riskScore,
        destructive,
        injectionDetected,
        requiresConfirmationToken,
        reasons,
      };
    }
    if (destructive && !input.userConfirmed) {
      return {
        decision: "confirm",
        trustLevel,
        riskScore,
        destructive,
        injectionDetected,
        requiresConfirmationToken,
        reasons,
      };
    }
    if (requiresConfirmationToken && !hasToken) {
      return {
        decision: injectionDetected ? "block" : "confirm",
        trustLevel,
        riskScore,
        destructive,
        injectionDetected,
        requiresConfirmationToken,
        reasons,
      };
    }
    if (injectionDetected && trustLevel !== "trusted_user") {
      return {
        decision: "confirm",
        trustLevel,
        riskScore,
        destructive,
        injectionDetected,
        requiresConfirmationToken,
        reasons,
      };
    }

    return {
      decision: "allow",
      trustLevel,
      riskScore,
      destructive,
      injectionDetected,
      requiresConfirmationToken,
      reasons,
    };
  }
}
