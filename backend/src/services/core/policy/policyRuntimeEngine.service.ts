export type PolicyPredicate = {
  path?: string;
  op?:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in"
    | "contains";
  value?: unknown;
};

export type PolicyWhen = {
  any?: Array<PolicyPredicate | Record<string, unknown>>;
  all?: Array<PolicyPredicate | Record<string, unknown>>;
  path?: string;
  op?: PolicyPredicate["op"];
  value?: unknown;
};

export type PolicyRule = {
  id?: string;
  ruleId?: string;
  priority?: number;
  terminal?: boolean;
  severity?: "critical" | "high" | "medium" | "low" | "info";
  when?: PolicyWhen | Record<string, unknown>;
  then?: Record<string, unknown>;
  reasonCode?: string;
};

export type PolicyBankLike = {
  config?: {
    defaultAction?: string | Record<string, unknown>;
  };
  rules?: PolicyRule[];
  policies?: {
    rules?: PolicyRule[];
  };
};

export type PolicyMatch = {
  ruleId: string;
  reasonCode: string | null;
  then: Record<string, unknown>;
  priority: number;
  terminal: boolean;
  severity: "critical" | "high" | "medium" | "low" | "info";
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function getPath(input: Record<string, unknown>, path: string): unknown {
  const normalized = String(path || "").trim();
  if (!normalized) return undefined;
  const segments = normalized.split(".").filter(Boolean);
  let cursor: unknown = input;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function evalPredicate(
  predicate: PolicyPredicate,
  runtime: Record<string, unknown>,
): boolean {
  const path = String(predicate.path || "").trim();
  const op = String(predicate.op || "eq").trim().toLowerCase();
  if (!path) return false;
  const actual = getPath(runtime, path);
  const expected = predicate.value;

  if (op === "eq") return actual === expected;
  if (op === "neq") return actual !== expected;

  if (op === "contains") {
    if (Array.isArray(actual)) return actual.includes(expected);
    return String(actual || "").includes(String(expected || ""));
  }

  if (op === "in") {
    if (!Array.isArray(expected)) return false;
    return expected.includes(actual);
  }

  const actualNum = toNumber(actual);
  const expectedNum = toNumber(expected);
  if (actualNum == null || expectedNum == null) return false;

  if (op === "gt") return actualNum > expectedNum;
  if (op === "gte") return actualNum >= expectedNum;
  if (op === "lt") return actualNum < expectedNum;
  if (op === "lte") return actualNum <= expectedNum;

  return false;
}

function evalWhen(when: PolicyWhen | Record<string, unknown>, runtime: Record<string, unknown>): boolean {
  const normalized = asObject(when);
  if (normalized.all === true || normalized.any === true) return true;

  if (Array.isArray(normalized.all) && normalized.all.length > 0) {
    const ok = normalized.all.every((entry) =>
      evalPredicate(asObject(entry) as PolicyPredicate, runtime),
    );
    if (!ok) return false;
  }

  if (Array.isArray(normalized.any) && normalized.any.length > 0) {
    const ok = normalized.any.some((entry) =>
      evalPredicate(asObject(entry) as PolicyPredicate, runtime),
    );
    if (!ok) return false;
  }

  if (typeof normalized.path === "string") {
    return evalPredicate(
      {
        path: normalized.path,
        op: (normalized.op as PolicyPredicate["op"]) || "eq",
        value: normalized.value,
      },
      runtime,
    );
  }

  if (!Array.isArray(normalized.all) && !Array.isArray(normalized.any)) {
    return false;
  }

  return true;
}

function normalizeSeverity(value: unknown): "critical" | "high" | "medium" | "low" | "info" {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "critical") return "critical";
  if (raw === "high") return "high";
  if (raw === "low") return "low";
  if (raw === "info") return "info";
  return "medium";
}

function normalizeDefaultAction(
  input: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === "string") {
    const action = input.trim();
    if (!action) return null;
    return { action };
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return null;
}

export function extractPolicyRules(policy: unknown): PolicyRule[] {
  const bank = asObject(policy) as PolicyBankLike;
  const topRules = Array.isArray(bank.rules) ? bank.rules : [];
  const nestedRules = Array.isArray(bank.policies?.rules)
    ? (bank.policies?.rules as PolicyRule[])
    : [];
  return [...topRules, ...nestedRules];
}

export class PolicyRuntimeEngine {
  firstMatch(input: {
    rules?: PolicyRule[];
    policyBank?: PolicyBankLike | Record<string, unknown> | null;
    runtime: Record<string, unknown>;
    defaultAction?: string | Record<string, unknown> | null;
  }): PolicyMatch | null {
    const bankRules = input.policyBank ? extractPolicyRules(input.policyBank) : [];
    const rules = [...(input.rules || []), ...bankRules];
    const sorted = [...rules].sort((a, b) => {
      const pa = Number(a.priority || 0);
      const pb = Number(b.priority || 0);
      if (pb !== pa) return pb - pa;
      const aid = String(a.id || a.ruleId || "");
      const bid = String(b.id || b.ruleId || "");
      return aid.localeCompare(bid);
    });

    for (const rule of sorted) {
      const when = asObject(rule.when);
      if (!Object.keys(when).length) continue;
      if (!evalWhen(when, input.runtime || {})) continue;
      const ruleId = String(rule.id || rule.ruleId || "unknown_rule");
      return {
        ruleId,
        reasonCode: String(rule.reasonCode || "").trim() || null,
        then: asObject(rule.then),
        priority: Number(rule.priority || 0),
        terminal: Boolean(rule.terminal),
        severity: normalizeSeverity(rule.severity),
      };
    }

    const policyConfig = asObject(asObject(input.policyBank).config);
    const defaultAction =
      normalizeDefaultAction(input.defaultAction) ||
      normalizeDefaultAction(policyConfig.defaultAction as
        | string
        | Record<string, unknown>
        | null
        | undefined);
    if (defaultAction) {
      return {
        ruleId: "__default__",
        reasonCode: null,
        then: defaultAction,
        priority: -1,
        terminal: false,
        severity: "info",
      };
    }

    return null;
  }
}
