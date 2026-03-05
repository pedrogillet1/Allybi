import { getOptionalBank } from "./bankLoader.service";
import {
  normalizeDocumentIntelligenceDomain,
  type DocumentIntelligenceDomain,
} from "./documentIntelligenceBanks.service";
import { getBankLoadPlannerInstance } from "./bankLoadPlanner.service";
import { getBankRolloutInstance } from "./bankRollout.service";

interface DocumentIntelligenceBankMapLike {
  requiredCoreBankIds?: unknown;
  optionalBankIds?: unknown;
}

export interface BankSelectionPlanInput {
  query: string;
  domainId?: string | null;
  docTypeId?: string | null;
  queryFamily?: string | null;
  intentId?: string | null;
  locale?: string | null;
  operator?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
}

export interface BankSelectionPlanResult {
  domainId: DocumentIntelligenceDomain | null;
  rootBankIds: string[];
  selectedBankIds: string[];
  dependencyExpandedBankIds: string[];
  selectedBankVersionMap: Record<string, string>;
  missingBankIds: string[];
  hasCycles: boolean;
  reasons: string[];
}

const UNIVERSAL_BANKS = [
  "document_intelligence_bank_map",
  "semantic_search_config",
  "retrieval_ranker_config",
  "diversification_rules",
  "retrieval_negatives",
  "evidence_packaging",
  "routing_priority",
  "doc_taxonomy",
  "headings_map",
  "sheetname_patterns",
  "layout_cues",
  "money_patterns",
  "date_patterns",
  "party_patterns",
  "identifier_patterns",
  "source_policy",
  "numeric_integrity",
  "wrong_doc_lock",
  "doc_grounding_checks",
  "hallucination_guards",
];

const LEGAL_INTENT_MARKERS = [
  "clause",
  "nda",
  "msa",
  "legal",
  "agreement",
  "contract",
  "obligation",
];
const FINANCE_INTENT_MARKERS = [
  "finance",
  "financial",
  "balance",
  "cash flow",
  "kpi",
  "revenue",
  "expense",
];
const MEDICAL_INTENT_MARKERS = [
  "medical",
  "patient",
  "lab",
  "diagnosis",
  "soap",
  "referral",
];
const ACCOUNTING_INTENT_MARKERS = [
  "accounting",
  "ledger",
  "journal",
  "trial balance",
  "accrual",
];
const OPS_INTENT_MARKERS = ["ops", "operation", "sla", "runbook", "incident"];

// -- cross_domain_tiebreak_policy bank reference (used for deterministic tiebreak resolution) --

interface TiebreakRule {
  id: string;
  domainA: string;
  domainB: string;
  winner: string;
  confidenceBoost: number;
  reason: string;
}

interface TiebreakPolicyBank {
  _meta: { id: string; version: string };
  config: { enabled: boolean };
  rules: TiebreakRule[];
}

interface DomainScore {
  domain: DocumentIntelligenceDomain;
  score: number;
}

const TIEBREAK_SCORE_GAP_THRESHOLD = 0.15;

/**
 * Score a query against all known domain marker sets.
 * Returns a list of { domain, score } sorted descending by score.
 * Each domain receives a score of (matched_markers / total_markers_in_set).
 */
function scoreDomainCandidates(query: string): DomainScore[] {
  const q = lower(query);
  if (!q) return [];

  const sets: Array<{ domain: DocumentIntelligenceDomain; markers: string[] }> = [
    { domain: "legal", markers: LEGAL_INTENT_MARKERS },
    { domain: "finance", markers: FINANCE_INTENT_MARKERS },
    { domain: "medical", markers: MEDICAL_INTENT_MARKERS },
    { domain: "accounting", markers: ACCOUNTING_INTENT_MARKERS },
    { domain: "ops", markers: OPS_INTENT_MARKERS },
  ];

  const results: DomainScore[] = [];
  for (const { domain, markers } of sets) {
    const matchCount = markers.filter((m) => q.includes(m)).length;
    if (matchCount > 0) {
      results.push({ domain, score: matchCount / markers.length });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Given scored domain candidates, apply cross_domain_tiebreak_policy rules
 * when two or more domains have a score gap < TIEBREAK_SCORE_GAP_THRESHOLD.
 * Returns the winning domain and any applied rules info.
 */
function applyTiebreakPolicy(
  candidates: DomainScore[],
  reasons: string[],
): DomainScore[] {
  if (candidates.length < 2) return candidates;

  const tiebreakBank = getOptionalBank<TiebreakPolicyBank>(
    "cross_domain_tiebreak_policy",
  );
  if (!tiebreakBank || !tiebreakBank.config?.enabled) return candidates;

  const rules = tiebreakBank.rules || [];
  const updated = [...candidates];

  // Check consecutive pairs from the top for tiebreak eligibility
  for (let i = 0; i < updated.length - 1; i++) {
    const top = updated[i];
    const runner = updated[i + 1];
    const gap = top.score - runner.score;

    if (gap < TIEBREAK_SCORE_GAP_THRESHOLD) {
      // Look up the tiebreak rule for this pair
      const rule = rules.find(
        (r) =>
          (r.domainA === top.domain && r.domainB === runner.domain) ||
          (r.domainA === runner.domain && r.domainB === top.domain),
      );

      if (rule) {
        // Apply confidenceBoost to the winner
        const winnerIdx = updated.findIndex((c) => c.domain === rule.winner);
        if (winnerIdx >= 0) {
          updated[winnerIdx] = {
            ...updated[winnerIdx],
            score: updated[winnerIdx].score + rule.confidenceBoost,
          };
          reasons.push("cross_domain_tiebreak_applied");
          reasons.push(`tiebreak_rule:${rule.id}:${rule.winner}`);
        }
      }
    }
  }

  // Re-sort after boosts
  updated.sort((a, b) => b.score - a.score);
  return updated;
}

function clean(value: unknown): string {
  return String(value || "").trim();
}

function lower(value: unknown): string {
  return clean(value).toLowerCase();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => clean(item))
        .filter(Boolean),
    ),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function containsAny(haystack: string, needles: string[]): boolean {
  for (const needle of needles) {
    if (haystack.includes(needle)) return true;
  }
  return false;
}

function normalizeLocale(value: string | null | undefined): "en" | "pt" | "es" {
  const raw = lower(value);
  if (raw === "pt") return "pt";
  if (raw === "es") return "es";
  return "en";
}

function extractLocaleMarkers(bankId: string): Array<"en" | "pt" | "es"> {
  const out = new Set<"en" | "pt" | "es">();
  const normalized = lower(bankId);
  const matcher = /(^|_)(en|pt|es)(?=_|$)/g;
  for (const match of normalized.matchAll(matcher)) {
    const locale = match[2];
    if (locale === "en" || locale === "pt" || locale === "es") {
      out.add(locale);
    }
  }
  return Array.from(out.values());
}

function matchesLocale(bankId: string, locale: "en" | "pt" | "es"): boolean {
  const markers = extractLocaleMarkers(bankId);
  if (markers.length === 0) return true;
  if (markers.length > 1) return true;
  return markers[0] === locale;
}

function inferDomainFromText(query: string): DocumentIntelligenceDomain | null {
  const q = lower(query);
  if (!q) return null;
  if (containsAny(q, LEGAL_INTENT_MARKERS)) return "legal";
  if (containsAny(q, MEDICAL_INTENT_MARKERS)) return "medical";
  if (containsAny(q, ACCOUNTING_INTENT_MARKERS)) return "accounting";
  if (containsAny(q, OPS_INTENT_MARKERS)) return "ops";
  if (containsAny(q, FINANCE_INTENT_MARKERS)) return "finance";
  return null;
}

function domainCoreBanks(domain: DocumentIntelligenceDomain): string[] {
  const out = [
    `query_rewrites_${domain}`,
    `boost_rules_${domain}`,
    `section_priority_${domain}`,
    `doc_aliases_${domain}`,
    `doc_archetypes_${domain}`,
    `table_header_ontology_${domain}`,
  ];

  if (domain === "legal") {
    out.push("citation_styles", "legal_clause_ontology", "legal_risk_heuristics");
    out.push("legal_reference_rules");
  } else if (domain === "medical") {
    out.push(
      "medical_report_ontology",
      "medical_safety_boundaries",
      "medical_explanation_templates",
    );
  } else if (domain === "finance") {
    out.push("finance_doc_logic", "finance_kpi_ontology");
  } else if (domain === "accounting") {
    out.push("accounting_rules");
  } else if (domain === "ops") {
    out.push("ops_doc_logic", "ops_kpi_ontology");
  }

  return out;
}

function buildDomainPrefix(domain: DocumentIntelligenceDomain): string[] {
  if (domain === "legal" || domain === "medical") return [`${domain}_`];
  return [`di_${domain}_`];
}

function shouldIncludeOptionalForDomain(bankId: string): boolean {
  return (
    bankId.includes("doc_type_catalog") ||
    bankId.includes("domain_profile") ||
    bankId.includes("domain_detection_rules") ||
    bankId.includes("evidence_requirements") ||
    bankId.includes("retrieval_strategies") ||
    bankId.includes("validation_policies")
  );
}

export class BankSelectionPlannerService {
  plan(input: BankSelectionPlanInput): BankSelectionPlanResult {
    const reasons: string[] = [];

    const explicitDomain = normalizeDocumentIntelligenceDomain(input.domainId);
    let inferredDomain: DocumentIntelligenceDomain | null = null;

    if (!explicitDomain) {
      // Score all domain candidates and apply tiebreak resolution when close
      const candidates = scoreDomainCandidates(input.query);
      if (candidates.length >= 2) {
        const resolved = applyTiebreakPolicy(candidates, reasons);
        inferredDomain = resolved.length > 0 ? resolved[0].domain : null;
      } else if (candidates.length === 1) {
        inferredDomain = candidates[0].domain;
      } else {
        inferredDomain = inferDomainFromText(input.query);
      }
    }

    const domainId = explicitDomain || inferredDomain;
    if (explicitDomain) reasons.push("domain:explicit");
    else if (inferredDomain) reasons.push("domain:inferred_query");
    else reasons.push("domain:none");

    const queryFamily = lower(input.queryFamily || input.intentId || "");
    if (queryFamily) reasons.push(`queryFamily:${queryFamily}`);

    const locale = normalizeLocale(input.locale);
    reasons.push(`locale:${locale}`);

    const rootBankIds: string[] = [...UNIVERSAL_BANKS];

    if (domainId) {
      rootBankIds.push(...domainCoreBanks(domainId));
    }

    const bankMap =
      getOptionalBank<DocumentIntelligenceBankMapLike>(
        "document_intelligence_bank_map",
      );
    const mapRequired = asStringList(bankMap?.requiredCoreBankIds);
    const mapOptional = asStringList(bankMap?.optionalBankIds);

    const scopedCore = mapRequired.filter((bankId) => {
      if (UNIVERSAL_BANKS.includes(bankId)) return true;
      if (!domainId) return false;
      const scoped =
        bankId.includes(`_${domainId}`) ||
        bankId.startsWith(`${domainId}_`) ||
        bankId.startsWith(`di_${domainId}_`);
      return scoped && matchesLocale(bankId, locale);
    });
    rootBankIds.push(...scopedCore);

    if (domainId) {
      const domainPrefixes = buildDomainPrefix(domainId);
      const scopedOptional = mapOptional.filter((bankId) => {
        const matchPrefix = domainPrefixes.some((prefix) =>
          bankId.startsWith(prefix),
        );
        return (
          matchPrefix &&
          shouldIncludeOptionalForDomain(bankId) &&
          matchesLocale(bankId, locale)
        );
      });
      rootBankIds.push(...scopedOptional);
    }

    const q = lower(input.query);
    if (q.includes("compare") || queryFamily.includes("compare")) {
      rootBankIds.push("allybi_crossdoc_grounding");
      reasons.push("policy:crossdoc_compare");
    }
    if (q.includes("quote") || q.includes("citation")) {
      rootBankIds.push("quote_styles", "citation_styles");
      reasons.push("format:quote_or_citation");
    }
    if (q.includes("table")) {
      rootBankIds.push("table_styles", "table_rules");
      reasons.push("format:table");
    }

    const normalizedRootBankIds = unique(rootBankIds).filter((bankId) =>
      matchesLocale(bankId, locale),
    );
    const loadPlan = getBankLoadPlannerInstance().plan({
      rootBankIds: normalizedRootBankIds,
    });

    const selectedBankIds =
      loadPlan.orderedBankIds.length > 0
        ? loadPlan.orderedBankIds
        : normalizedRootBankIds;
    const selectedBankVersionMap: Record<string, string> = {};
    const rolloutEnabled = process.env.BANK_ROLLOUT_ENABLED === "true";
    if (rolloutEnabled && domainId) {
      const rollout = getBankRolloutInstance();
      const useDomainV2 = rollout.isEnabled(`bank_domain_${domainId}_v2`, {
        workspaceId: input.workspaceId || null,
        userId: input.userId || null,
        domainId,
      });
      const version = useDomainV2 ? "v2" : "v1";
      for (const bankId of selectedBankIds) {
        if (
          bankId.includes(`_${domainId}`) ||
          bankId.startsWith(`${domainId}_`) ||
          bankId.startsWith(`di_${domainId}_`)
        ) {
          selectedBankVersionMap[bankId] = version;
        }
      }
      reasons.push(`rollout:${domainId}:${version}`);
    }

    return {
      domainId,
      rootBankIds: normalizedRootBankIds,
      selectedBankIds,
      dependencyExpandedBankIds: loadPlan.expandedBankIds,
      selectedBankVersionMap,
      missingBankIds: loadPlan.missingBankIds,
      hasCycles: loadPlan.hasCycles,
      reasons,
    };
  }
}

let singleton: BankSelectionPlannerService | null = null;

export function getBankSelectionPlannerInstance(): BankSelectionPlannerService {
  if (!singleton) {
    singleton = new BankSelectionPlannerService();
  }
  return singleton;
}
