type UiPredicate = {
  path?: string;
  op?:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "in";
  value?: unknown;
};

type UiWhen = {
  all?: UiPredicate[];
  any?: UiPredicate[];
  path?: string;
  op?: UiPredicate["op"];
  value?: unknown;
};

type UiRule = {
  id?: string;
  reasonCode?: string;
  severity?: string;
  when?: UiWhen;
  triggerPatterns?: Record<string, string[]>;
  action?: {
    type?: string;
    contract?: string;
    stripDisallowedTextPatterns?: boolean;
    suppressActions?: boolean;
  };
};

type UiContractsBank = {
  _meta?: {
    id?: string;
    version?: string;
  };
  config?: {
    enabled?: boolean;
    actionsContract?: {
      thresholds?: {
        maxIntroSentencesNavPills?: number;
        maxClarificationQuestions?: number;
      };
    };
  };
  contracts?: {
    nav_pills?: {
      maxIntroSentences?: number;
      maxIntroChars?: number;
      noSourcesHeader?: boolean;
      noInlineCitations?: boolean;
      disallowedTextPatterns?: string[];
    };
  };
  rules?: UiRule[];
};

export type UiContractDecision = {
  enabled: boolean;
  version: string | null;
  appliedRuleIds: string[];
  appliedContracts: string[];
  suppressActionLanguage: boolean;
  suppressRegexes: string[];
  shouldHardBlock: boolean;
  hardBlockReasonCode: string | null;
  maxClarificationQuestions: number;
  navPills: {
    maxIntroSentences: number;
    maxIntroChars: number;
    noSourcesHeader: boolean;
    noInlineCitations: boolean;
    disallowedTextPatterns: string[];
  };
};

type ResolveInput = {
  bank: UiContractsBank | null | undefined;
  answerMode: string;
  language: "en" | "pt" | "es";
  signals?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  content: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
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
  predicate: UiPredicate,
  runtime: Record<string, unknown>,
): boolean {
  const path = String(predicate.path || "").trim();
  const op = String(predicate.op || "eq")
    .trim()
    .toLowerCase();
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

  const actualNum = Number(actual);
  const expectedNum = Number(expected);
  if (!Number.isFinite(actualNum) || !Number.isFinite(expectedNum)) return false;
  if (op === "gt") return actualNum > expectedNum;
  if (op === "gte") return actualNum >= expectedNum;
  if (op === "lt") return actualNum < expectedNum;
  if (op === "lte") return actualNum <= expectedNum;
  return false;
}

function evalWhen(when: UiWhen | undefined, runtime: Record<string, unknown>): boolean {
  const normalized = asObject(when);
  if (!when) return true;
  const all = Array.isArray(normalized.all)
    ? (normalized.all as UiPredicate[])
    : null;
  const any = Array.isArray(normalized.any)
    ? (normalized.any as UiPredicate[])
    : null;

  if (all && all.length > 0) {
    if (!all.every((predicate) => evalPredicate(predicate, runtime))) return false;
  }
  if (any && any.length > 0) {
    if (!any.some((predicate) => evalPredicate(predicate, runtime))) return false;
  }

  if (typeof normalized.path === "string") {
    return evalPredicate(
      {
        path: normalized.path,
        op: (normalized.op as UiPredicate["op"]) || "eq",
        value: normalized.value,
      },
      runtime,
    );
  }

  if (!all && !any) return false;
  return true;
}

function regexMatchesAny(text: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (!String(pattern || "").trim()) continue;
    try {
      const rx = new RegExp(pattern, "i");
      if (rx.test(text)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function languagePatterns(
  byLanguage: Record<string, string[]> | undefined,
  language: "en" | "pt" | "es",
): string[] {
  if (!byLanguage || typeof byLanguage !== "object") return [];
  const specific = Array.isArray(byLanguage[language]) ? byLanguage[language] : [];
  const any = Array.isArray(byLanguage.any) ? byLanguage.any : [];
  return [...specific, ...any].filter((value) => String(value || "").trim().length > 0);
}

function countQuestions(text: string): number {
  const matches = String(text || "").match(/\?/g);
  return Array.isArray(matches) ? matches.length : 0;
}

export class UiContractInterpreterService {
  resolve(input: ResolveInput): UiContractDecision {
    const bank = input.bank || null;
    const contracts = asObject((bank as UiContractsBank | null)?.contracts);
    const navBank = asObject(contracts.nav_pills);
    const thresholds = asObject(
      asObject(asObject((bank as UiContractsBank | null)?.config).actionsContract)
        .thresholds,
    );
    const runtime = {
      answerMode: String(input.answerMode || "").trim(),
      signals: asObject(input.signals),
      metrics: {
        ...asObject(input.metrics),
        clarificationQuestionCount: countQuestions(input.content),
      },
    } as Record<string, unknown>;

    const decision: UiContractDecision = {
      enabled: asObject((bank as UiContractsBank | null)?.config).enabled !== false,
      version:
        String(asObject((bank as UiContractsBank | null)?._meta).version || "").trim() ||
        null,
      appliedRuleIds: [],
      appliedContracts: [],
      suppressActionLanguage: false,
      suppressRegexes: [],
      shouldHardBlock: false,
      hardBlockReasonCode: null,
      maxClarificationQuestions: toPositiveInt(
        thresholds.maxClarificationQuestions,
        1,
      ),
      navPills: {
        maxIntroSentences: toPositiveInt(
          navBank.maxIntroSentences ?? thresholds.maxIntroSentencesNavPills,
          1,
        ),
        maxIntroChars: toPositiveInt(navBank.maxIntroChars, 90),
        noSourcesHeader: navBank.noSourcesHeader !== false,
        noInlineCitations: navBank.noInlineCitations !== false,
        disallowedTextPatterns: Array.isArray(navBank.disallowedTextPatterns)
          ? navBank.disallowedTextPatterns
              .map((entry) => String(entry || "").trim())
              .filter(Boolean)
          : [],
      },
    };

    if (!bank || !decision.enabled) return decision;

    const rules = Array.isArray(bank.rules) ? bank.rules : [];
    for (const rule of rules) {
      const ruleId = String(rule?.id || "").trim();
      if (!evalWhen(rule.when, runtime)) continue;
      const trigger = languagePatterns(rule.triggerPatterns, input.language);
      if (trigger.length > 0 && !regexMatchesAny(input.content, trigger)) continue;
      if (ruleId) decision.appliedRuleIds.push(ruleId);
      const actionType = String(rule?.action?.type || "")
        .trim()
        .toLowerCase();
      if (actionType === "enforce_ui_contract") {
        const contractId = String(rule?.action?.contract || "").trim();
        if (contractId) decision.appliedContracts.push(contractId);
        continue;
      }
      if (actionType === "hard_block") {
        decision.shouldHardBlock = true;
        decision.hardBlockReasonCode =
          String(rule?.reasonCode || "").trim() ||
          String(ruleId || "ui_contract_hard_block");
        continue;
      }
      if (actionType === "suppress_action_language") {
        decision.suppressActionLanguage = true;
        decision.suppressRegexes.push(...trigger);
      }
    }

    decision.appliedRuleIds = Array.from(new Set(decision.appliedRuleIds));
    decision.appliedContracts = Array.from(new Set(decision.appliedContracts));
    decision.suppressRegexes = Array.from(new Set(decision.suppressRegexes));
    return decision;
  }
}

