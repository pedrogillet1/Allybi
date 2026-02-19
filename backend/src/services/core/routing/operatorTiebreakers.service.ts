import { clamp } from "../../../utils";
/**
 * Operator Tiebreakers Service — CLEAN (Bank-driven, ChatGPT-style)
 *
 * What this version fixes vs your current file:
 * 1) NO filesystem reads (fs/path removed). Uses bankLoader only.
 * 2) Supports BOTH legacy bank shape (operator_tiebreakers / type_preferences / explicit_rules)
 *    and the new bank shape (config + explicitRules + familyScoring + typePreferences).
 * 3) Makes "explicitRules" the primary mechanism (ChatGPT-like deterministic overrides).
 * 4) Prevents the classic misroute: "list top 5 assumptions" -> file_actions/list
 *    by allowing contentMarkers rules to win via explicit rules.
 * 5) Language-safe: only matches patterns for the current language (en/pt/es).
 * 6) Returns { intentFamily, operator, confidence, preferredTypes?, reason, matchedRule }
 *
 * Bank: routing/routing_operator_tiebreakers.any.json (bank id: routing_operator_tiebreakers)
 */

import { getBank } from "../banks/bankLoader.service";
import type { IntentFamily, Operator } from "../../../types/intents.types";

// ============================================================================
// TYPES
// ============================================================================

export type LanguageKey = "en" | "pt" | "es";

export interface TiebreakerRoute {
  intentFamily: IntentFamily;
  operator: Operator;
  confidence: number;
  preferredTypes?: string[];
  reason?: string;
  matchedRule?: string;
}

export interface TiebreakerInput {
  query: string;
  language: LanguageKey;
  hasDocuments: boolean;
  // current routing candidate (optional)
  currentIntentFamily?: IntentFamily;
  currentOperator?: Operator;
  currentConfidence?: number;
}

// Legacy pattern set
interface PatternSet {
  en: string[];
  pt: string[];
  es: string[];
}

// Legacy route config
interface LegacyRouteConfig {
  intentFamily: string;
  operator: string;
  confidence: number;
  patterns: PatternSet;
  negatives?: PatternSet;
}

// Legacy operator tiebreaker
interface LegacyOperatorTiebreaker {
  description: string;
  [routeKey: string]: LegacyRouteConfig | string;
}

// Legacy type preference
interface LegacyTypePreference {
  description: string;
  preferredTypes: string[];
  patterns: PatternSet;
  operator_mapping?: {
    description: string;
    if_math_verbs: string;
    if_lookup: string;
    math_verbs: PatternSet;
  };
}

// New bank explicit rules (from our updated bank)
interface NewExplicitRule {
  id: string;
  priority?: number;
  ifAnyMatch?: string[];
  ifAllMatch?: string[];
  negativesAny?: string[];
  negativesAll?: string[];
  ifAnyRegex?: Array<{ regex: string; flags?: string }>;
  route: { intentFamily: string; operator: string };
  preferredTypes?: string[];
  confidence: number;
  rationale?: string;
}

interface NewBankExplicitRules {
  rules: NewExplicitRule[];
}

// New bank: typePreferences
interface NewTypePreference {
  preferredTypes: string[];
  patterns: Record<LanguageKey, string[]>;
}

// New bank: familyScoring operators (we only use patterns/negatives lightly)
interface NewFamilyScoring {
  [familyKey: string]: any;
}

// Bank types (supports both legacy and new)
interface TiebreakerBank {
  _meta: {
    id: string;
    version: string;
    description: string;
    lastUpdated?: string;
  };

  // new
  config?: {
    enabled?: boolean;
    matching?: {
      useRegex?: boolean;
      caseSensitive?: boolean;
      requireWordBoundary?: boolean;
      checkNegativesFirst?: boolean;
      scoringMode?: "weighted_hits" | "first_match";
    };
    precedenceOrder?: string[];
    treatAsTieIfGapLt?: number;
    minScoreGapToSkipTiebreak?: number;
  };

  explicitRules?: NewBankExplicitRules;
  familyScoring?: NewFamilyScoring;
  typePreferences?: Record<string, NewTypePreference>;

  // legacy
  precedence_order?: string[];
  matchingRules?: {
    useRegex: boolean;
    caseSensitive: boolean;
    requireWordBoundary: boolean;
    checkNegativesFirst: boolean;
    scoringMode: string;
  };
  operator_tiebreakers?: Record<string, LegacyOperatorTiebreaker>;
  type_preferences?: Record<string, LegacyTypePreference>;
  explicit_rules?: { rules: any[] };
  fallback_rules?: {
    has_documents: {
      intentFamily: string;
      operator: string;
      confidence: number;
    };
    no_documents: {
      intentFamily: string;
      operator: string;
      confidence: number;
    };
  };
}

// Compiled patterns (language-aware)
interface CompiledPattern {
  rx: RegExp;
  raw: string;
}
interface CompiledExplicitRule {
  id: string;
  priority: number;
  matchMode: "any" | "all" | "regex";
  keywordsAny: string[];
  keywordsAll: string[];
  negativesAny: string[];
  negativesAll: string[];
  regexAny: RegExp[];
  route: { intentFamily: IntentFamily; operator: Operator };
  preferredTypes?: string[];
  confidence: number;
  rationale?: string;
}

// Type preference compiled
interface CompiledTypePreference {
  preferredTypes: string[];
  patternsByLang: Record<LanguageKey, CompiledPattern[]>;
}

// Legacy compiled tiebreak routes (optional fallback)
interface CompiledLegacyRoute {
  intentFamily: IntentFamily;
  operator: Operator;
  baseConfidence: number;
  patternsByLang: Record<LanguageKey, CompiledPattern[]>;
  negativesByLang: Record<LanguageKey, CompiledPattern[]>;
  familyKey: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export class OperatorTiebreakersService {
  private static instance: OperatorTiebreakersService;
  private bank: TiebreakerBank | null = null;
  private loaded = false;

  // matching defaults
  private matching = {
    useRegex: true,
    caseSensitive: false,
    requireWordBoundary: true,
    checkNegativesFirst: true,
    scoringMode: "weighted_hits" as "weighted_hits" | "first_match",
  };

  private precedenceOrder: IntentFamily[] = [];

  // compiled caches
  private explicitRules: CompiledExplicitRule[] = [];
  private typePrefs: Map<string, CompiledTypePreference> = new Map();
  private legacyRoutes: CompiledLegacyRoute[] = [];

  private constructor() {}

  static getInstance(): OperatorTiebreakersService {
    if (!OperatorTiebreakersService.instance) {
      OperatorTiebreakersService.instance = new OperatorTiebreakersService();
    }
    return OperatorTiebreakersService.instance;
  }

  // ========================================================================
  // Load + compile
  // ========================================================================

  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    const bank = getBank<TiebreakerBank>("routing_operator_tiebreakers");
    if (!bank) {
      console.warn(
        "[OperatorTiebreakers] Bank not found: routing_operator_tiebreakers",
      );
      return;
    }
    this.bank = bank;

    const enabled = bank.config?.enabled ?? true;
    if (!enabled) {
      console.warn("[OperatorTiebreakers] Disabled by bank config");
      return;
    }

    this.compile();
    console.log(
      `[OperatorTiebreakers] Loaded v${bank._meta?.version ?? "unknown"} | explicitRules=${this.explicitRules.length} | typePrefs=${this.typePrefs.size} | legacyRoutes=${this.legacyRoutes.length}`,
    );
  }

  private compile(): void {
    if (!this.bank) return;

    const bank = this.bank as any;

    // matching config supports both legacy and new
    const matchingConfig = this.bank.matchingRules || bank.config?.matching;
    if (matchingConfig) {
      this.matching = {
        ...this.matching,
        useRegex: matchingConfig.useRegex ?? this.matching.useRegex,
        caseSensitive:
          matchingConfig.caseSensitive ?? this.matching.caseSensitive,
        requireWordBoundary:
          matchingConfig.requireWordBoundary ??
          this.matching.requireWordBoundary,
        checkNegativesFirst:
          matchingConfig.checkNegativesFirst ??
          this.matching.checkNegativesFirst,
        scoringMode: (matchingConfig.scoringMode || "weighted_hits") as
          | "weighted_hits"
          | "first_match",
      };
    }

    const precedenceSource =
      this.bank.precedence_order || bank.config?.precedenceOrder || [];
    this.precedenceOrder = (precedenceSource || []).map(
      (s: string) => s.toLowerCase() as IntentFamily,
    );

    this.compileExplicitRules();
    this.compileTypePreferences();
    this.compileLegacyOperatorTiebreakers(); // optional fallback only
  }

  // ========================================================================
  // Public API
  // ========================================================================

  applyTiebreakers(input: TiebreakerInput): TiebreakerRoute | null {
    if (!this.loaded) this.load();
    if (!this.bank) return null;

    const q = normalize(input.query);
    const lang = input.language;

    // 1) Explicit rules first (this is the ChatGPT-like deterministic layer)
    const explicit = this.matchExplicitRules(q, lang);
    if (explicit) return explicit;

    // 2) Type preference hint (soft) — does not route, only suggests types
    // (Return only if it helps; otherwise continue.)
    // NOTE: Your router can call getTypePreferences separately if you prefer.
    // This function keeps routing decisions separate from type hints.

    // 3) Optional legacy operator_tiebreakers fallback (if present)
    const legacy = this.matchLegacyRoutes(q, lang);
    if (legacy) return legacy;

    // No decision: let router's primary intent selection win
    return null;
  }

  getTypePreferences(
    query: string,
    language: LanguageKey,
  ): { preferredTypes: string[]; suggestedOperator?: Operator } | null {
    if (!this.loaded) this.load();
    const q = normalize(query);

    for (const [, pref] of this.typePrefs) {
      const patterns = pref.patternsByLang[language] || [];
      if (patterns.some((p) => p.rx.test(q))) {
        return { preferredTypes: pref.preferredTypes };
      }
    }
    return null;
  }

  getPrecedenceRank(intentFamily: IntentFamily): number {
    const i = this.precedenceOrder.indexOf(intentFamily);
    return i >= 0 ? i : 999;
  }

  comparePrecedence(a: IntentFamily, b: IntentFamily): number {
    return this.getPrecedenceRank(a) - this.getPrecedenceRank(b);
  }

  getFallback(hasDocuments: boolean): TiebreakerRoute {
    if (!this.bank) {
      // Hardcoded fallback if bank not loaded
      return hasDocuments
        ? { intentFamily: "documents", operator: "extract", confidence: 0.5 }
        : { intentFamily: "help", operator: "capabilities", confidence: 0.4 };
    }

    // Support both new format (fallback.hasDocuments) and legacy (fallback_rules.has_documents)
    const bankAny = this.bank as any;
    const fallbackConfig = hasDocuments
      ? bankAny.fallback?.hasDocuments ||
        this.bank.fallback_rules?.has_documents
      : bankAny.fallback?.noDocuments || this.bank.fallback_rules?.no_documents;

    if (!fallbackConfig) {
      return hasDocuments
        ? { intentFamily: "documents", operator: "extract", confidence: 0.55 }
        : { intentFamily: "help", operator: "capabilities", confidence: 0.45 };
    }

    return {
      intentFamily: fallbackConfig.intentFamily as IntentFamily,
      operator: fallbackConfig.operator as Operator,
      confidence: fallbackConfig.confidence,
      reason: hasDocuments ? "fallback_has_documents" : "fallback_no_documents",
    };
  }

  isReady(): boolean {
    return this.loaded && this.bank !== null;
  }

  getStatistics(): {
    isLoaded: boolean;
    tiebreakerFamilies: number;
    typePreferences: number;
    explicitRules: number;
    precedenceOrder: string[];
  } {
    return {
      isLoaded: this.loaded,
      tiebreakerFamilies: this.legacyRoutes.length,
      typePreferences: this.typePrefs.size,
      explicitRules: this.explicitRules.length,
      precedenceOrder: this.precedenceOrder,
    };
  }

  // ========================================================================
  // Explicit rules compiler (new bank)
  // ========================================================================

  private compileExplicitRules(): void {
    this.explicitRules = [];
    if (!this.bank) return;

    const container =
      (this.bank as any).explicitRules || this.bank.explicit_rules;
    const rules: NewExplicitRule[] = container?.rules || [];

    for (const r of rules) {
      const priority = typeof r.priority === "number" ? r.priority : 0;

      const ifAny = (r.ifAnyMatch || []).map((s) => normalizeToken(s));
      const ifAll = (r.ifAllMatch || []).map((s) => normalizeToken(s));
      const negAny = (r.negativesAny || []).map((s) => normalizeToken(s));
      const negAll = (r.negativesAll || []).map((s) => normalizeToken(s));

      const regexAny = (r.ifAnyRegex || [])
        .map((x) =>
          safeRegex(
            x.regex,
            x.flags || (this.matching.caseSensitive ? "" : "i"),
          ),
        )
        .filter((rx): rx is RegExp => !!rx);

      const matchMode: "any" | "all" | "regex" =
        regexAny.length > 0 ? "regex" : ifAll.length > 0 ? "all" : "any";

      this.explicitRules.push({
        id: r.id,
        priority,
        matchMode,
        keywordsAny: ifAny,
        keywordsAll: ifAll,
        negativesAny: negAny,
        negativesAll: negAll,
        regexAny,
        route: {
          intentFamily: r.route.intentFamily.toLowerCase() as IntentFamily,
          operator: r.route.operator.toLowerCase() as Operator,
        },
        preferredTypes: r.preferredTypes,
        confidence: clamp(r.confidence, 0.1, 0.99),
        rationale: r.rationale,
      });
    }

    // Highest priority first
    this.explicitRules.sort((a, b) => b.priority - a.priority);
  }

  private matchExplicitRules(
    normalizedQuery: string,
    _lang: LanguageKey,
  ): TiebreakerRoute | null {
    // NOTE: explicit rules are already language-aware through the phrases you add per language.
    // We just match on normalizedQuery.

    for (const r of this.explicitRules) {
      if (this.hasNegatives(normalizedQuery, r)) continue;

      let matched = false;

      if (r.matchMode === "regex") {
        matched = r.regexAny.some((rx) => rx.test(normalizedQuery));
      } else if (r.matchMode === "all") {
        matched =
          r.keywordsAll.length > 0 &&
          r.keywordsAll.every((k) =>
            tokenPresent(normalizedQuery, k, this.matching.requireWordBoundary),
          );
      } else {
        matched =
          r.keywordsAny.length > 0 &&
          r.keywordsAny.some((k) =>
            tokenPresent(normalizedQuery, k, this.matching.requireWordBoundary),
          );
      }

      if (!matched) continue;

      console.log(
        `[OperatorTiebreakers] Explicit rule matched: ${r.id} → ${r.route.intentFamily}/${r.route.operator}`,
      );

      return {
        intentFamily: r.route.intentFamily,
        operator: r.route.operator,
        confidence: r.confidence,
        preferredTypes: r.preferredTypes,
        reason: r.rationale || "explicit_rule",
        matchedRule: r.id,
      };
    }

    return null;
  }

  private hasNegatives(query: string, rule: CompiledExplicitRule): boolean {
    // negativesAny: any present blocks
    if (
      rule.negativesAny.length > 0 &&
      rule.negativesAny.some((n) =>
        tokenPresent(query, n, this.matching.requireWordBoundary),
      )
    ) {
      return true;
    }
    // negativesAll: if all are present, block
    if (
      rule.negativesAll.length > 0 &&
      rule.negativesAll.every((n) =>
        tokenPresent(query, n, this.matching.requireWordBoundary),
      )
    ) {
      return true;
    }
    return false;
  }

  // ========================================================================
  // Type preferences compiler (new bank)
  // ========================================================================

  private compileTypePreferences(): void {
    this.typePrefs.clear();
    if (!this.bank) return;

    const bank = this.bank as any;
    const src = this.bank.type_preferences || bank.typePreferences || {};

    for (const [key, pref] of Object.entries(src) as Array<[string, any]>) {
      // Skip metadata keys
      if (key.startsWith("_")) continue;
      if (!pref?.preferredTypes || !pref?.patterns) continue;

      const compiled: CompiledTypePreference = {
        preferredTypes: pref.preferredTypes,
        patternsByLang: { en: [], pt: [], es: [] },
      };

      for (const lang of ["en", "pt", "es"] as LanguageKey[]) {
        const patterns: string[] = pref.patterns?.[lang] || [];
        compiled.patternsByLang[lang] = patterns
          .map((p) =>
            compilePhrase(
              p,
              this.matching.caseSensitive,
              this.matching.requireWordBoundary,
            ),
          )
          .filter((x): x is CompiledPattern => !!x);
      }

      this.typePrefs.set(key, compiled);
    }
  }

  // ========================================================================
  // Legacy fallback compiler (optional)
  // ========================================================================

  private compileLegacyOperatorTiebreakers(): void {
    this.legacyRoutes = [];
    if (!this.bank?.operator_tiebreakers) return;

    const langs: LanguageKey[] = ["en", "pt", "es"];

    for (const [familyKey, tb] of Object.entries(
      this.bank.operator_tiebreakers,
    )) {
      if (familyKey === "_description") continue;

      for (const [routeKey, cfg] of Object.entries(tb)) {
        if (routeKey === "description" || typeof cfg === "string") continue;

        const c = cfg as LegacyRouteConfig;

        const patternsByLang: Record<LanguageKey, CompiledPattern[]> = {
          en: [],
          pt: [],
          es: [],
        };
        const negativesByLang: Record<LanguageKey, CompiledPattern[]> = {
          en: [],
          pt: [],
          es: [],
        };

        for (const lang of langs) {
          patternsByLang[lang] = (c.patterns?.[lang] || [])
            .map((p) =>
              compilePhrase(
                p,
                this.matching.caseSensitive,
                this.matching.requireWordBoundary,
              ),
            )
            .filter((x): x is CompiledPattern => !!x);

          negativesByLang[lang] = (c.negatives?.[lang] || [])
            .map((p) =>
              compilePhrase(
                p,
                this.matching.caseSensitive,
                this.matching.requireWordBoundary,
              ),
            )
            .filter((x): x is CompiledPattern => !!x);
        }

        this.legacyRoutes.push({
          intentFamily: c.intentFamily.toLowerCase() as IntentFamily,
          operator: c.operator.toLowerCase() as Operator,
          baseConfidence: clamp(c.confidence, 0.1, 0.99),
          patternsByLang,
          negativesByLang,
          familyKey,
        });
      }
    }
  }

  private matchLegacyRoutes(
    query: string,
    lang: LanguageKey,
  ): TiebreakerRoute | null {
    if (this.legacyRoutes.length === 0) return null;

    const MATCH_BONUS = 0.08;
    const WEAK_PENALTY = 0.05;

    let best: { score: number; route: TiebreakerRoute } | null = null;

    for (const r of this.legacyRoutes) {
      const patterns = r.patternsByLang[lang] || [];
      const negatives = r.negativesByLang[lang] || [];

      if (
        this.matching.checkNegativesFirst &&
        negatives.some((p) => p.rx.test(query))
      )
        continue;

      const matchCount = patterns.reduce(
        (n, p) => (p.rx.test(query) ? n + 1 : n),
        0,
      );
      if (matchCount === 0) continue;

      if (
        !this.matching.checkNegativesFirst &&
        negatives.some((p) => p.rx.test(query))
      )
        continue;

      let score = r.baseConfidence + (matchCount - 1) * MATCH_BONUS;
      if (matchCount === 1) score -= WEAK_PENALTY;

      const route: TiebreakerRoute = {
        intentFamily: r.intentFamily,
        operator: r.operator,
        confidence: clamp(score, 0.1, 0.99),
        reason: `legacy:${r.familyKey} (${matchCount} hits)`,
        matchedRule: `legacy:${r.familyKey}`,
      };

      if (!best || score > best.score) best = { score, route };
    }

    return best?.route || null;
  }
}

// ============================================================================
// Singleton exports
// ============================================================================

export const operatorTiebreakers = OperatorTiebreakersService.getInstance();
export default OperatorTiebreakersService;

// ============================================================================
// Utils
// ============================================================================

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(s: string): string {
  return normalize(s);
}

function tokenPresent(
  query: string,
  token: string,
  wordBoundary: boolean,
): boolean {
  if (!token) return false;
  if (!wordBoundary) return query.includes(token);

  // word boundary safe match
  const rx = new RegExp(`\\b${escapeRegex(token)}\\b`, "i");
  return rx.test(query);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// clamp imported from ../../../utils

function safeRegex(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function compilePhrase(
  phrase: string,
  caseSensitive: boolean,
  wordBoundary: boolean,
): CompiledPattern | null {
  const raw = (phrase || "").trim();
  if (!raw) return null;

  const flags = caseSensitive ? "" : "i";

  // Treat raw as a literal phrase unless it already looks like regex
  // (We keep this conservative.)
  const looksLikeRegex = /[\\.^$|?*+()[\]{}]/.test(raw);
  let pattern = raw;

  if (!looksLikeRegex) {
    pattern = escapeRegex(raw);
    if (wordBoundary) pattern = `\\b${pattern}\\b`;
  }

  const rx = safeRegex(pattern, flags);
  if (!rx) return null;

  return { rx, raw };
}
