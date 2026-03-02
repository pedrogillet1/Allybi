/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RuleMatchContext {
  query?: string;
  normalizedQuery?: string;
  contextText?: string;
  intent?: string | null;
  operator?: string | null;
  domain?: string | null;
  docLock: boolean;
  explicitDocsCount: number;
  explicitDocIds?: string[];
  explicitDocTypes?: string[];
  language?: string | null;
  maxMatchedBoostRules?: number;
  maxDocumentIntelligenceBoost?: number;
  maxQueryVariants?: number;
  isCompareIntent?: boolean;
  candidateDocIds?: string[];
  explicitDocDomains?: string[];
}

export interface BoostRuleCondition {
  docLock?: boolean;
  requireDomainMatch?: boolean;
  minExplicitResolvedDocs?: number;
  operators?: string[];
  intents?: string[];
  explicitDocTypes?: string[];
  explicitDocIds?: string[];
  domains?: string[];
}

export interface BoostRule {
  id: string;
  enabled?: boolean;
  priority?: number;
  weight?: number;
  requireDomainMatch?: boolean;
  operators?: string[];
  intents?: string[];
  explicitDocTypes?: string[];
  explicitDocIds?: string[];
  conditions?: BoostRuleCondition;
  boostDocTypes?:
    | Array<string | { docType?: string; id?: string; weight?: number }>
    | Record<string, number>;
  boostSections?:
    | Array<
        | string
        | { section?: string; anchor?: string; id?: string; weight?: number }
      >
    | Record<string, number>;
}

export interface RewriteRule {
  id: string;
  enabled?: boolean;
  priority?: number;
  weight?: number;
  operators?: string[];
  intents?: string[];
  domains?: string[];
  languages?: string[];
  patterns?: string[];
  negativePatterns?: string[];
  requireContextAny?: string[];
  requireContextAll?: string[];
  forbidContextAny?: string[];
  rewrites?: Array<
    string | { value?: string; query?: string; weight?: number }
  >;
  conditions?: {
    docLock?: boolean;
    requireDomainMatch?: boolean;
    minExplicitResolvedDocs?: number;
    maxExplicitResolvedDocs?: number;
    explicitDocTypes?: string[];
    explicitDocIds?: string[];
    requireNoExplicitDocTypes?: boolean;
    requireNoExplicitDocIds?: boolean;
    allowWhenExplicitDocTypes?: boolean;
    allowWhenExplicitDocIds?: boolean;
    operators?: string[];
    intents?: string[];
    domains?: string[];
    languages?: string[];
    negativePatterns?: string[];
    requireContextAny?: string[];
    requireContextAll?: string[];
    forbidContextAny?: string[];
  };
}

export interface SectionPriorityRule {
  id?: string;
  enabled?: boolean;
  priority?: number;
  intent?: string;
  intents?: string[];
  operator?: string;
  operators?: string[];
  docType?: string;
  docTypes?: string[];
  domain?: string;
  domains?: string[];
  requireDomainMatch?: boolean;
  sections?: string[];
  anchors?: string[];
  sectionFamilies?: string[];
}

export interface CrossDocRule {
  id?: string;
  enabled?: boolean;
  priority?: number;
  intent?: string;
  intents?: string[];
  operator?: string;
  operators?: string[];
  minExplicitResolvedDocs?: number;
  requireDomainMatch?: boolean;
  allowWhenDocLock?: boolean;
  maxCandidates?: number;
}

export interface MatchedBoostRule {
  id: string;
  priority: number;
  weight: number;
  docTypeWeights: Record<string, number>;
  sectionWeights: Record<string, number>;
}

export interface BoostRuleDeltaSummary {
  ruleId: string;
  candidateHits: number;
  totalDelta: number;
  averageDelta: number;
  maxDelta: number;
}

export interface BoostScoringCandidate {
  candidateId?: string;
  docId: string;
  docType?: string | null;
  location?: {
    sectionKey?: string | null;
  };
  snippet?: string;
  scores: {
    final?: number;
    documentIntelligenceBoost?: number;
    [k: string]: number | undefined;
  };
}

export interface SectionScanPlan {
  selectedRuleId: string | null;
  matchedRuleIds: string[];
  sections: string[];
}

export interface CrossDocGatingDecision {
  allow: boolean;
  reasonCode: string | null;
  askDisambiguation: boolean;
  allowedCandidateDocIds: string[];
  maxCandidates: number;
  requiredExplicitDocs: number;
  actualExplicitDocs: number;
}

export interface QueryVariant {
  text: string;
  weight: number;
  sourceRuleId: string;
  reason: string;
}

function normalizeToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = normalizeToken(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function normalizeRegexList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = String(value || "").trim();
    const dedupeToken = token.toLowerCase();
    if (!token || seen.has(dedupeToken)) continue;
    seen.add(dedupeToken);
    out.push(token);
  }
  return out;
}

function dedupeKeepOrder(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = String(value || "").trim();
    const dedupeToken = token.toLowerCase();
    if (!token || seen.has(dedupeToken)) continue;
    seen.add(dedupeToken);
    out.push(token);
  }
  return out;
}

function normalizeWeight(value: unknown, fallback = 1): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(0, Math.min(raw, 20));
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeWeightedMap(
  raw: BoostRule["boostDocTypes"] | BoostRule["boostSections"],
  keyField: "docType" | "section",
  baseWeight: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;

  if (!Array.isArray(raw) && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      const token = normalizeToken(key);
      if (!token) continue;
      out[token] = normalizeWeight(value, 1) * baseWeight;
    }
    return out;
  }

  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    if (typeof entry === "string") {
      const token = normalizeToken(entry);
      if (!token) continue;
      out[token] = normalizeWeight(1, 1) * baseWeight;
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const token = normalizeToken(value[keyField] ?? value.anchor ?? value.id);
    if (!token) continue;
    out[token] = normalizeWeight(value.weight, 1) * baseWeight;
  }

  return out;
}

function intersects(values: string[], compareTo: string[]): boolean {
  if (!values.length) return false;
  if (!compareTo.length) return false;
  const set = new Set(compareTo);
  return values.some((value) => set.has(value));
}

function matchesAny(ruleValues: string[], candidate: string): boolean {
  if (!ruleValues.length) return true;
  return ruleValues.includes(candidate);
}

function hasPatternMatch(patterns: string[], query: string): boolean {
  if (!patterns.length) return true;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(query);
    } catch {
      return false;
    }
  });
}

function getMatchingPatterns(patterns: string[], query: string): string[] {
  const matched: string[] = [];
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern, "i").test(query)) {
        matched.push(pattern);
      }
    } catch {
      continue;
    }
  }
  return matched;
}

function includesContextTerm(context: string, term: string): boolean {
  const normalizedTerm = normalizeToken(term);
  if (!normalizedTerm) return false;
  return context.includes(normalizedTerm);
}

function isShortAcronymPattern(pattern: string): boolean {
  const token = String(pattern || "")
    .trim()
    .toLowerCase();
  if (!token) return false;
  if (/^[a-z0-9]{1,4}$/i.test(token)) return true;
  return /^\\b[a-z0-9]{1,4}\\b$/i.test(token);
}

function tokenizeRewriteTerm(value: string): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function deriveImplicitAcronymContextTerms(
  rewrites: RewriteRule["rewrites"],
  domain: string,
): string[] {
  const domainDefaults: Record<string, string[]> = {
    accounting: [
      "ledger",
      "invoice",
      "aging",
      "statement",
      "journal",
      "balance",
      "fiscal",
    ],
    finance: [
      "revenue",
      "margin",
      "statement",
      "budget",
      "forecast",
      "cash",
      "fiscal",
    ],
    legal: [
      "agreement",
      "contract",
      "clause",
      "liability",
      "obligation",
      "termination",
    ],
    medical: [
      "patient",
      "result",
      "laboratory",
      "clinical",
      "diagnostic",
      "medication",
      "reference range",
    ],
    ops: [
      "incident",
      "service",
      "runbook",
      "timeline",
      "operations",
      "uptime",
      "root cause",
    ],
  };

  const rewriteTerms: string[] = [];
  for (const rewrite of rewrites || []) {
    const raw =
      typeof rewrite === "string"
        ? rewrite
        : String((rewrite as any)?.value ?? (rewrite as any)?.query ?? "");
    if (!raw) continue;
    rewriteTerms.push(...tokenizeRewriteTerm(raw));
  }

  return dedupeKeepOrder([
    ...rewriteTerms,
    ...(domainDefaults[normalizeToken(domain)] || []),
  ]).slice(0, 12);
}

function buildRewriteVariantText(
  query: string,
  rewriteValue: string,
  matchedPatterns: string[],
): string {
  const replacedQueryValue = rewriteValue.replace(/\{query\}/gi, query).trim();
  if (!replacedQueryValue) return "";
  if (replacedQueryValue.includes(query)) {
    return replacedQueryValue.replace(/\s+/g, " ").trim();
  }

  for (const pattern of matchedPatterns) {
    try {
      const replaced = query.replace(
        new RegExp(pattern, "i"),
        replacedQueryValue,
      );
      if (normalizeToken(replaced) !== normalizeToken(query)) {
        return replaced.replace(/\s+/g, " ").trim();
      }
    } catch {
      continue;
    }
  }

  return `${query} ${replacedQueryValue}`.replace(/\s+/g, " ").trim();
}

export function matchBoostRules(
  ctx: RuleMatchContext,
  rules: BoostRule[],
): MatchedBoostRule[] {
  const intent = normalizeToken(ctx.intent);
  const operator = normalizeToken(ctx.operator);
  const domain = normalizeToken(ctx.domain);
  const explicitDocIds = normalizeStringList(ctx.explicitDocIds || []);
  const explicitDocTypes = normalizeStringList(ctx.explicitDocTypes || []);

  const matches: MatchedBoostRule[] = [];

  for (const rule of rules || []) {
    if (!rule || typeof rule !== "object") continue;
    if (rule.enabled === false) continue;

    const conditions = (rule.conditions || {}) as BoostRuleCondition;

    if (
      typeof conditions.docLock === "boolean" &&
      conditions.docLock !== Boolean(ctx.docLock)
    ) {
      continue;
    }

    const requireDomainMatch =
      rule.requireDomainMatch === true ||
      conditions.requireDomainMatch === true ||
      (Array.isArray(conditions.domains) && conditions.domains.length > 0);
    const allowedDomains = normalizeStringList(conditions.domains || []);
    if (requireDomainMatch) {
      if (!domain) continue;
      if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
        continue;
      }
    }

    const minExplicitResolvedDocs = Number(
      conditions.minExplicitResolvedDocs ?? 0,
    );
    if (
      Number.isFinite(minExplicitResolvedDocs) &&
      ctx.explicitDocsCount < minExplicitResolvedDocs
    ) {
      continue;
    }

    const ruleIntents = dedupeKeepOrder([
      ...normalizeStringList(rule.intents || []),
      ...normalizeStringList(conditions.intents || []),
    ]);
    if (!matchesAny(ruleIntents, intent)) continue;

    const ruleOperators = dedupeKeepOrder([
      ...normalizeStringList(rule.operators || []),
      ...normalizeStringList(conditions.operators || []),
    ]);
    if (!matchesAny(ruleOperators, operator)) continue;

    const gatedDocTypes = dedupeKeepOrder([
      ...normalizeStringList(conditions.explicitDocTypes || []),
      ...normalizeStringList(rule.explicitDocTypes || []),
    ]);
    if (
      gatedDocTypes.length > 0 &&
      !intersects(gatedDocTypes, explicitDocTypes)
    ) {
      continue;
    }

    const gatedDocIds = dedupeKeepOrder([
      ...normalizeStringList(conditions.explicitDocIds || []),
      ...normalizeStringList(rule.explicitDocIds || []),
    ]);
    if (gatedDocIds.length > 0 && !intersects(gatedDocIds, explicitDocIds)) {
      continue;
    }

    const baseWeight = normalizeWeight(rule.weight, 1);
    const docTypeWeights = normalizeWeightedMap(
      rule.boostDocTypes || [],
      "docType",
      baseWeight,
    );
    const sectionWeights = normalizeWeightedMap(
      rule.boostSections || [],
      "section",
      baseWeight,
    );
    if (
      !Object.keys(docTypeWeights).length &&
      !Object.keys(sectionWeights).length
    ) {
      continue;
    }

    matches.push({
      id: normalizeToken(rule.id) || "rule",
      priority: normalizeWeight(rule.priority, 1),
      weight: baseWeight,
      docTypeWeights,
      sectionWeights,
    });
  }

  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  return matches;
}

export function applyBoostScoring(
  ctx: RuleMatchContext,
  candidates: BoostScoringCandidate[],
  matchedRules: MatchedBoostRule[],
): BoostScoringCandidate[] {
  const topN = Math.max(1, Math.floor(Number(ctx.maxMatchedBoostRules ?? 3)));
  const maxBoost = clamp(
    Number(ctx.maxDocumentIntelligenceBoost ?? 0.45),
    0,
    1,
  );
  const rules = (matchedRules || []).slice(0, topN);

  const rescored = (candidates || []).map((candidate) => {
    const next = {
      ...candidate,
      scores: {
        ...(candidate.scores || {}),
      },
    };

    const docType = normalizeToken(candidate.docType);
    const sectionKey = normalizeToken(candidate.location?.sectionKey);

    let boost = 0;
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      const diminishing = 1 / (i + 1);
      const docTypeWeight = docType
        ? Number(rule.docTypeWeights[docType] || 0)
        : 0;
      const sectionWeight = sectionKey
        ? Number(rule.sectionWeights[sectionKey] || 0)
        : 0;
      boost += (docTypeWeight * 0.03 + sectionWeight * 0.025) * diminishing;
    }

    const boundedBoost = clamp(boost, 0, maxBoost);
    next.scores.documentIntelligenceBoost = boundedBoost;

    if (Number.isFinite(next.scores.final)) {
      next.scores.final = clamp((next.scores.final || 0) + boundedBoost, 0, 1);
    }

    return next;
  });

  rescored.sort((a, b) => {
    const af = Number(a.scores.final || 0);
    const bf = Number(b.scores.final || 0);
    if (bf !== af) return bf - af;
    const ad = String(a.docId || "");
    const bd = String(b.docId || "");
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.candidateId || "").localeCompare(
      String(b.candidateId || ""),
    );
  });

  return rescored;
}

export function summarizeBoostRuleApplications(
  ctx: RuleMatchContext,
  candidates: BoostScoringCandidate[],
  matchedRules: MatchedBoostRule[],
): BoostRuleDeltaSummary[] {
  const topN = Math.max(1, Math.floor(Number(ctx.maxMatchedBoostRules ?? 3)));
  const maxBoost = clamp(
    Number(ctx.maxDocumentIntelligenceBoost ?? 0.45),
    0,
    1,
  );
  const rules = (matchedRules || []).slice(0, topN);
  if (!rules.length || !(candidates || []).length) return [];

  const aggregates = new Map<
    string,
    { candidateHits: number; totalDelta: number; maxDelta: number }
  >();
  for (const rule of rules) {
    aggregates.set(rule.id, {
      candidateHits: 0,
      totalDelta: 0,
      maxDelta: 0,
    });
  }

  for (const candidate of candidates || []) {
    const docType = normalizeToken(candidate.docType);
    const sectionKey = normalizeToken(candidate.location?.sectionKey);
    const rawByRule = new Map<string, number>();

    let totalRaw = 0;
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      const diminishing = 1 / (i + 1);
      const docTypeWeight = docType
        ? Number(rule.docTypeWeights[docType] || 0)
        : 0;
      const sectionWeight = sectionKey
        ? Number(rule.sectionWeights[sectionKey] || 0)
        : 0;
      const rawContribution =
        (docTypeWeight * 0.03 + sectionWeight * 0.025) * diminishing;
      if (rawContribution <= 0) continue;
      rawByRule.set(rule.id, rawContribution);
      totalRaw += rawContribution;
    }

    if (totalRaw <= 0) continue;
    const bounded = clamp(totalRaw, 0, maxBoost);
    const scale = totalRaw > 0 ? bounded / totalRaw : 0;

    for (const [ruleId, rawContribution] of rawByRule.entries()) {
      const delta = rawContribution * scale;
      if (delta <= 0) continue;
      const aggregate = aggregates.get(ruleId);
      if (!aggregate) continue;
      aggregate.candidateHits += 1;
      aggregate.totalDelta += delta;
      aggregate.maxDelta = Math.max(aggregate.maxDelta, delta);
    }
  }

  const out: BoostRuleDeltaSummary[] = [];
  for (const [ruleId, aggregate] of aggregates.entries()) {
    if (aggregate.candidateHits <= 0 || aggregate.totalDelta <= 0) continue;
    out.push({
      ruleId,
      candidateHits: aggregate.candidateHits,
      totalDelta: Number(aggregate.totalDelta.toFixed(6)),
      averageDelta: Number(
        (aggregate.totalDelta / aggregate.candidateHits).toFixed(6),
      ),
      maxDelta: Number(aggregate.maxDelta.toFixed(6)),
    });
  }

  out.sort((a, b) => {
    if (b.totalDelta !== a.totalDelta) return b.totalDelta - a.totalDelta;
    if (b.candidateHits !== a.candidateHits)
      return b.candidateHits - a.candidateHits;
    return a.ruleId.localeCompare(b.ruleId);
  });

  return out;
}

export function selectSectionScanPlan(
  ctx: RuleMatchContext,
  rules: SectionPriorityRule[],
): SectionScanPlan {
  const intent = normalizeToken(ctx.intent);
  const operator = normalizeToken(ctx.operator);
  const domain = normalizeToken(ctx.domain);
  const explicitDocTypes = normalizeStringList(ctx.explicitDocTypes || []);

  const scored: Array<{
    rule: SectionPriorityRule;
    id: string;
    specificity: number;
    priority: number;
    sections: string[];
  }> = [];

  for (const rawRule of rules || []) {
    if (!rawRule || typeof rawRule !== "object") continue;
    if (rawRule.enabled === false) continue;

    const intents = dedupeKeepOrder([
      ...normalizeStringList(rawRule.intents || []),
      normalizeToken(rawRule.intent),
    ]);
    if (intents.length > 0 && !intents.includes(intent)) continue;

    const operators = dedupeKeepOrder([
      ...normalizeStringList(rawRule.operators || []),
      normalizeToken(rawRule.operator),
    ]);
    if (operators.length > 0 && !operators.includes(operator)) continue;

    const docTypes = dedupeKeepOrder([
      ...normalizeStringList(rawRule.docTypes || []),
      normalizeToken(rawRule.docType),
    ]);
    if (docTypes.length > 0 && !intersects(docTypes, explicitDocTypes))
      continue;

    const requireDomainMatch =
      rawRule.requireDomainMatch === true ||
      Boolean(rawRule.domain) ||
      (Array.isArray(rawRule.domains) && rawRule.domains.length > 0);
    const domains = dedupeKeepOrder([
      ...normalizeStringList(rawRule.domains || []),
      normalizeToken(rawRule.domain),
    ]);
    if (requireDomainMatch) {
      if (!domain) continue;
      if (domains.length > 0 && !domains.includes(domain)) continue;
    }

    const sections = dedupeKeepOrder([
      ...normalizeStringList(rawRule.sections || []),
      ...normalizeStringList(rawRule.anchors || []),
      ...normalizeStringList(rawRule.sectionFamilies || []),
    ]);
    if (!sections.length) continue;

    const specificity =
      (intents.length > 0 ? 1 : 0) +
      (operators.length > 0 ? 1 : 0) +
      (docTypes.length > 0 ? 2 : 0) +
      (requireDomainMatch ? 1 : 0);

    scored.push({
      rule: rawRule,
      id: normalizeToken(rawRule.id) || "section_rule",
      specificity,
      priority: normalizeWeight(rawRule.priority, 1),
      sections,
    });
  }

  scored.sort((a, b) => {
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  const selected = scored[0];
  return {
    selectedRuleId: selected ? selected.id : null,
    matchedRuleIds: scored.map((item) => item.id),
    sections: selected ? selected.sections : [],
  };
}

export function applyQueryRewrites(
  ctx: RuleMatchContext,
  rules: RewriteRule[],
): QueryVariant[] {
  const query = String(ctx.normalizedQuery || ctx.query || "")
    .trim()
    .toLowerCase();
  if (!query) return [];

  const intent = normalizeToken(ctx.intent);
  const operator = normalizeToken(ctx.operator);
  const domain = normalizeToken(ctx.domain);
  const language = normalizeToken(ctx.language || "any");
  const explicitDocIds = normalizeStringList(ctx.explicitDocIds || []);
  const explicitDocTypes = normalizeStringList(ctx.explicitDocTypes || []);
  const explicitDocsCount = Math.max(
    Number(ctx.explicitDocsCount || 0),
    explicitDocIds.length,
  );
  const compareIntent = isCompareIntent(ctx);
  const maxVariants = Math.max(
    1,
    Math.floor(Number(ctx.maxQueryVariants ?? 12)),
  );
  const context = `${query} ${String(ctx.contextText || "").toLowerCase()}`
    .replace(/\s+/g, " ")
    .trim();

  const matchedRules = (rules || [])
    .filter((rule) => rule && rule.enabled !== false)
    .map((rule) => {
      const conditions = rule.conditions || {};

      if (
        typeof (conditions as any).docLock === "boolean" &&
        (conditions as any).docLock !== Boolean(ctx.docLock)
      ) {
        return null;
      }

      const minExplicitResolvedDocs = Number(
        (conditions as any).minExplicitResolvedDocs ?? 0,
      );
      if (
        Number.isFinite(minExplicitResolvedDocs) &&
        explicitDocsCount < minExplicitResolvedDocs
      ) {
        return null;
      }

      const maxExplicitResolvedDocs = Number(
        (conditions as any).maxExplicitResolvedDocs,
      );
      if (
        Number.isFinite(maxExplicitResolvedDocs) &&
        explicitDocsCount > maxExplicitResolvedDocs
      ) {
        return null;
      }

      const intents = dedupeKeepOrder([
        ...normalizeStringList(rule.intents || []),
        ...normalizeStringList((conditions as any).intents || []),
      ]);
      if (!matchesAny(intents, intent)) return null;

      const operators = dedupeKeepOrder([
        ...normalizeStringList(rule.operators || []),
        ...normalizeStringList((conditions as any).operators || []),
      ]);
      if (!matchesAny(operators, operator)) return null;

      const gatedDocTypes = normalizeStringList(
        (conditions as any).explicitDocTypes || [],
      );
      if (
        gatedDocTypes.length > 0 &&
        !intersects(gatedDocTypes, explicitDocTypes)
      ) {
        return null;
      }

      const gatedDocIds = normalizeStringList(
        (conditions as any).explicitDocIds || [],
      );
      if (gatedDocIds.length > 0 && !intersects(gatedDocIds, explicitDocIds)) {
        return null;
      }

      if (
        (conditions as any).requireNoExplicitDocTypes === true &&
        explicitDocTypes.length > 0
      ) {
        return null;
      }

      if (
        (conditions as any).requireNoExplicitDocIds === true &&
        explicitDocIds.length > 0
      ) {
        return null;
      }

      if (
        !compareIntent &&
        explicitDocTypes.length > 0 &&
        (conditions as any).allowWhenExplicitDocTypes !== true &&
        gatedDocTypes.length === 0 &&
        isShortAcronymPattern((rule.patterns || [])[0] || "") === false
      ) {
        return null;
      }

      if (
        explicitDocIds.length > 0 &&
        (conditions as any).allowWhenExplicitDocIds !== true &&
        gatedDocIds.length === 0
      ) {
        return null;
      }

      const domains = dedupeKeepOrder([
        ...normalizeStringList(rule.domains || []),
        ...normalizeStringList((conditions as any).domains || []),
      ]);
      const requireDomainMatch =
        (conditions as any).requireDomainMatch === true || domains.length > 0;
      if (requireDomainMatch) {
        if (!domain) return null;
        if (domains.length > 0 && !domains.includes(domain)) return null;
      }

      const languages = dedupeKeepOrder([
        ...normalizeStringList(rule.languages || []),
        ...normalizeStringList((conditions as any).languages || []),
      ]);
      if (languages.length > 0 && !languages.includes(language)) return null;

      const patterns = normalizeRegexList(rule.patterns || []);
      const matchedPatterns = getMatchingPatterns(patterns, query);
      if (!matchedPatterns.length && patterns.length > 0) return null;
      if (patterns.length === 0 && !hasPatternMatch([], query)) return null;

      const negativePatterns = dedupeKeepOrder([
        ...normalizeRegexList(rule.negativePatterns || []),
        ...normalizeRegexList((conditions as any).negativePatterns || []),
      ]);
      if (getMatchingPatterns(negativePatterns, query).length > 0) return null;

      const requireContextAny = dedupeKeepOrder([
        ...normalizeStringList(rule.requireContextAny || []),
        ...normalizeStringList((conditions as any).requireContextAny || []),
      ]);
      if (
        requireContextAny.length > 0 &&
        !requireContextAny.some((term) => includesContextTerm(context, term))
      ) {
        return null;
      }

      const requireContextAll = dedupeKeepOrder([
        ...normalizeStringList(rule.requireContextAll || []),
        ...normalizeStringList((conditions as any).requireContextAll || []),
      ]);
      if (
        requireContextAll.length > 0 &&
        !requireContextAll.every((term) => includesContextTerm(context, term))
      ) {
        return null;
      }

      const forbidContextAny = dedupeKeepOrder([
        ...normalizeStringList(rule.forbidContextAny || []),
        ...normalizeStringList((conditions as any).forbidContextAny || []),
      ]);
      if (
        forbidContextAny.length > 0 &&
        forbidContextAny.some((term) => includesContextTerm(context, term))
      ) {
        return null;
      }

      const hasShortAcronym = patterns.some(isShortAcronymPattern);
      const hasExplicitGuardrails =
        negativePatterns.length > 0 ||
        requireContextAny.length > 0 ||
        requireContextAll.length > 0 ||
        forbidContextAny.length > 0;
      if (hasShortAcronym && !hasExplicitGuardrails) {
        const implicitContext = deriveImplicitAcronymContextTerms(
          rule.rewrites,
          domain,
        );
        if (
          implicitContext.length > 0 &&
          !implicitContext.some((term) => includesContextTerm(context, term))
        ) {
          return null;
        }
      }

      return {
        rule,
        matchedPatterns,
        priority: normalizeWeight(rule.priority, 1),
        baseWeight: normalizeWeight(rule.weight, 1),
      };
    })
    .filter(Boolean) as Array<{
    rule: RewriteRule;
    matchedPatterns: string[];
    priority: number;
    baseWeight: number;
  }>;

  matchedRules.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return String(a.rule.id || "").localeCompare(String(b.rule.id || ""));
  });

  const variants: Array<QueryVariant & { priority: number }> = [];

  for (const matchedRule of matchedRules) {
    const rewrites = Array.isArray(matchedRule.rule.rewrites)
      ? matchedRule.rule.rewrites
      : [];
    for (const rewrite of rewrites) {
      let raw = "";
      let rewriteWeight = 1;
      if (typeof rewrite === "string") {
        raw = rewrite;
      } else if (rewrite && typeof rewrite === "object") {
        raw = String((rewrite as any).value ?? (rewrite as any).query ?? "");
        rewriteWeight = normalizeWeight((rewrite as any).weight, 1);
      }

      const variantText = buildRewriteVariantText(
        query,
        raw,
        matchedRule.matchedPatterns,
      );
      if (!variantText) continue;

      variants.push({
        text: variantText,
        weight: clamp(matchedRule.baseWeight * rewriteWeight, 0.1, 3),
        sourceRuleId: String(matchedRule.rule.id || "rewrite_rule"),
        reason: `matched pattern and guardrails for ${String(matchedRule.rule.id || "rewrite_rule")}`,
        priority: matchedRule.priority,
      });
    }
  }

  variants.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.sourceRuleId !== b.sourceRuleId)
      return a.sourceRuleId.localeCompare(b.sourceRuleId);
    return a.text.localeCompare(b.text);
  });

  const deduped: QueryVariant[] = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    const key = normalizeToken(variant.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      text: variant.text,
      weight: variant.weight,
      sourceRuleId: variant.sourceRuleId,
      reason: variant.reason,
    });
    if (deduped.length >= maxVariants) break;
  }

  return deduped;
}

function isCompareIntent(ctx: RuleMatchContext): boolean {
  if (typeof ctx.isCompareIntent === "boolean") return ctx.isCompareIntent;
  const intent = normalizeToken(ctx.intent);
  const operator = normalizeToken(ctx.operator);
  if (intent.includes("compare")) return true;
  if (operator.includes("compare")) return true;
  const query = normalizeToken(ctx.normalizedQuery || ctx.query);
  return /\b(compare|comparison|vs|versus|difference|diff|between|comparar|diferenca|diferença|entre)\b/i.test(
    query,
  );
}

function resolveCrossDocRule(
  ctx: RuleMatchContext,
  policyBank: any,
): CrossDocRule | null {
  const rules = Array.isArray(policyBank?.rules) ? policyBank.rules : [];
  if (!rules.length) return null;
  const intent = normalizeToken(ctx.intent);
  const operator = normalizeToken(ctx.operator);
  const domain = normalizeToken(ctx.domain);

  const matched = rules
    .filter((rule: any) => rule && rule.enabled !== false)
    .filter((rule: any) => {
      const intents = dedupeKeepOrder([
        ...normalizeStringList(rule.intents || []),
        normalizeToken(rule.intent),
      ]);
      if (!matchesAny(intents, intent)) return false;
      const operators = dedupeKeepOrder([
        ...normalizeStringList(rule.operators || []),
        normalizeToken(rule.operator),
      ]);
      if (!matchesAny(operators, operator)) return false;
      const domains = normalizeStringList(rule.domains || []);
      if (domains.length > 0 && !domains.includes(domain)) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const ap = normalizeWeight(a.priority, 1);
      const bp = normalizeWeight(b.priority, 1);
      if (bp !== ap) return bp - ap;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });

  return matched[0] ?? null;
}

export function enforceCrossDocPolicy(
  ctx: RuleMatchContext,
  policyBank: any,
): CrossDocGatingDecision {
  const candidateDocIds = dedupeKeepOrder(
    normalizeStringList(ctx.candidateDocIds || []),
  );
  const explicitDocIds = dedupeKeepOrder(
    normalizeStringList(ctx.explicitDocIds || []),
  );
  const explicitDocDomains = dedupeKeepOrder(
    normalizeStringList(ctx.explicitDocDomains || []),
  );
  const compareIntent = isCompareIntent(ctx);
  const crossDocRequested = compareIntent || ctx.explicitDocsCount > 1;
  const selectedRule = resolveCrossDocRule(ctx, policyBank);

  if (!policyBank || typeof policyBank !== "object") {
    return {
      allow: true,
      reasonCode: null,
      askDisambiguation: false,
      allowedCandidateDocIds: candidateDocIds,
      maxCandidates: candidateDocIds.length || 0,
      requiredExplicitDocs: 0,
      actualExplicitDocs: ctx.explicitDocsCount,
    };
  }

  const policyEnabled = policyBank?.config?.enabled !== false;
  if (!policyEnabled) {
    return {
      allow: true,
      reasonCode: null,
      askDisambiguation: false,
      allowedCandidateDocIds: candidateDocIds,
      maxCandidates: candidateDocIds.length || 0,
      requiredExplicitDocs: 0,
      actualExplicitDocs: ctx.explicitDocsCount,
    };
  }

  const retrievalPolicy = policyBank?.retrievalPolicy || {};
  const maxCandidates = Math.max(
    1,
    Math.floor(
      Number(
        selectedRule?.maxCandidates ?? retrievalPolicy.maxSourceDocuments ?? 5,
      ),
    ),
  );
  const allowWhenDocLock = Boolean(
    selectedRule?.allowWhenDocLock ?? retrievalPolicy.allowWhenDocLock ?? false,
  );
  const requireDomainMatch = Boolean(
    selectedRule?.requireDomainMatch ??
    retrievalPolicy.requireDomainMatch ??
    false,
  );
  const minExplicitForCompare = Math.max(
    1,
    Math.floor(Number(selectedRule?.minExplicitResolvedDocs ?? 2)),
  );

  if (!crossDocRequested) {
    return {
      allow: true,
      reasonCode: null,
      askDisambiguation: false,
      allowedCandidateDocIds: candidateDocIds,
      maxCandidates,
      requiredExplicitDocs: 0,
      actualExplicitDocs: ctx.explicitDocsCount,
    };
  }

  // A docset lock (multiple explicit attached docs) is a valid multi-doc scope.
  // Only block here when lock semantics indicate an effectively single-doc lock
  // but candidates expanded beyond one document.
  const singleDocLock = ctx.docLock && ctx.explicitDocsCount <= 1;
  if (singleDocLock && !allowWhenDocLock && candidateDocIds.length > 1) {
    return {
      allow: false,
      reasonCode: "cross_doc_blocked_doc_lock",
      askDisambiguation: true,
      allowedCandidateDocIds: explicitDocIds.slice(0, 1),
      maxCandidates,
      requiredExplicitDocs: minExplicitForCompare,
      actualExplicitDocs: ctx.explicitDocsCount,
    };
  }

  if (compareIntent && ctx.explicitDocsCount < minExplicitForCompare) {
    return {
      allow: false,
      reasonCode: "cross_doc_compare_needs_explicit_docs",
      askDisambiguation: true,
      allowedCandidateDocIds: explicitDocIds,
      maxCandidates,
      requiredExplicitDocs: minExplicitForCompare,
      actualExplicitDocs: ctx.explicitDocsCount,
    };
  }

  if (requireDomainMatch && explicitDocDomains.length > 1) {
    return {
      allow: false,
      reasonCode: "cross_doc_domain_mismatch",
      askDisambiguation: true,
      allowedCandidateDocIds: explicitDocIds.slice(0, maxCandidates),
      maxCandidates,
      requiredExplicitDocs: minExplicitForCompare,
      actualExplicitDocs: ctx.explicitDocsCount,
    };
  }

  const preferredIds =
    compareIntent && explicitDocIds.length > 0
      ? explicitDocIds
      : candidateDocIds;
  const allowedCandidateDocIds = preferredIds.slice(0, maxCandidates);

  return {
    allow: true,
    reasonCode: null,
    askDisambiguation: false,
    allowedCandidateDocIds,
    maxCandidates,
    requiredExplicitDocs: minExplicitForCompare,
    actualExplicitDocs: ctx.explicitDocsCount,
  };
}
