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

type UiContractConfig = {
  maxIntroSentences?: number;
  maxIntroChars?: number;
  noSourcesHeader?: boolean;
  noInlineCitations?: boolean;
  disallowedTextPatterns?: string[];
  allowedOutputShapes?: string[];
  allowedAttachments?: string[];
  disallowedAttachments?: string[];
  suppressActions?: boolean;
};

type UiContractsBank = {
  _meta?: {
    id?: string;
    version?: string;
  };
  config?: {
    enabled?: boolean;
    contracts?: Record<string, UiContractConfig>;
    actionsContract?: {
      combination?: {
        multipleMatches?: "apply_most_restrictive" | "apply_first_match";
        hardBlockIsTerminal?: boolean;
      };
      conflictResolution?: {
        ifActionsAndNoToolExecution?: string;
        ifMultipleViolations?: string;
      };
      thresholds?: {
        maxIntroSentencesNavPills?: number;
        maxClarificationQuestions?: number;
      };
    };
  };
  contracts?: Record<string, UiContractConfig>;
  rules?: UiRule[];
};

export type UiContractDecision = {
  enabled: boolean;
  version: string | null;
  warnings: string[];
  appliedRuleIds: string[];
  appliedContracts: string[];
  suppressActionLanguage: boolean;
  suppressRegexes: string[];
  shouldHardBlock: boolean;
  hardBlockReasonCode: string | null;
  maxClarificationQuestions: number;
  attachmentPolicy: {
    allowedTypes: string[];
    disallowedTypes: string[];
    suppressActions: boolean;
  };
  navPills: {
    maxIntroSentences: number;
    maxIntroChars: number;
    noSourcesHeader: boolean;
    noInlineCitations: boolean;
    disallowedTextPatterns: string[];
    allowedOutputShapes: string[];
  };
  activeContractDisallowedTextPatterns: string[];
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

function parseBoolish(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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

function normalizedTypeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      String(entry || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

function normalizedTextPatternList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function answerModeContractId(answerMode: string): string | null {
  const normalized = String(answerMode || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("doc_grounded")) return "doc_grounded";
  if (normalized === "general_answer") return "conversation";
  return normalized;
}

export class UiContractInterpreterService {
  resolve(input: ResolveInput): UiContractDecision {
    const bank = input.bank || null;
    const config = asObject((bank as UiContractsBank | null)?.config);
    const contractsFromConfig = asObject(config.contracts);
    const contractsFromLegacy = asObject((bank as UiContractsBank | null)?.contracts);
    const hasConfigContracts = Object.keys(contractsFromConfig).length > 0;
    const hasLegacyContracts = Object.keys(contractsFromLegacy).length > 0;
    const contracts = contractsFromConfig;
    const navBank = asObject(contracts.nav_pills);
    const thresholds = asObject(
      asObject(asObject(config.actionsContract).thresholds),
    );
    const actionsContract = asObject(config.actionsContract);
    const combination = asObject(actionsContract.combination);
    const conflictResolution = asObject(actionsContract.conflictResolution);
    const applyFirstMatch =
      String(combination.multipleMatches || "")
        .trim()
        .toLowerCase() === "apply_first_match";
    const hardBlockIsTerminal = combination.hardBlockIsTerminal !== false;
    const rawMetrics = asObject(input.metrics);
    const providedClarificationCount = Number(
      rawMetrics.clarificationQuestionCount,
    );
    const inferredClarificationCount = countQuestions(input.content);
    const effectiveClarificationCount = Number.isFinite(
      providedClarificationCount,
    )
      ? Math.max(Math.floor(providedClarificationCount), inferredClarificationCount)
      : inferredClarificationCount;
    const runtime = {
      answerMode: String(input.answerMode || "").trim(),
      signals: asObject(input.signals),
      metrics: {
        ...rawMetrics,
        clarificationQuestionCount: effectiveClarificationCount,
      },
    } as Record<string, unknown>;

    const decision: UiContractDecision = {
      enabled: config.enabled !== false,
      version:
        String(asObject((bank as UiContractsBank | null)?._meta).version || "").trim() ||
        null,
      warnings: [],
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
      attachmentPolicy: {
        allowedTypes: [],
        disallowedTypes: [],
        suppressActions: false,
      },
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
        allowedOutputShapes: Array.isArray(navBank.allowedOutputShapes)
          ? navBank.allowedOutputShapes
              .map((entry) => String(entry || "").trim().toLowerCase())
              .filter(Boolean)
          : [],
      },
      activeContractDisallowedTextPatterns: [],
    };

    if (!hasConfigContracts && hasLegacyContracts) {
      decision.warnings.push("UI_CONTRACT_LEGACY_CONTRACT_PATH_IGNORED");
    }

    if (!bank || !decision.enabled) return decision;

    const rules = Array.isArray(bank.rules) ? bank.rules : [];
    for (const rule of rules) {
      const ruleId = String(rule?.id || "").trim();
      if (!evalWhen(rule.when, runtime)) continue;
      const trigger = languagePatterns(rule.triggerPatterns, input.language);
      const contentText = String(input.content || "");
      if (
        trigger.length > 0 &&
        contentText.trim().length > 0 &&
        !regexMatchesAny(contentText, trigger)
      ) {
        continue;
      }
      if (ruleId) decision.appliedRuleIds.push(ruleId);
      const actionType = String(rule?.action?.type || "")
        .trim()
        .toLowerCase();
      if (actionType === "enforce_ui_contract") {
        const contractId = String(rule?.action?.contract || "").trim();
        if (contractId) decision.appliedContracts.push(contractId);
        if (parseBoolish(rule?.action?.suppressActions)) {
          decision.attachmentPolicy.suppressActions = true;
        }
        if (applyFirstMatch) break;
        continue;
      }
      if (actionType === "hard_block") {
        decision.shouldHardBlock = true;
        decision.hardBlockReasonCode =
          String(rule?.reasonCode || "").trim() ||
          String(ruleId || "ui_contract_hard_block");
        if (hardBlockIsTerminal) break;
        if (applyFirstMatch) break;
        continue;
      }
      if (actionType === "suppress_action_language") {
        decision.suppressActionLanguage = true;
        decision.suppressRegexes.push(...trigger);
        if (parseBoolish(rule?.action?.suppressActions)) {
          decision.attachmentPolicy.suppressActions = true;
        }
        if (applyFirstMatch) break;
      }
    }

    decision.appliedRuleIds = Array.from(new Set(decision.appliedRuleIds));
    const modeContractId = answerModeContractId(String(runtime.answerMode || ""));
    const modeContractRaw = modeContractId ? contracts[modeContractId] : null;
    if (
      modeContractId &&
      modeContractRaw &&
      typeof modeContractRaw === "object" &&
      !Array.isArray(modeContractRaw)
    ) {
      decision.appliedContracts.push(modeContractId);
    }
    decision.appliedContracts = Array.from(new Set(decision.appliedContracts));
    decision.suppressRegexes = Array.from(new Set(decision.suppressRegexes));

    let allowedAccumulator: Set<string> | null = null;
    const disallowed = new Set<string>();
    const disallowedTextPatterns = new Set<string>();
    for (const contractId of decision.appliedContracts) {
      const contract = asObject(contracts[contractId]);
      const allowedTypes = normalizedTypeList(contract.allowedAttachments);
      if (allowedTypes.length > 0) {
        const allowedSet: Set<string> = new Set<string>(allowedTypes);
        if (!allowedAccumulator) {
          allowedAccumulator = allowedSet;
        } else {
          const intersection: string[] = Array.from(allowedAccumulator).filter(
            (value: string) => allowedSet.has(value),
          );
          allowedAccumulator = new Set(intersection);
        }
      }
      for (const type of normalizedTypeList(contract.disallowedAttachments)) {
        disallowed.add(type);
      }
      for (const pattern of normalizedTextPatternList(contract.disallowedTextPatterns)) {
        disallowedTextPatterns.add(pattern);
      }
      if (parseBoolish(contract.suppressActions)) {
        decision.attachmentPolicy.suppressActions = true;
      }
    }

    const suppressActionsByConflictRule =
      String(conflictResolution.ifActionsAndNoToolExecution || "")
        .trim()
        .toLowerCase() === "suppress_actions" &&
      runtime.signals &&
      (runtime.signals as Record<string, unknown>).toolExecuted !== true;
    if (suppressActionsByConflictRule) {
      decision.suppressActionLanguage = true;
      decision.attachmentPolicy.suppressActions = true;
      decision.warnings.push("UI_CONTRACT_SUPPRESS_ACTIONS_NO_TOOL_EXECUTION");
    }
    if (decision.attachmentPolicy.suppressActions) {
      disallowed.add("actions");
      disallowed.add("action");
    }
    if (
      String(conflictResolution.ifMultipleViolations || "")
        .trim()
        .toLowerCase() === "hard_block" &&
      decision.appliedRuleIds.length > 1
    ) {
      decision.shouldHardBlock = true;
      if (!decision.hardBlockReasonCode) {
        decision.hardBlockReasonCode = "ui_contract_multiple_violations";
      }
    }

    decision.attachmentPolicy.allowedTypes = allowedAccumulator
      ? Array.from(allowedAccumulator).sort((a, b) => a.localeCompare(b))
      : [];
    decision.attachmentPolicy.disallowedTypes = Array.from(disallowed).sort(
      (a, b) => a.localeCompare(b),
    );
    decision.activeContractDisallowedTextPatterns = Array.from(
      disallowedTextPatterns,
    );
    decision.warnings = Array.from(new Set(decision.warnings));
    return decision;
  }
}
