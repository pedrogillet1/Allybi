import type { ChatRequest } from "../../../modules/chat/domain/chat.contracts";
import type { EvidencePack } from "../retrieval/retrieval.types";
import { getOptionalBank } from "../banks/bankLoader.service";

type PredicateOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "contains";

type Predicate = {
  path?: string;
  op?: PredicateOp;
  value?: unknown;
};

type RuleWhen = {
  any?: Predicate[];
  all?: Predicate[];
  path?: string;
  op?: PredicateOp;
  value?: unknown;
};

type FallbackRule = {
  id?: string;
  priority?: number;
  when?: RuleWhen;
  reasonCode?: string;
  severity?: "critical" | "high" | "medium" | "low" | "info";
  action?: {
    type?: string;
    fallbackType?: string;
  };
};

type FallbackRuleBank = {
  config?: {
    enabled?: boolean;
    canonicalReasonCodes?: string[];
  };
  rules?: FallbackRule[];
};

type FallbackRouterBank = {
  config?: {
    enabled?: boolean;
    defaults?: {
      action?: string;
      telemetryReason?: string;
    };
  };
  rules?: Array<{
    when?: {
      reasonCodeIn?: string[];
    };
    do?: {
      action?: string;
      telemetryReason?: string;
    };
  }>;
};

type MatchResult = {
  bankId: string;
  ruleId: string;
  reasonCode: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  priority: number;
  fallbackType: string | null;
};

type RouterDecision = {
  action: string;
  telemetryReason: string;
};

type FallbackRuntime = {
  signals: {
    hasIndexedDocs: boolean;
    hardScopeActive: boolean;
    searchExecuted: boolean;
    explicitDocRef: boolean;
    resolvedDocId: string;
    indexingInProgress: boolean;
    isAmbiguous: boolean;
    needsDocChoice: boolean;
    reasonCodes: string[];
  };
  metrics: {
    retrievedChunks: number;
    topConfidence: number;
    searchConfidence: number;
    extractionCoverage: number;
  };
};

type FallbackPolicyBank = {
  config?: {
    enabled?: boolean;
  };
};

export type FallbackDecisionPolicyResult = {
  reasonCode: string;
  selectedBankId: string;
  selectedRuleId: string;
  severity: MatchResult["severity"];
  fallbackType: string | null;
  routerAction: string;
  routerTelemetryReason: string;
};

const RULE_BANK_IDS = [
  "fallback_processing",
  "fallback_scope_empty",
  "fallback_not_found_scope",
  "fallback_extraction_recovery",
] as const;

const SEVERITY_RANK: Record<MatchResult["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const REASON_ALIASES: Record<string, string> = {
  no_evidence: "no_relevant_chunks_in_scoped_docs",
  weak_evidence: "low_confidence",
  scope_lock: "scope_hard_constraints_empty",
  wrong_doc: "explicit_doc_not_found",
};

const REASON_PRIORITY: string[] = [
  "no_docs_indexed",
  "scope_hard_constraints_empty",
  "no_relevant_chunks_in_scoped_docs",
  "indexing_in_progress",
  "extraction_failed",
  "low_confidence",
  "explicit_doc_not_found",
  "needs_doc_choice",
  "doc_ambiguous",
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function evalPredicate(
  predicate: Predicate,
  runtime: Record<string, unknown>,
): boolean {
  const path = String(predicate.path || "").trim();
  if (!path) return false;
  const op = String(predicate.op || "eq").trim().toLowerCase();
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

function evalWhen(
  when: RuleWhen | undefined,
  runtime: Record<string, unknown>,
): boolean {
  const normalized = asObject(when);
  const hasAll = Array.isArray(normalized.all);
  const hasAny = Array.isArray(normalized.any);
  const hasPath = typeof normalized.path === "string";

  if (!hasAll && !hasAny && !hasPath) return true;

  if (hasAll && (normalized.all as Predicate[]).length > 0) {
    const ok = (normalized.all as Predicate[]).every((entry) =>
      evalPredicate(asObject(entry) as Predicate, runtime),
    );
    if (!ok) return false;
  }
  if (hasAny && (normalized.any as Predicate[]).length > 0) {
    const ok = (normalized.any as Predicate[]).some((entry) =>
      evalPredicate(asObject(entry) as Predicate, runtime),
    );
    if (!ok) return false;
  }
  if (hasPath) {
    return evalPredicate(
      {
        path: normalized.path as string,
        op: (normalized.op as PredicateOp) || "eq",
        value: normalized.value,
      },
      runtime,
    );
  }
  return true;
}

function normalizeReasonCode(reasonCode: string): string {
  const key = String(reasonCode || "")
    .trim()
    .toLowerCase();
  if (!key) return "";
  return REASON_ALIASES[key] || key;
}

export class FallbackDecisionPolicyService {
  resolveReasonCode(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): string | undefined {
    return this.resolve(req, retrievalPack)?.reasonCode;
  }

  resolve(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): FallbackDecisionPolicyResult | null {
    const fallbackPolicy = getOptionalBank<FallbackPolicyBank>("fallback_policy");
    if (fallbackPolicy?.config?.enabled === false) return null;
    if (!retrievalPack) return null;

    const runtime = this.buildRuntime(req, retrievalPack);

    const explicit = this.selectExplicitReason(runtime.signals.reasonCodes);
    if (explicit) {
      const router = this.resolveRouterDecision(explicit);
      return {
        reasonCode: explicit,
        selectedBankId: "retrieval_debug",
        selectedRuleId: "debug_reason_codes",
        severity: "high",
        fallbackType: null,
        routerAction: router.action,
        routerTelemetryReason: router.telemetryReason,
      };
    }

    const rawMatches = this.matchRuleBanks(runtime);
    const matches =
      retrievalPack.evidence.length > 0
        ? rawMatches.filter((match) =>
            ["low_confidence", "extraction_failed", "indexing_in_progress"].includes(
              match.reasonCode,
            ),
          )
        : rawMatches;
    const selected = matches[0] || null;

    if (selected) {
      const router = this.resolveRouterDecision(selected.reasonCode);
      return {
        reasonCode: selected.reasonCode,
        selectedBankId: selected.bankId,
        selectedRuleId: selected.ruleId,
        severity: selected.severity,
        fallbackType: selected.fallbackType,
        routerAction: router.action,
        routerTelemetryReason: router.telemetryReason,
      };
    }

    const legacyReason = this.resolveLegacyFallback(req, retrievalPack);
    if (!legacyReason) return null;
    const router = this.resolveRouterDecision(legacyReason);
    return {
      reasonCode: legacyReason,
      selectedBankId: "legacy_fallback",
      selectedRuleId: "legacy_reason_resolver",
      severity: "medium",
      fallbackType: null,
      routerAction: router.action,
      routerTelemetryReason: router.telemetryReason,
    };
  }

  private resolveLegacyFallback(
    req: ChatRequest,
    retrievalPack: EvidencePack,
  ): string | null {
    if (retrievalPack.evidence.length > 0) return null;
    if (retrievalPack.scope?.hardScopeActive) {
      if ((retrievalPack.scope?.candidateDocIds || []).length === 0) {
        const contextSignals = asObject(asObject(req.context).signals);
        if (
          contextSignals.explicitDocRef === true ||
          contextSignals.hasExplicitDocRef === true
        ) {
          return "explicit_doc_not_found";
        }
        return "scope_hard_constraints_empty";
      }
      return "scope_hard_constraints_empty";
    }
    if ((req.attachedDocumentIds || []).length > 0) {
      return "no_relevant_chunks_in_scoped_docs";
    }
    return null;
  }

  private matchRuleBanks(runtime: FallbackRuntime): MatchResult[] {
    const matches: MatchResult[] = [];
    for (const bankId of RULE_BANK_IDS) {
      const bank = getOptionalBank<FallbackRuleBank>(bankId);
      if (!bank || bank.config?.enabled === false) continue;
      const rules = Array.isArray(bank.rules) ? bank.rules : [];
      for (const rule of rules) {
        if (!evalWhen(rule.when, runtime as unknown as Record<string, unknown>))
          continue;
        const reasonCode = normalizeReasonCode(String(rule.reasonCode || ""));
        if (!reasonCode) continue;
        const severity = this.normalizeSeverity(rule.severity);
        matches.push({
          bankId,
          ruleId: String(rule.id || "unknown_rule"),
          reasonCode,
          severity,
          priority: Number(rule.priority || 0),
          fallbackType: String(rule.action?.fallbackType || "").trim() || null,
        });
      }
    }

    return matches.sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity];
      const sb = SEVERITY_RANK[b.severity];
      if (sb !== sa) return sb - sa;
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.bankId !== b.bankId) return a.bankId.localeCompare(b.bankId);
      return a.ruleId.localeCompare(b.ruleId);
    });
  }

  private selectExplicitReason(reasonCodes: string[]): string | null {
    const normalized = Array.from(
      new Set(reasonCodes.map((value) => normalizeReasonCode(value))),
    ).filter(Boolean);
    if (!normalized.length) return null;

    for (const reason of REASON_PRIORITY) {
      if (normalized.includes(reason)) return reason;
    }
    return normalized[0] || null;
  }

  private resolveRouterDecision(reasonCode: string): RouterDecision {
    const router = getOptionalBank<FallbackRouterBank>("fallback_router");
    if (!router?.config?.enabled) {
      return {
        action: "ask_one_question",
        telemetryReason: "UNKNOWN",
      };
    }

    const normalizedReason = normalizeReasonCode(reasonCode);
    const rules = Array.isArray(router.rules) ? router.rules : [];
    for (const rule of rules) {
      const codes = Array.isArray(rule?.when?.reasonCodeIn)
        ? rule.when.reasonCodeIn
            .map((value) => normalizeReasonCode(String(value || "")))
            .filter(Boolean)
        : [];
      if (codes.length > 0 && !codes.includes(normalizedReason)) continue;

      const action = String(rule?.do?.action || "").trim();
      if (!action) continue;
      const telemetryReason = String(rule?.do?.telemetryReason || "").trim();
      return {
        action,
        telemetryReason: telemetryReason || "UNKNOWN",
      };
    }

    return {
      action: String(router.config?.defaults?.action || "ask_one_question"),
      telemetryReason: String(
        router.config?.defaults?.telemetryReason || "UNKNOWN",
      ),
    };
  }

  private buildRuntime(
    req: ChatRequest,
    retrievalPack: EvidencePack,
  ): FallbackRuntime {
    const context = asObject(req.context);
    const contextSignals = asObject(context.signals);
    const meta = asObject(req.meta);

    const explicitReasonCodes = (
      Array.isArray(retrievalPack.debug?.reasonCodes)
        ? retrievalPack.debug?.reasonCodes
        : []
    )
      .map((value) => normalizeReasonCode(String(value || "")))
      .filter(Boolean);

    const candidateDocIds = Array.isArray(retrievalPack.scope?.candidateDocIds)
      ? retrievalPack.scope.candidateDocIds
      : [];
    const resolvedDocId = String(
      contextSignals.resolvedDocId || retrievalPack.scope?.activeDocId || "",
    ).trim();
    const topScore = toNumber(retrievalPack.stats?.topScore) ?? 0;
    const extractionCoverage =
      toNumber(contextSignals.extractionCoverage) ??
      toNumber(meta.extractionCoverage) ??
      toNumber(meta.ocrCoverage) ??
      (retrievalPack.evidence.length > 0 ? 1 : 0);
    const needsDocChoice =
      contextSignals.needsDocChoice === true ||
      explicitReasonCodes.includes("needs_doc_choice");
    const explicitDocRef =
      contextSignals.explicitDocRef === true ||
      contextSignals.hasExplicitDocRef === true ||
      explicitReasonCodes.includes("explicit_doc_not_found");
    const hasIndexedDocsDefault =
      candidateDocIds.length > 0 ||
      (req.attachedDocumentIds || []).length > 0 ||
      !explicitReasonCodes.includes("no_docs_indexed");

    return {
      signals: {
        hasIndexedDocs:
          contextSignals.hasIndexedDocs === false ? false : hasIndexedDocsDefault,
        hardScopeActive:
          retrievalPack.scope?.hardScopeActive === true ||
          contextSignals.hardScopeActive === true,
        searchExecuted: true,
        explicitDocRef,
        resolvedDocId,
        indexingInProgress:
          meta.indexingInProgress === true ||
          contextSignals.indexingInProgress === true,
        isAmbiguous:
          contextSignals.isAmbiguous === true ||
          explicitReasonCodes.includes("doc_ambiguous") ||
          needsDocChoice,
        needsDocChoice,
        reasonCodes: explicitReasonCodes,
      },
      metrics: {
        retrievedChunks: retrievalPack.evidence.length,
        topConfidence: topScore,
        searchConfidence: topScore,
        extractionCoverage,
      },
    };
  }

  private normalizeSeverity(
    value: unknown,
  ): "critical" | "high" | "medium" | "low" | "info" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (normalized === "critical") return "critical";
    if (normalized === "high") return "high";
    if (normalized === "low") return "low";
    if (normalized === "info") return "info";
    return "medium";
  }
}
