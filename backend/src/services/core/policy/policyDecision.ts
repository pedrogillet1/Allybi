export type PolicyDecision = {
  action: string;
  ruleId: string | null;
  reasonCode: string | null;
  terminal: boolean;
  routeTo?: string | null;
  category?: string | null;
  constraints?: Record<string, unknown> | null;
};

export function allowPolicyDecision(): PolicyDecision {
  return {
    action: "allow",
    ruleId: null,
    reasonCode: null,
    terminal: false,
    routeTo: null,
    category: null,
    constraints: null,
  };
}

export function blockedFromAction(action: string): boolean {
  const normalized = String(action || "")
    .trim()
    .toLowerCase();
  return normalized.length > 0 && normalized !== "allow";
}
