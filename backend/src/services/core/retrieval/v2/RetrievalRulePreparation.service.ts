import crypto from "crypto";

import type {
  EvidencePack,
  RetrievalRequest,
  RetrievalRuleTelemetryEvent,
  DocumentClassificationResult,
} from "../retrieval.types";
import type { RetrievalDocumentIntelligenceBanks } from "./RetrievalEngineFactory";
import type { RetrievalEngineCaches } from "./RetrievalEngineCaches.service";
import { RETRIEVAL_CONFIG } from "./retrieval.config";
import { safeNumber } from "../retrievalEngine.utils";
import {
  classifyDocumentContext,
  normalizeDomainHint,
  normalizeDocType,
} from "./DocumentClassification.service";
import {
  resolveExplicitDocDomains,
  resolveExplicitDocIds,
  resolveExplicitDocTypes,
  isDocLockActive,
  resolveLanguageHint,
  isCompareIntent,
  computeExpansionPolicy,
  expandQuery,
} from "./ScopeResolver.service";
import {
  applyQueryRewrites,
  enforceCrossDocPolicy,
  matchBoostRules,
  selectSectionScanPlan,
  type RuleMatchContext,
  type MatchedBoostRule,
  type BoostRule,
  type RewriteRule,
  type SectionPriorityRule,
} from "../../../retrieval/document_intelligence/ruleInterpreter";
import {
  buildDocTypeBoostPlan,
  buildDocTypeMatchedRule,
  buildQueryVariants,
} from "./QueryVariantBuilder.service";
import { buildRetrievalCacheKey, cloneEvidencePack } from "./RetrievalCache.service";

export interface RetrievalRuleTelemetryAccumulator {
  retrievalRuleEvents: RetrievalRuleTelemetryEvent[];
  matchedBoostRuleIds: string[];
  appliedBoostRuleIds: string[];
  rewriteRuleIds: string[];
  selectedSectionRuleId: string | null;
  crossDocGatedReason: string | null;
}

export interface PreparedRulesAndVariants {
  classification: DocumentClassificationResult;
  domain: string | null;
  resolvedDocTypes: string[];
  resolvedDocDomains: string[];
  ruleCtx: RuleMatchContext;
  compareIntentFlag: boolean;
  crossDocDecision: ReturnType<typeof enforceCrossDocPolicy>;
  runtimeBoostRules: MatchedBoostRule[];
  queryVariants: ReturnType<typeof buildQueryVariants>;
  expandedQueries: string[];
  additionalStructuralAnchors: string[];
  retrievalCacheKey: string | null;
  cachedPack: EvidencePack | null;
}

export function prepareRulesAndVariants(params: {
  req: RetrievalRequest;
  queryOriginal: string;
  queryNormalized: string;
  signals: RetrievalRequest["signals"];
  scope: {
    candidateDocIds: string[];
    hardScopeActive: boolean;
    sheetName?: string | null;
    rangeA1?: string | null;
  };
  semanticCfg: Record<string, any>;
  telemetry: RetrievalRuleTelemetryAccumulator;
  bankLoader: { getBank<T = unknown>(bankId: string): T };
  documentIntelligenceBanks: RetrievalDocumentIntelligenceBanks;
  caches: RetrievalEngineCaches;
}): PreparedRulesAndVariants {
  const {
    req,
    queryOriginal,
    queryNormalized,
    signals,
    scope,
    semanticCfg,
    telemetry,
    bankLoader,
    documentIntelligenceBanks,
    caches,
  } = params;
  const hintedDomain = normalizeDomainHint(signals.domainHint);
  const explicitDocIdsList = resolveExplicitDocIds(signals);
  const explicitDocTypesList = resolveExplicitDocTypes(signals, normalizeDocType);
  const explicitDocDomainsList = resolveExplicitDocDomains(signals);
  const classification = classifyDocumentContext(
    {
      query: queryOriginal,
      normalizedQuery: queryNormalized,
      hintedDomain,
      explicitDocTypes: explicitDocTypesList,
      explicitDocDomains: explicitDocDomainsList,
    },
    documentIntelligenceBanks,
  );
  const domain = hintedDomain ?? classification.domain;
  const resolvedDocTypes = explicitDocTypesList.length
    ? explicitDocTypesList
    : classification.docTypeId
      ? [classification.docTypeId]
      : [];
  const resolvedDocDomains = explicitDocDomainsList.length
    ? explicitDocDomainsList
    : domain
      ? [domain]
      : [];
  const ruleCtx: RuleMatchContext = {
    query: queryOriginal,
    normalizedQuery: queryNormalized,
    intent: signals.queryFamily ?? signals.intentFamily ?? null,
    operator: signals.operator ?? null,
    domain: domain || null,
    docLock: isDocLockActive(signals),
    explicitDocsCount: explicitDocIdsList.length,
    explicitDocIds: explicitDocIdsList,
    explicitDocTypes: resolvedDocTypes,
    explicitDocDomains: resolvedDocDomains,
    language: resolveLanguageHint(signals),
  };
  const emitRuleEvent = (
    event: RetrievalRuleTelemetryEvent["event"],
    payload: Record<string, any>,
  ) => {
    telemetry.retrievalRuleEvents.push({ event, payload });
  };

  const compareIntentFlag = isCompareIntent(signals, queryNormalized);
  const crossDocDecision = enforceCrossDocPolicy(
    {
      ...ruleCtx,
      candidateDocIds: scope.candidateDocIds,
      isCompareIntent: compareIntentFlag,
    },
    documentIntelligenceBanks.getCrossDocGroundingPolicy(),
  );
  if (!crossDocDecision.allow) {
    telemetry.crossDocGatedReason =
      crossDocDecision.reasonCode || "cross_doc_blocked";
    emitRuleEvent("retrieval.crossdoc_gated", {
      reason: telemetry.crossDocGatedReason,
      requiredExplicitDocs: crossDocDecision.requiredExplicitDocs,
      actualExplicitDocs: crossDocDecision.actualExplicitDocs,
    });
  }

  let retrievalCacheKey: string | null = null;
  let cachedPack: EvidencePack | null = null;
  if (RETRIEVAL_CONFIG.multiLevelCacheEnabled) {
    retrievalCacheKey = buildRetrievalCacheKey({
      queryNormalized,
      scopeDocIds: crossDocDecision.allowedCandidateDocIds,
      domain,
      resolvedDocTypes,
      resolvedDocDomains,
      signals,
      retrievalPlan: req.retrievalPlan || null,
      overrides: req.overrides || null,
      env: req.env,
      modelVersion: RETRIEVAL_CONFIG.modelVersion,
      history: req.history,
    });
    const cached = caches.retrievalResultCache.get(retrievalCacheKey);
    if (cached) {
      cachedPack = cloneEvidencePack(cached);
      if (cachedPack.debug) {
        const reasons = Array.isArray(cachedPack.debug.reasonCodes)
          ? cachedPack.debug.reasonCodes
          : [];
        if (!reasons.includes("retrieval_cache_hit")) {
          reasons.push("retrieval_cache_hit");
        }
        cachedPack.debug.reasonCodes = reasons;
      }
    }
  }

  const requiredBankSet =
    Array.isArray(signals.requiredBankIds) && signals.requiredBankIds.length > 0
      ? new Set(
          signals.requiredBankIds
            .map((id) => String(id || "").trim())
            .filter(Boolean),
        )
      : null;
  const includeBank = (bankId: string): boolean =>
    !requiredBankSet || requiredBankSet.has(bankId);

  const domainBoostBank =
    domain && includeBank(`boost_rules_${domain}`)
      ? documentIntelligenceBanks.getRetrievalBoostRules(domain)
      : null;
  const domainRewriteBank =
    domain && includeBank(`query_rewrites_${domain}`)
      ? documentIntelligenceBanks.getQueryRewriteRules(domain)
      : null;
  const sectionPriorityBank =
    domain && includeBank(`section_priority_${domain}`)
      ? documentIntelligenceBanks.getSectionPriorityRules(domain)
      : null;

  const boostRules = Array.isArray(domainBoostBank?.rules)
    ? (domainBoostBank.rules as BoostRule[])
    : [];
  const matchedBoostRules = matchBoostRules(
    {
      ...ruleCtx,
      maxMatchedBoostRules: safeNumber(domainBoostBank?.config?.maxMatchedRules, 3),
      maxDocumentIntelligenceBoost: safeNumber(
        domainBoostBank?.config?.maxDocumentIntelligenceBoost,
        0.45,
      ),
    },
    boostRules,
  );
  let runtimeBoostRules: MatchedBoostRule[] = [...matchedBoostRules];
  const docTypeBoostPlan =
    domain && resolvedDocTypes.length > 0
      ? buildDocTypeBoostPlan(domain, resolvedDocTypes[0], documentIntelligenceBanks)
      : null;
  const syntheticDocTypeRule = docTypeBoostPlan
    ? buildDocTypeMatchedRule(docTypeBoostPlan)
    : null;
  if (syntheticDocTypeRule) {
    runtimeBoostRules.push(syntheticDocTypeRule);
  }
  runtimeBoostRules = runtimeBoostRules.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
  for (const rule of runtimeBoostRules) {
    telemetry.matchedBoostRuleIds.push(rule.id);
    emitRuleEvent("retrieval.boost_rule_hit", {
      ruleId: rule.id,
      domain: domain || "unknown",
      operator: signals.operator ?? "unknown",
      intent: signals.intentFamily ?? "unknown",
    });
  }

  const expansion = computeExpansionPolicy(req, signals, semanticCfg);
  const expansionDisabledByOverride = Boolean(req.overrides?.disableExpansion);
  const expandedQueries =
    expansion.enabled && !expansionDisabledByOverride
      ? expandQuery(queryNormalized, signals, bankLoader)
      : [];

  const rewriteRules = Array.isArray(domainRewriteBank?.rules)
    ? (domainRewriteBank.rules as RewriteRule[])
    : [];
  const rewriteCacheKeyBase = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        queryNormalized,
        domain: domain || "unknown",
        intentFamily: signals.queryFamily ?? signals.intentFamily ?? "any",
        locale: resolveLanguageHint(signals),
        rewriteRuleCount: rewriteRules.length,
        bankVersion: signals.selectedBankVersionMap || null,
      }),
      "utf8",
    )
    .digest("hex");
  const rewriteCacheKey = `rewrite:${rewriteCacheKeyBase}`;
  const cachedRewrite = RETRIEVAL_CONFIG.multiLevelCacheEnabled
    ? caches.queryRewriteCache.get(rewriteCacheKey)
    : null;
  const domainRewriteVariants = cachedRewrite
    ? cachedRewrite.variants
    : applyQueryRewrites(
        {
          ...ruleCtx,
          contextText: queryNormalized,
          maxQueryVariants: safeNumber(
            domainRewriteBank?.config?.maxRewriteTerms,
            12,
          ),
        },
        rewriteRules,
      );
  if (!cachedRewrite && RETRIEVAL_CONFIG.multiLevelCacheEnabled) {
    caches.queryRewriteCache.set(rewriteCacheKey, {
      variants: domainRewriteVariants,
      ruleIds: Array.from(
        new Set(
          domainRewriteVariants
            .map((v) => String(v.sourceRuleId || "").trim())
            .filter(Boolean),
        ),
      ),
    });
  }
  const rewriteVariantCounts = new Map<string, number>();
  for (const variant of domainRewriteVariants) {
    const ruleId = String(variant.sourceRuleId || "").trim();
    if (!ruleId) continue;
    rewriteVariantCounts.set(ruleId, (rewriteVariantCounts.get(ruleId) || 0) + 1);
  }
  for (const [ruleId, variantCount] of Array.from(
    rewriteVariantCounts.entries(),
  ).sort((a, b) => a[0].localeCompare(b[0]))) {
    telemetry.rewriteRuleIds.push(ruleId);
    emitRuleEvent("retrieval.rewrite_applied", { ruleId, variantCount });
  }

  const queryVariants = buildQueryVariants({
    baseQuery: queryNormalized,
    expandedQueries,
    rewriteVariants: domainRewriteVariants,
    plannerQueryVariants: Array.isArray(req.retrievalPlan?.queryVariants)
      ? (req.retrievalPlan.queryVariants as string[])
      : [],
    requiredTerms: Array.isArray(req.retrievalPlan?.requiredTerms)
      ? (req.retrievalPlan.requiredTerms as string[])
      : [],
    maxVariants: safeNumber(domainRewriteBank?.config?.maxRewriteTerms, 12),
  });
  const sectionRules = Array.isArray(sectionPriorityBank?.priorities)
    ? (sectionPriorityBank.priorities as SectionPriorityRule[])
    : [];
  const sectionScanPlan = selectSectionScanPlan(ruleCtx, sectionRules);
  telemetry.selectedSectionRuleId = sectionScanPlan.selectedRuleId;
  if (telemetry.selectedSectionRuleId) {
    emitRuleEvent("retrieval.section_plan_selected", {
      ruleId: telemetry.selectedSectionRuleId,
      anchorsCount: sectionScanPlan.sections.length,
    });
  }
  const additionalStructuralAnchors = Array.from(
    new Set([
      ...sectionScanPlan.sections,
      ...(docTypeBoostPlan?.sectionAnchors || []),
      ...(docTypeBoostPlan?.tableAnchors || []),
    ]),
  );

  return {
    classification,
    domain,
    resolvedDocTypes,
    resolvedDocDomains,
    ruleCtx,
    compareIntentFlag,
    crossDocDecision,
    runtimeBoostRules,
    queryVariants,
    expandedQueries,
    additionalStructuralAnchors,
    retrievalCacheKey,
    cachedPack,
  };
}
