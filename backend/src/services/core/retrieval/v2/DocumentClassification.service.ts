/**
 * DocumentClassification — v2 extraction from RetrievalEngineService
 *
 * Standalone functions for classifying document context: domain detection,
 * doc-type inference, and normalization helpers.
 */

import { logger } from "../../../../utils/logger";
import type {
  DocumentIntelligenceBanksService,
  DocumentIntelligenceDomain,
} from "../../banks/documentIntelligenceBanks.service";
import type { DocumentClassificationResult } from "../retrieval.types";
import { safeNumber, clamp01 } from "../retrievalEngine.utils";

// ── Minimal banks interface ─────────────────────────────────────────

type DocumentIntelligenceBanksSubset = Pick<
  DocumentIntelligenceBanksService,
  | "getDocumentIntelligenceDomains"
  | "getDomainDetectionRules"
  | "getDocTypeCatalog"
>;

// ── Helpers ─────────────────────────────────────────────────────────

export function normalizeDocType(value: unknown): string | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized || null;
}

export function normalizeDomainHint(
  domainHint: string | null | undefined,
): DocumentIntelligenceDomain | null {
  const normalized = String(domainHint || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  const aliasMap: Record<string, DocumentIntelligenceDomain> = {
    accounting: "accounting",
    banking: "banking",
    billing: "billing",
    education: "education",
    finance: "finance",
    housing: "housing",
    hr: "hr_payroll",
    "hr-payroll": "hr_payroll",
    hr_payroll: "hr_payroll",
    "human-resources": "hr_payroll",
    human_resources: "hr_payroll",
    identity: "identity",
    insurance: "insurance",
    legal: "legal",
    medical: "medical",
    ops: "ops",
    operations: "ops",
    tax: "tax",
    taxation: "tax",
    travel: "travel",
  };

  return aliasMap[normalized] || null;
}

export function listClassificationDomains(
  banks: Partial<DocumentIntelligenceBanksSubset>,
): DocumentIntelligenceDomain[] {
  const fallback: DocumentIntelligenceDomain[] = [
    "accounting",
    "banking",
    "billing",
    "education",
    "finance",
    "housing",
    "hr_payroll",
    "identity",
    "insurance",
    "legal",
    "medical",
    "ops",
    "tax",
    "travel",
  ];
  try {
    const provider = banks as Record<string, any>;
    const domains =
      typeof provider.getDocumentIntelligenceDomains === "function"
        ? provider.getDocumentIntelligenceDomains()
        : null;
    return Array.isArray(domains) && domains.length ? domains : fallback;
  } catch {
    return fallback;
  }
}

export function regexMatches(input: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, "i").test(input);
  } catch {
    return false;
  }
}

export function classifyDocTypeForDomain(
  domain: DocumentIntelligenceDomain,
  normalizedQuery: string,
  banks: Partial<DocumentIntelligenceBanksSubset>,
): {
  docTypeId: string;
  score: number;
  reasons: string[];
} | null {
  const provider = banks as Record<string, any>;
  const catalog =
    typeof provider.getDocTypeCatalog === "function"
      ? provider.getDocTypeCatalog(domain)
      : null;
  const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];
  const matches: Array<{
    docTypeId: string;
    score: number;
    reasons: string[];
  }> = [];

  for (const docType of docTypes) {
    const docTypeId = normalizeDocType(docType?.id);
    if (!docTypeId) continue;
    const patterns = Array.isArray(docType?.detectionPatterns)
      ? docType.detectionPatterns
          .map((value: unknown) => String(value || "").trim())
          .filter(Boolean)
      : [];
    let hitCount = 0;
    const reasons: string[] = [];
    for (const pattern of patterns) {
      if (!regexMatches(normalizedQuery, pattern)) continue;
      hitCount += 1;
      reasons.push(`doc_type_pattern:${pattern}`);
    }
    if (!hitCount) continue;
    const priority = safeNumber(docType?.priority, 0);
    const score = hitCount + Math.max(0, priority) / 100;
    matches.push({
      docTypeId,
      score,
      reasons: reasons.slice(0, 6),
    });
  }

  if (!matches.length) return null;
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.docTypeId.localeCompare(b.docTypeId);
  });
  return matches[0];
}

/**
 * Classify the document context: infer domain + doc type from query,
 * explicit signals, and domain-detection rule banks.
 */
export function classifyDocumentContext(
  params: {
    query: string;
    normalizedQuery: string;
    hintedDomain: DocumentIntelligenceDomain | null;
    explicitDocTypes: string[];
    explicitDocDomains: string[];
  },
  banks: Partial<DocumentIntelligenceBanksSubset>,
): DocumentClassificationResult {
  const reasons: string[] = [];
  const matchedDomainRuleIds: string[] = [];
  const domains = listClassificationDomains(banks);

  let domain = params.hintedDomain;
  if (domain) {
    reasons.push(`domain_hint:${domain}`);
  }

  if (!domain && params.explicitDocDomains.length > 0) {
    const resolved = normalizeDomainHint(params.explicitDocDomains[0]);
    if (resolved) {
      domain = resolved;
      reasons.push(`explicit_doc_domain:${resolved}`);
    }
  }

  if (!domain) {
    const candidates: Array<{
      domain: DocumentIntelligenceDomain;
      score: number;
      matchedRuleIds: string[];
      reasons: string[];
    }> = [];

    for (const candidateDomain of domains) {
      const provider = banks as Record<string, any>;
      const bank =
        typeof provider.getDomainDetectionRules === "function"
          ? provider.getDomainDetectionRules(candidateDomain)
          : null;
      const rules = Array.isArray(bank?.rules) ? bank.rules : [];
      let score = 0;
      const ruleIds: string[] = [];
      const domainReasons: string[] = [];

      for (const rule of rules) {
        const ruleId = String(rule?.id || "").trim();
        const patterns = Array.isArray(rule?.patterns)
          ? rule.patterns
              .map((value: unknown) => String(value || "").trim())
              .filter(Boolean)
          : [];
        if (!patterns.length) continue;
        const hasMatch = patterns.some((pattern: string) =>
          regexMatches(params.normalizedQuery, pattern),
        );
        if (!hasMatch) continue;

        const weight = safeNumber(
          rule?.weight,
          String(rule?.ruleType || "").toLowerCase() === "negative" ? -1 : 1,
        );
        score += weight;
        if (ruleId) ruleIds.push(ruleId);
        domainReasons.push(
          `${ruleId || "rule"}:${weight > 0 ? "positive" : "negative"}`,
        );
      }

      if (!ruleIds.length) continue;
      candidates.push({
        domain: candidateDomain,
        score,
        matchedRuleIds: ruleIds,
        reasons: domainReasons,
      });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.matchedRuleIds.length !== a.matchedRuleIds.length) {
          return b.matchedRuleIds.length - a.matchedRuleIds.length;
        }
        return a.domain.localeCompare(b.domain);
      });
      if (candidates[0].score > 0) {
        domain = candidates[0].domain;
        matchedDomainRuleIds.push(
          ...Array.from(new Set(candidates[0].matchedRuleIds)),
        );
        reasons.push(...candidates[0].reasons.slice(0, 8));
      }
    }
  }

  let docTypeId: string | null = null;
  if (params.explicitDocTypes.length > 0) {
    docTypeId = normalizeDocType(params.explicitDocTypes[0]);
    if (docTypeId) reasons.push(`explicit_doc_type:${docTypeId}`);
  }

  if (!docTypeId && domain) {
    const docTypeMatch = classifyDocTypeForDomain(
      domain,
      params.normalizedQuery,
      banks,
    );
    if (docTypeMatch) {
      docTypeId = docTypeMatch.docTypeId;
      reasons.push(...docTypeMatch.reasons.slice(0, 6));
    }
  }

  // Fallback: infer domain from doc type if domain score was inconclusive.
  if (!domain && docTypeId) {
    for (const candidateDomain of domains) {
      const provider = banks as Record<string, any>;
      const catalog =
        typeof provider.getDocTypeCatalog === "function"
          ? provider.getDocTypeCatalog(candidateDomain)
          : null;
      const docTypes = Array.isArray(catalog?.docTypes)
        ? catalog.docTypes
        : [];
      const hasDocType = docTypes.some(
        (entry: unknown) => normalizeDocType((entry as Record<string, any>)?.id) === docTypeId,
      );
      if (hasDocType) {
        domain = candidateDomain;
        reasons.push(`doc_type_implied_domain:${candidateDomain}`);
        break;
      }
    }
  }

  const confidence = clamp01(
    (domain ? 0.45 : 0) +
      (docTypeId ? 0.35 : 0) +
      Math.min(0.2, matchedDomainRuleIds.length * 0.03),
  );

  return {
    domain: domain || null,
    docTypeId: docTypeId || null,
    confidence,
    reasons: Array.from(new Set(reasons)).slice(0, 12),
    matchedDomainRuleIds: Array.from(new Set(matchedDomainRuleIds)).slice(
      0,
      12,
    ),
  };
}
