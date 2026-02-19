// src/services/core/domainEnforcement.service.ts
//
// DOMAIN ENFORCEMENT (ChatGPT-like)
// -----------------------------------------------------------------------------
// Purpose
// - Single place where "domain" becomes a stable, validated, system-wide decision.
// - Reads domain_detection + domain_ontology (and optional bank_aliases / terminology_domains).
// - Outputs a canonical domainId + confidence + related domains + retrieval/formatting profiles.
// - Prevents drift: unknown/typo domains collapse to "general" (or defaultDomain from ontology).
//
// Where it fits in pipeline
// - After: query_rewrite (signals), scope_resolution (doc scope), candidate_filters (candidate docs)
// - Before: retrieval (choose retrieval profile), compose_answer (tone/format profile)
//
// Key guarantees
// - Never emit a domainId not listed in domain_ontology.domainIds when strictDomainIds=true.
// - If explicit domain requested by user (e.g., "in legal terms"), honor it if valid.
// - If docType strongly indicates a domain (xlsx -> excel), allow a boost, not a hard override.
// -----------------------------------------------------------------------------

import { getBank } from "../banks/bankLoader.service";

export type LanguageCode = "en" | "pt" | "es" | "any";

export interface DomainHint {
  topDomain?: string;
  confidence?: number;
  matches?: Array<{
    domainId: string;
    match: string;
    weight: number;
    source: "query" | "title" | "snippet";
  }>;
}

export interface DomainState {
  activeDomain?: { value: string; ttlTurns?: number };
}

export interface DomainEnforcementInput {
  queryText: string;
  docTitle?: string;
  docSnippets?: string[];
  docTypesInScope?: string[]; // e.g., ["pdf","xlsx"]
  language?: LanguageCode;

  // optional upstream hints/signals
  hint?: DomainHint; // from query_rewrite/domain_detection upstream
  explicitDomainRequest?: string; // extracted upstream if user explicitly requested a domain
  state?: DomainState;
}

export interface DomainDecision {
  domainId: string;
  confidence: number;
  candidates: Array<{ domainId: string; confidence: number }>;
  relatedDomains: string[];
  retrievalProfile: string; // e.g. "balanced", "numeric_leaning"
  formattingProfile: string; // e.g. "numbers_first", "fields_first"
  terminologyKey: string; // key used by terminology bank(s)
  reasons: string[];
  debug?: {
    usedHint: boolean;
    usedDetection: boolean;
    strictDomainIds: boolean;
    defaultDomain: string;
  };
}

// -----------------------------
// Bank shapes (minimal contracts)
// -----------------------------

type DomainOntologyBank = {
  _meta: any;
  config: {
    enabled: boolean;
    strictDomainIds: boolean;
    failOnUnknownDomain: boolean;
    defaultDomain: string;
    maxRelatedDomains: number;
  };
  domainIds: string[];
  domains: Array<{
    id: string;
    aliases?: Record<string, string[]>; // lang -> aliases
    docAffinity?: {
      preferredDocTypes?: string[];
      ocrTolerance?: "low" | "medium" | "high";
    };
    retrievalProfile?: string;
    formattingProfile?: string;
    terminologyKey?: string;
    relatedDomains?: string[]; // optional
  }>;
};

type DomainDetectionBank = {
  _meta: any;
  config: {
    enabled: boolean;
    useRegex: boolean;
    caseInsensitive: boolean;
    stripDiacritics: boolean;
    collapseWhitespace: boolean;
    maxDomainsToReturn: number;
    minConfidenceToEmit: number;
    strongMatchWeight: number;
    mediumMatchWeight: number;
    weakMatchWeight: number;
    titleBoost: number;
    docTextBoost: number;
    capMaxConfidence: number;
  };
  domains: Array<{
    id: string;
    strong?: string[];
    medium?: string[];
    weak?: string[];
  }>;
};

type BankAliases = {
  _meta: any;
  aliases: Array<{
    from: string; // old/alternate id
    to: string; // canonical id
  }>;
};

// -----------------------------
// Helpers
// -----------------------------

function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[–—]/g, "-")
    .replace(/[_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeRegex(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// -----------------------------
// Service
// -----------------------------

export class DomainEnforcementService {
  private ontology?: DomainOntologyBank;
  private detection?: DomainDetectionBank;
  private aliases?: BankAliases;

  // compiled regex cache: domainId -> {strong,medium,weak}
  private compiled: Record<
    string,
    { strong: RegExp[]; medium: RegExp[]; weak: RegExp[] }
  > = {};

  private loaded = false;

  constructor() {
    this.reloadBanks();
  }

  reloadBanks(): void {
    this.ontology = getBank<DomainOntologyBank>("domain_ontology");
    this.detection = getBank<DomainDetectionBank>("domain_detection");
    this.aliases = getBank<BankAliases>("bank_aliases"); // optional
    this.compiled = {};
    this.loaded = true;

    if (this.detection?.config?.enabled) {
      const flags = this.detection.config.caseInsensitive ? "i" : "";
      for (const d of this.detection.domains || []) {
        this.compiled[d.id] = {
          strong: (d.strong || [])
            .map((p) => safeRegex(p, flags))
            .filter(Boolean) as RegExp[],
          medium: (d.medium || [])
            .map((p) => safeRegex(p, flags))
            .filter(Boolean) as RegExp[],
          weak: (d.weak || [])
            .map((p) => safeRegex(p, flags))
            .filter(Boolean) as RegExp[],
        };
      }
    }
  }

  // Public entry point
  resolve(input: DomainEnforcementInput): DomainDecision {
    if (!this.loaded) this.reloadBanks();
    if (!this.ontology || !this.ontology.config?.enabled) {
      // hard fallback if ontology missing
      return {
        domainId: "general",
        confidence: 0.55,
        candidates: [{ domainId: "general", confidence: 0.55 }],
        relatedDomains: [],
        retrievalProfile: "balanced",
        formattingProfile: "default",
        terminologyKey: "general",
        reasons: ["ontology_missing_fallback_general"],
      };
    }

    const reasons: string[] = [];
    const strict = !!this.ontology.config.strictDomainIds;
    const defaultDomain = this.ontology.config.defaultDomain || "general";

    const q = normalizeText(input.queryText);
    const title = normalizeText(input.docTitle || "");
    const snippets = (input.docSnippets || []).map(normalizeText);

    // 1) Normalize explicit domain request (if any)
    const explicit = this.normalizeDomainId(input.explicitDomainRequest || "");
    const explicitValid = explicit && this.isValidDomain(explicit);

    if (explicitValid) {
      const decision = this.decorateDecision(explicit!, 0.92, reasons, {
        defaultDomain,
        usedHint: false,
        usedDetection: false,
        strictDomainIds: strict,
      });
      decision.reasons.push("explicit_domain_request");
      return decision;
    }

    // 2) Try using upstream hint if present and valid
    const hintDomain = this.normalizeDomainId(input.hint?.topDomain || "");
    const hintValid = hintDomain && this.isValidDomain(hintDomain);
    const hintConfidence = clamp01(input.hint?.confidence ?? 0);

    // If hint confidence is high, accept it (but still decorate from ontology)
    if (hintValid && hintConfidence >= 0.75) {
      const decision = this.decorateDecision(
        hintDomain!,
        hintConfidence,
        reasons,
        {
          defaultDomain,
          usedHint: true,
          usedDetection: false,
          strictDomainIds: strict,
        },
      );
      decision.reasons.push("used_upstream_hint_high_conf");
      return decision;
    }

    // 3) Run domain detection (regex-based) if available
    const detectionEnabled = !!this.detection?.config?.enabled;
    let scored: Array<{ domainId: string; score: number; matches: number }> =
      [];

    if (detectionEnabled) {
      scored = this.scoreByDetection(q, title, snippets);
      if (scored.length > 0) reasons.push("used_domain_detection");
    }

    // 4) Add soft boosts from docTypes (e.g., xlsx strongly suggests excel)
    const boosted = this.applyDocTypeBoost(scored, input.docTypesInScope || []);

    // 5) If hint exists but low/medium confidence, blend it into candidates
    const finalCandidates = this.mergeHintCandidate(
      boosted,
      hintValid ? hintDomain! : "",
      hintConfidence,
    );

    // 6) Pick top candidate; handle strict/fallback behavior
    finalCandidates.sort((a, b) => b.score - a.score);

    let chosen = finalCandidates[0]?.domainId || defaultDomain;
    let conf = this.scoreToConfidence(finalCandidates[0]?.score ?? 0);

    if (!this.isValidDomain(chosen)) {
      reasons.push("candidate_not_in_ontology");
      chosen = defaultDomain;
      conf = Math.max(conf, 0.55);
    }

    // 7) If nothing strong, prefer active domain on followups (soft continuity)
    const active = this.normalizeDomainId(
      input.state?.activeDomain?.value || "",
    );
    if (active && this.isValidDomain(active)) {
      const topScore = finalCandidates[0]?.score ?? 0;
      // If top is weak, reuse active for continuity
      if (topScore < 0.2 && conf < 0.6) {
        reasons.push("reused_active_domain_low_signal");
        chosen = active;
        conf = Math.max(conf, 0.6);
      }
    }

    // 8) Enforce minConfidenceToEmit policy (but always return something)
    const minEmit = this.detection?.config?.minConfidenceToEmit ?? 0.55;
    if (conf < minEmit) {
      reasons.push("below_min_confidence_using_general");
      chosen = defaultDomain;
      conf = Math.max(conf, minEmit);
    }

    // 9) Build final decision with profiles and related domains
    const decision = this.decorateDecision(chosen, conf, reasons, {
      defaultDomain,
      usedHint: !!hintValid,
      usedDetection: detectionEnabled,
      strictDomainIds: strict,
    });

    // candidates list (top 3)
    decision.candidates = finalCandidates
      .slice(0, 3)
      .map((c) => ({
        domainId: c.domainId,
        confidence: this.scoreToConfidence(c.score),
      }))
      .filter((c) => this.isValidDomain(c.domainId));

    return decision;
  }

  // -----------------------------
  // Internals
  // -----------------------------

  private normalizeDomainId(raw: string): string | undefined {
    const id = (raw || "").trim();
    if (!id) return undefined;

    // normalize common separators and case
    const normalized = id
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_")
      .replace(/[^\w]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    // apply alias mapping if bank exists
    const aliasTo = this.aliases?.aliases?.find(
      (a) => a.from === normalized,
    )?.to;
    return aliasTo || normalized;
  }

  private isValidDomain(domainId: string): boolean {
    if (!this.ontology) return false;
    return (this.ontology.domainIds || []).includes(domainId);
  }

  private getDomainConfig(domainId: string) {
    return (this.ontology?.domains || []).find((d) => d.id === domainId);
  }

  private scoreByDetection(q: string, title: string, snippets: string[]) {
    const det = this.detection!;
    const wStrong = det.config.strongMatchWeight ?? 0.16;
    const wMed = det.config.mediumMatchWeight ?? 0.09;
    const wWeak = det.config.weakMatchWeight ?? 0.05;
    const titleBoost = det.config.titleBoost ?? 0.08;
    const snippetBoost = det.config.docTextBoost ?? 0.06;

    const scored: Array<{ domainId: string; score: number; matches: number }> =
      [];

    for (const domain of det.domains || []) {
      // skip unknown domains if ontology is strict
      if (
        this.ontology?.config?.strictDomainIds &&
        !this.isValidDomain(domain.id)
      )
        continue;

      const compiled = this.compiled[domain.id] || {
        strong: [],
        medium: [],
        weak: [],
      };

      let score = 0;
      let matches = 0;

      // Query matches (highest weight)
      for (const r of compiled.strong)
        if (r.test(q)) {
          score += wStrong;
          matches++;
        }
      for (const r of compiled.medium)
        if (r.test(q)) {
          score += wMed;
          matches++;
        }
      for (const r of compiled.weak)
        if (r.test(q)) {
          score += wWeak;
          matches++;
        }

      // Title matches (boosted)
      if (title) {
        for (const r of compiled.strong)
          if (r.test(title)) {
            score += wStrong + titleBoost;
            matches++;
          }
        for (const r of compiled.medium)
          if (r.test(title)) {
            score += wMed + titleBoost;
            matches++;
          }
        for (const r of compiled.weak)
          if (r.test(title)) {
            score += wWeak + titleBoost;
            matches++;
          }
      }

      // Snippet matches (small boost)
      for (const s of snippets) {
        if (!s) continue;
        let localHit = false;
        for (const r of compiled.strong)
          if (r.test(s)) {
            score += wStrong + snippetBoost;
            matches++;
            localHit = true;
          }
        for (const r of compiled.medium)
          if (r.test(s)) {
            score += wMed + snippetBoost;
            matches++;
            localHit = true;
          }
        for (const r of compiled.weak)
          if (r.test(s)) {
            score += wWeak + snippetBoost;
            matches++;
            localHit = true;
          }
        // avoid runaway scoring from many snippets with same pattern
        if (localHit) break;
      }

      score = Math.min(score, this.detection!.config.capMaxConfidence ?? 0.98);

      if (score > 0) scored.push({ domainId: domain.id, score, matches });
    }

    return scored;
  }

  private applyDocTypeBoost(
    scored: Array<{ domainId: string; score: number; matches: number }>,
    docTypes: string[],
  ) {
    const types = (docTypes || []).map((t) => (t || "").toLowerCase());
    if (types.length === 0) return scored;

    const out = scored.map((s) => ({ ...s }));

    // helper to add or create
    const bump = (domainId: string, delta: number) => {
      const found = out.find((o) => o.domainId === domainId);
      if (found) found.score += delta;
      else out.push({ domainId, score: delta, matches: 0 });
    };

    // Simple, safe boosts (never override strong textual detection)
    if (
      types.includes("xlsx") ||
      types.includes("xls") ||
      types.includes("csv")
    ) {
      bump("excel", 0.12);
      bump("accounting", 0.06);
      bump("finance", 0.06);
    }

    if (types.includes("pdf") || types.includes("docx")) {
      bump("legal", 0.04);
      bump("medical", 0.04);
      bump("invoices_billing", 0.04);
    }

    if (
      types.includes("jpg") ||
      types.includes("jpeg") ||
      types.includes("png")
    ) {
      bump("personal_docs", 0.06);
      bump("medical", 0.06);
      bump("invoices_billing", 0.06);
    }

    // clamp to cap
    const cap = this.detection?.config?.capMaxConfidence ?? 0.98;
    for (const c of out) c.score = Math.min(c.score, cap);

    return out;
  }

  private mergeHintCandidate(
    scored: Array<{ domainId: string; score: number; matches: number }>,
    hintDomain: string,
    hintConfidence: number,
  ) {
    if (!hintDomain || !this.isValidDomain(hintDomain)) return scored;
    if (hintConfidence <= 0) return scored;

    // Blend as a small prior (does not dominate unless already close)
    const prior = 0.08 + 0.12 * clamp01(hintConfidence); // 0.08–0.20
    const out = scored.map((s) => ({ ...s }));
    const found = out.find((s) => s.domainId === hintDomain);
    if (found)
      found.score = Math.min(
        found.score + prior,
        this.detection?.config?.capMaxConfidence ?? 0.98,
      );
    else out.push({ domainId: hintDomain, score: prior, matches: 0 });
    return out;
  }

  private scoreToConfidence(score: number): number {
    // score already capped; map to [0.55..0.98] with a soft curve
    const s = Math.max(0, Math.min(0.98, score));
    if (s <= 0) return 0.55;
    // mild non-linear scaling so small scores don't look too confident
    const conf = 0.55 + 0.43 * Math.pow(s / 0.98, 0.85);
    return Math.min(0.98, Math.max(0.55, conf));
  }

  private decorateDecision(
    domainId: string,
    confidence: number,
    reasons: string[],
    dbg: {
      defaultDomain: string;
      usedHint: boolean;
      usedDetection: boolean;
      strictDomainIds: boolean;
    },
  ): DomainDecision {
    const d = this.getDomainConfig(domainId);

    const retrievalProfile = d?.retrievalProfile || "balanced";
    const formattingProfile = d?.formattingProfile || "default";
    const terminologyKey = d?.terminologyKey || domainId || "general";

    // related domains
    let related: string[] = [];
    if (d?.relatedDomains?.length) {
      related = d.relatedDomains.filter((x) => this.isValidDomain(x));
    } else {
      // fallback: heuristic based on known "clusters" if not provided
      related = this.heuristicRelatedDomains(domainId);
    }

    const maxRel = this.ontology?.config?.maxRelatedDomains ?? 4;
    related = related.slice(0, maxRel);

    return {
      domainId,
      confidence: clamp01(confidence),
      candidates: [{ domainId, confidence: clamp01(confidence) }],
      relatedDomains: related,
      retrievalProfile,
      formattingProfile,
      terminologyKey,
      reasons: uniq(reasons),
      debug: {
        usedHint: dbg.usedHint,
        usedDetection: dbg.usedDetection,
        strictDomainIds: dbg.strictDomainIds,
        defaultDomain: dbg.defaultDomain,
      },
    };
  }

  private heuristicRelatedDomains(domainId: string): string[] {
    const map: Record<string, string[]> = {
      finance: [
        "accounting",
        "excel",
        "invoices_billing",
        "real_estate_hospitality",
      ],
      accounting: ["finance", "excel", "invoices_billing"],
      excel: ["finance", "accounting"],
      legal: ["personal_docs", "invoices_billing"],
      medical: ["insurance", "personal_docs"],
      personal_docs: [
        "identity_personal",
        "banking_statements",
        "invoices_billing",
      ],
      invoices_billing: ["finance", "accounting", "banking_statements"],
      banking_statements: ["credit_cards", "finance", "personal_docs"],
      credit_cards: ["banking_statements", "personal_docs"],
      insurance: ["medical", "personal_docs", "housing_property"],
      housing_property: ["personal_docs", "insurance", "invoices_billing"],
      real_estate_hospitality: ["finance", "excel", "accounting"],
      general: ["finance", "legal", "excel"],
    };

    const list = map[domainId] || ["general"];
    return list.filter((x) => this.isValidDomain(x));
  }
}

// Singleton
let _domainEnforcer: DomainEnforcementService | null = null;

export function getDomainEnforcement(): DomainEnforcementService {
  if (!_domainEnforcer) _domainEnforcer = new DomainEnforcementService();
  return _domainEnforcer;
}
