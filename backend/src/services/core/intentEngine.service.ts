// src/services/core/kodaIntentEngineV3.service.ts
//
// KODA INTENT ENGINE V3 (CLEAN + MAX DETAIL, DATA-BANK DRIVEN)
//
// Purpose (ChatGPT-like):
// - Decide "what the user is trying to do" (intentFamily + operator) with high reliability.
// - Extract "signals" (quote/table/short/nav/discovery/etc.) and "constraints" (outputShape, exactBulletCount, maxSentences).
// - Prevent operator hijacking (conversation vs file actions vs doc Q&A).
// - Stay deterministic + explainable, but NOT hardcoded:
//   All patterns, priorities, families, negatives, triggers come from data_banks.
//
// Inputs:
// - text (already lightly normalized by queryNormalizer)
// - languageHint (optional)
// - state (optional) for followup detection/upweighting (light use; scope engine owns most state)
//
// Output:
// - { intentFamily, operator, confidence, signals, constraints }
//
// Data banks used:
// routing/intent_patterns.any.json
// routing/intent_config.any.json
// routing/operator_priority.any.json
// operators/operator_contracts.any.json
// operators/operator_output_shapes.any.json
// operators/operator_families.any.json
// operators/operator_aliases.any.json
// operators/operator_negatives.any.json
// triggers/intent_triggers.any.json
// triggers/operator_triggers.any.json
// triggers/format_triggers.any.json
// triggers/nav_triggers.any.json
// triggers/domain_triggers.any.json
// triggers/language_triggers.any.json
// normalizers/language_indicators.any.json (optional helper)
//
// NOTE: This file is long-ish because it’s the "brainstem" for routing,
// but it still stays centralized and readable. Everything else goes in banks.

import { getBank } from "./bankLoader.service";

// -----------------------------
// Types
// -----------------------------
export type LanguageCode = "en" | "pt" | "es";
export type IntentFamily = "documents" | "file_actions" | "help" | "conversation" | "doc_stats" | "error";

export type OutputShape = "paragraph" | "bullets" | "numbered_list" | "table" | "file_list" | "button_only";

export interface ConversationState {
  activeDocRef?: { docId?: string; filename?: string; lockType?: "hard" | "soft" };
}

export interface IntentResult {
  intentFamily: IntentFamily;
  operator: string;
  confidence: number;

  signals: Record<string, any>;
  constraints: {
    outputShape?: OutputShape;
    exactBulletCount?: number;
    maxSentences?: number;
    requireTable?: boolean;
    requireSourceButtons?: boolean;
    userRequestedShort?: boolean;
  };
}

export interface IntentEngineInput {
  text: string;
  languageHint?: LanguageCode;
  state?: ConversationState;
}

// -----------------------------
// Bank shapes (minimal contracts)
// -----------------------------

type RegexByLang = Partial<Record<LanguageCode, string[]>> & { any?: string[] };

interface TriggerRule {
  id: string;
  weight?: number; // boost
  patterns: RegexByLang;
  setSignals?: Record<string, any>;
  setConstraints?: Partial<IntentResult["constraints"]>;
  forceIntentFamily?: IntentFamily;
  forceOperator?: string;
}

interface TriggersBank {
  _meta: any;
  config?: { enabled?: boolean; caseInsensitive?: boolean; stripDiacritics?: boolean };
  rules: TriggerRule[];
}

interface OperatorAliasesBank {
  _meta: any;
  aliases: Array<{
    operator: string;
    patterns: RegexByLang;
    weight?: number;
  }>;
}

interface OperatorFamiliesBank {
  _meta: any;
  families: Array<{
    id: string; // e.g. documents/file_actions/help/conversation
    operators: string[];
    description?: string;
  }>;
}

interface OperatorPriorityBank {
  _meta: any;
  defaults?: { baseBoost?: number; minConfidence?: number };
  priority: Array<{
    operator: string;
    baseBoost?: number;
    // optional: operator-specific environment gating, domains, etc.
  }>;
}

interface OperatorOutputShapesBank {
  _meta: any;
  operators: Record<string, { defaultShape: OutputShape; allowShapes?: OutputShape[]; navPills?: boolean }>;
}

interface OperatorContractsBank {
  _meta: any;
  operators: Record<
    string,
    {
      description?: string;
      requiresDocs?: boolean;
      produces?: {
        // "button_only" is UI behavior; still treated as OutputShape constraint
        outputShape?: OutputShape;
        requireSourceButtons?: boolean;
      };
      allowedSignals?: string[];
      disallowSignals?: string[];
    }
  >;
}

interface IntentPatternsBank {
  _meta: any;
  config?: {
    enabled?: boolean;
    caseInsensitive?: boolean;
    stripDiacritics?: boolean;
    collapseWhitespace?: boolean;
    // scoring knobs
    baseMatchWeight?: number;
    strongMatchWeight?: number;
    mediumMatchWeight?: number;
    weakMatchWeight?: number;
  };
  patterns: Array<{
    id: string;
    intentFamily: IntentFamily;
    operator: string;
    weight?: number;
    strong?: RegexByLang;
    medium?: RegexByLang;
    weak?: RegexByLang;
    setSignals?: Record<string, any>;
    setConstraints?: Partial<IntentResult["constraints"]>;
  }>;
}

interface IntentConfigBank {
  _meta: any;
  config: {
    enabled: boolean;
    thresholds: {
      minEmitConfidence: number; // e.g. 0.35
      conversationConfidenceFloor: number; // e.g. 0.55 for greetings
      forceClarifyBelow?: number;
    };
    defaults: {
      fallbackIntentFamily: IntentFamily;
      fallbackOperator: string;
      fallbackLanguage: LanguageCode;
    };
    safety: {
      // ensures we don’t route greetings into file actions etc.
      conversationShieldOperators?: string[];
      maxSignals?: number;
    };
  };
}

interface OperatorNegativesBank {
  _meta: any;
  config: {
    enabled: boolean;
    useRegex: boolean;
    caseInsensitive: boolean;
    stripDiacritics: boolean;
    collapseWhitespace: boolean;
    evaluationOrder: "before_priority_and_family" | "after_priority_and_family";
    defaultPenalty: number;
    hardBlockThreshold: number;
    allowMultipleMatches: boolean;
  };
  rules: Array<{
    id: string;
    scope: "global" | "cross_family" | "intra_family" | "operator_specific";
    description?: string;
    appliesToOperators: string[];
    triggerPatterns: RegexByLang;
    action:
      | { type: "confidence_penalty"; value: number; reasonCode?: string }
      | { type: "redirect_preference"; preferredOperator: string; confidencePenalty?: number; reasonCode?: string }
      | { type: "hard_block"; reasonCode?: string };
  }>;
  tests?: any;
}

interface LanguageIndicatorsBank {
  _meta: any;
  indicators: Record<LanguageCode, { strong: string[]; medium: string[]; weak: string[] }>;
}

// -----------------------------
// Utility: Normalization helpers
// -----------------------------
function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeText(input: string, opts: { stripDiacritics?: boolean; collapseWhitespace?: boolean; lower?: boolean }) {
  let t = input ?? "";
  if (opts.stripDiacritics) t = stripDiacritics(t);
  if (opts.collapseWhitespace) t = collapseWhitespace(t);
  if (opts.lower) t = t.toLowerCase();
  return t;
}

function compileRegex(pattern: string, flags: string) {
  // Safe compile; if invalid regex in bank, skip it (do not crash prod)
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function matchAny(patterns: string[] | undefined, text: string, flags: string): { matched: boolean; count: number; matches: string[] } {
  if (!patterns || patterns.length === 0) return { matched: false, count: 0, matches: [] };
  const matches: string[] = [];
  let count = 0;
  for (const p of patterns) {
    const rx = compileRegex(p, flags);
    if (!rx) continue;
    if (rx.test(text)) {
      count++;
      matches.push(p);
    }
  }
  return { matched: count > 0, count, matches };
}

function pickLangPatterns(rule: RegexByLang | undefined, lang: LanguageCode): string[] {
  if (!rule) return [];
  return [...(rule.any ?? []), ...(rule[lang] ?? [])];
}

// -----------------------------
// Intent Engine
// -----------------------------
export class KodaIntentEngineV3Service {
  private readonly intentConfig: IntentConfigBank;
  private readonly intentPatterns: IntentPatternsBank;

  private readonly intentTriggers?: TriggersBank;
  private readonly operatorTriggers?: TriggersBank;
  private readonly formatTriggers?: TriggersBank;
  private readonly navTriggers?: TriggersBank;
  private readonly domainTriggers?: TriggersBank;
  private readonly languageTriggers?: TriggersBank;

  private readonly operatorAliases: OperatorAliasesBank;
  private readonly operatorFamilies: OperatorFamiliesBank;
  private readonly operatorPriority: OperatorPriorityBank;
  private readonly operatorOutputShapes: OperatorOutputShapesBank;
  private readonly operatorContracts: OperatorContractsBank;
  private readonly operatorNegatives: OperatorNegativesBank;

  private readonly languageIndicators?: LanguageIndicatorsBank;

  constructor() {
    // Required
    this.intentConfig = getBank<IntentConfigBank>("intent_config")!;
    this.intentPatterns = getBank<IntentPatternsBank>("intent_patterns")!;
    this.operatorAliases = getBank<OperatorAliasesBank>("operator_aliases")!;
    this.operatorFamilies = getBank<OperatorFamiliesBank>("operator_families")!;
    this.operatorPriority = getBank<OperatorPriorityBank>("operator_priority")!;
    this.operatorOutputShapes = getBank<OperatorOutputShapesBank>("operator_output_shapes")!;
    this.operatorContracts = getBank<OperatorContractsBank>("operator_contracts")!;
    this.operatorNegatives = getBank<OperatorNegativesBank>("operator_negatives")!;

    // Optional
    this.intentTriggers = getBank<TriggersBank>("intent_triggers");
    this.operatorTriggers = getBank<TriggersBank>("operator_triggers");
    this.formatTriggers = getBank<TriggersBank>("format_triggers");
    this.navTriggers = getBank<TriggersBank>("nav_triggers");
    this.domainTriggers = getBank<TriggersBank>("domain_triggers");
    this.languageTriggers = getBank<TriggersBank>("language_triggers");
    this.languageIndicators = getBank<LanguageIndicatorsBank>("language_indicators");
  }

  async resolve(input: IntentEngineInput): Promise<IntentResult> {
    const cfg = this.intentConfig?.config;

    const fallback: IntentResult = {
      intentFamily: cfg.defaults.fallbackIntentFamily,
      operator: cfg.defaults.fallbackOperator,
      confidence: 0.01,
      signals: {},
      constraints: {},
    };

    if (!cfg?.enabled || !this.intentPatterns?._meta) return fallback;

    // 1) Determine language (hint > triggers > indicators > fallback)
    const language = this.detectLanguage(input.text, input.languageHint);

    // 2) Normalize for matching
    const bankCaseInsensitive = this.intentPatterns.config?.caseInsensitive ?? true;
    const bankStripDiacritics = this.intentPatterns.config?.stripDiacritics ?? true;
    const bankCollapse = this.intentPatterns.config?.collapseWhitespace ?? true;

    const normalized = normalizeText(input.text, {
      stripDiacritics: bankStripDiacritics,
      collapseWhitespace: bankCollapse,
      lower: bankCaseInsensitive,
    });

    // 3) Collect signals + hard overrides from triggers banks
    const triggerContext = this.runAllTriggers(normalized, language);

    // 4) Candidate operators from:
    //    - intent_patterns (strong/medium/weak matches)
    //    - operator_aliases (direct operator phrases)
    //    - operator_triggers (operator-specific)
    const candidates = this.buildOperatorCandidates(normalized, language, triggerContext);

    // 5) Apply negatives (hard blocks, penalties, operator redirects)
    const afterNegatives = this.applyNegatives(normalized, language, candidates);

    // 6) Apply operator priority boosts
    const afterPriority = this.applyOperatorPriority(afterNegatives);

    // 7) Determine best candidate (operator + family) w/ tie-breaking rules
    const chosen = this.chooseBest(afterPriority, triggerContext, input.state);

    // 8) Derive constraints from:
    //    - triggerContext constraints
    //    - intent_patterns constraints
    //    - operator_output_shapes defaults
    //    - operator_contracts (requiresDocs, requireSourceButtons)
    const constraints = this.deriveConstraints(chosen, triggerContext, normalized);

    // 9) Build final IntentResult
    const result: IntentResult = {
      intentFamily: chosen.intentFamily,
      operator: chosen.operator,
      confidence: clamp(chosen.confidence, 0, 0.99),
      signals: limitSignals({ ...triggerContext.signals, ...chosen.signals }, cfg.safety.maxSignals ?? 40),
      constraints,
    };

    // 10) Final safety: conversation shield (prevents greetings from going into open/list/etc.)
    return this.applyConversationShield(result, normalized, language);
  }

  // -----------------------------
  // Language detection
  // -----------------------------
  private detectLanguage(text: string, hint?: LanguageCode): LanguageCode {
    if (hint) return hint;

    // language_triggers bank (highest priority)
    if (this.languageTriggers?.config?.enabled !== false) {
      const picked = this.pickForcedLanguageFromTriggers(text);
      if (picked) return picked;
    }

    // lightweight indicators bank (next)
    if (this.languageIndicators?.indicators) {
      const t = normalizeText(text, { stripDiacritics: true, collapseWhitespace: true, lower: true });
      const words = t.split(/\s+/);
      const scores: Record<LanguageCode, number> = { en: 0, pt: 0, es: 0 };

      for (const lang of ["en", "pt", "es"] as LanguageCode[]) {
        const ind = this.languageIndicators.indicators[lang];
        for (const w of words) {
          if (ind.strong.includes(w)) scores[lang] += 3;
          else if (ind.medium.includes(w)) scores[lang] += 2;
          else if (ind.weak.includes(w)) scores[lang] += 1;
        }
      }

      const best = (Object.keys(scores) as LanguageCode[]).sort((a, b) => scores[b] - scores[a])[0];
      if (scores[best] >= 6) return best;
    }

    return this.intentConfig.config.defaults.fallbackLanguage ?? "en";
  }

  private pickForcedLanguageFromTriggers(text: string): LanguageCode | null {
    const lang = "en"; // just for selecting .any + .en patterns (we’ll inspect outputs)
    const flags = "gi";
    for (const r of this.languageTriggers!.rules ?? []) {
      const patterns = pickLangPatterns(r.patterns, lang as any);
      const m = matchAny(patterns, text, flags);
      if (!m.matched) continue;
      if (r.setSignals?.language && ["en", "pt", "es"].includes(r.setSignals.language)) {
        return r.setSignals.language as LanguageCode;
      }
    }
    return null;
  }

  // -----------------------------
  // Trigger processing
  // -----------------------------
  private runAllTriggers(text: string, lang: LanguageCode): { signals: Record<string, any>; constraints: Partial<IntentResult["constraints"]>; forced?: { intentFamily?: IntentFamily; operator?: string } } {
    const signals: Record<string, any> = {};
    const constraints: Partial<IntentResult["constraints"]> = {};
    const forced: any = {};

    const triggerBanks: Array<{ name: string; bank?: TriggersBank }> = [
      { name: "intent_triggers", bank: this.intentTriggers },
      { name: "operator_triggers", bank: this.operatorTriggers },
      { name: "format_triggers", bank: this.formatTriggers },
      { name: "nav_triggers", bank: this.navTriggers },
      { name: "domain_triggers", bank: this.domainTriggers },
    ];

    for (const { bank } of triggerBanks) {
      if (!bank || bank.config?.enabled === false) continue;
      const flags = bank.config?.caseInsensitive === false ? "g" : "gi";
      const t = normalizeText(text, {
        stripDiacritics: bank.config?.stripDiacritics ?? true,
        collapseWhitespace: true,
        lower: bank.config?.caseInsensitive ?? true,
      });

      for (const rule of bank.rules ?? []) {
        const patterns = pickLangPatterns(rule.patterns, lang);
        const m = matchAny(patterns, t, flags);
        if (!m.matched) continue;

        if (rule.setSignals) Object.assign(signals, rule.setSignals);
        if (rule.setConstraints) Object.assign(constraints, rule.setConstraints);

        if (rule.forceIntentFamily) forced.intentFamily = rule.forceIntentFamily;
        if (rule.forceOperator) forced.operator = rule.forceOperator;
      }
    }

    // Additional structural detection: bullet count / short overview extraction can be banked,
    // but we keep a minimal parser here as a “bridge” because user asks in many ways.
    // This does NOT create answers; it only sets constraints.
    const derived = deriveStructuralConstraints(text);
    Object.assign(signals, derived.signals);
    Object.assign(constraints, derived.constraints);

    return { signals, constraints, forced: Object.keys(forced).length ? forced : undefined };
  }

  // -----------------------------
  // Candidate building
  // -----------------------------
  private buildOperatorCandidates(
    text: string,
    lang: LanguageCode,
    triggerContext: { signals: any; constraints: any; forced?: { intentFamily?: IntentFamily; operator?: string } }
  ): Array<{
    operator: string;
    intentFamily: IntentFamily;
    confidence: number;
    reason: string[];
    signals: Record<string, any>;
    constraints: Partial<IntentResult["constraints"]>;
  }> {
    const flags = "gi";
    const candidates: Array<any> = [];

    // Forced operator from triggers (rare, but useful)
    if (triggerContext.forced?.operator && triggerContext.forced?.intentFamily) {
      candidates.push({
        operator: triggerContext.forced.operator,
        intentFamily: triggerContext.forced.intentFamily,
        confidence: 0.95,
        reason: ["forced_by_triggers"],
        signals: { ...triggerContext.signals },
        constraints: { ...triggerContext.constraints },
      });
      return candidates;
    }

    // A) intent_patterns bank (primary)
    const baseW = this.intentPatterns.config?.baseMatchWeight ?? 0.08;
    const strongW = this.intentPatterns.config?.strongMatchWeight ?? 0.16;
    const mediumW = this.intentPatterns.config?.mediumMatchWeight ?? 0.09;
    const weakW = this.intentPatterns.config?.weakMatchWeight ?? 0.05;

    for (const p of this.intentPatterns.patterns ?? []) {
      const strong = matchAny(pickLangPatterns(p.strong, lang), text, flags);
      const medium = matchAny(pickLangPatterns(p.medium, lang), text, flags);
      const weak = matchAny(pickLangPatterns(p.weak, lang), text, flags);

      if (!strong.matched && !medium.matched && !weak.matched) continue;

      const weight = p.weight ?? 1;
      const score =
        baseW +
        weight * (strong.count * strongW + medium.count * mediumW + weak.count * weakW);

      candidates.push({
        operator: p.operator,
        intentFamily: p.intentFamily,
        confidence: clamp(score, 0, 0.92),
        reason: [
          "intent_patterns_match",
          ...(strong.matched ? ["strong"] : []),
          ...(medium.matched ? ["medium"] : []),
          ...(weak.matched ? ["weak"] : []),
        ],
        signals: { ...(p.setSignals ?? {}), ...triggerContext.signals },
        constraints: { ...(p.setConstraints ?? {}), ...triggerContext.constraints },
      });
    }

    // B) operator_aliases bank (direct operator mention)
    for (const a of this.operatorAliases.aliases ?? []) {
      const patterns = pickLangPatterns(a.patterns, lang);
      const m = matchAny(patterns, text, flags);
      if (!m.matched) continue;

      const family = this.operatorToFamily(a.operator) ?? "documents";
      const boost = a.weight ?? 0.18;

      candidates.push({
        operator: a.operator,
        intentFamily: family,
        confidence: clamp(0.45 + boost, 0, 0.92),
        reason: ["operator_alias_match"],
        signals: { ...triggerContext.signals },
        constraints: { ...triggerContext.constraints },
      });
    }

    // C) operator_triggers bank (operator-specific)
    if (this.operatorTriggers?.config?.enabled !== false) {
      for (const r of this.operatorTriggers!.rules ?? []) {
        if (!r.forceOperator) continue;
        const patterns = pickLangPatterns(r.patterns, lang);
        const m = matchAny(patterns, text, flags);
        if (!m.matched) continue;
        const family = r.forceIntentFamily ?? this.operatorToFamily(r.forceOperator) ?? "documents";
        candidates.push({
          operator: r.forceOperator,
          intentFamily: family,
          confidence: clamp(0.55 + (r.weight ?? 0.20), 0, 0.95),
          reason: ["operator_trigger_match"],
          signals: { ...(r.setSignals ?? {}), ...triggerContext.signals },
          constraints: { ...(r.setConstraints ?? {}), ...triggerContext.constraints },
        });
      }
    }

    // If nothing matched, choose fallback doc question unless it looks purely conversational
    if (candidates.length === 0) {
      // Keep it conservative: route to documents/qa, not file_actions
      candidates.push({
        operator: "qa",
        intentFamily: "documents",
        confidence: 0.25,
        reason: ["fallback_no_match"],
        signals: { ...triggerContext.signals },
        constraints: { ...triggerContext.constraints },
      });
    }

    // Normalize by merging duplicates (same operator)
    return mergeCandidates(candidates);
  }

  // -----------------------------
  // Negatives (collision avoidance)
  // -----------------------------
  private applyNegatives(text: string, lang: LanguageCode, candidates: Array<any>) {
    const neg = this.operatorNegatives;
    if (!neg?.config?.enabled) return candidates;

    const flags = neg.config.caseInsensitive ? "gi" : "g";
    const t = normalizeText(text, {
      stripDiacritics: neg.config.stripDiacritics,
      collapseWhitespace: neg.config.collapseWhitespace,
      lower: neg.config.caseInsensitive,
    });

    let redirectedPreferredOperator: string | null = null;

    for (const rule of neg.rules ?? []) {
      const patterns = pickLangPatterns(rule.triggerPatterns, lang);
      const m = matchAny(patterns, t, flags);
      if (!m.matched) continue;

      for (const c of candidates) {
        if (!rule.appliesToOperators.includes(c.operator)) continue;

        if (rule.action.type === "hard_block") {
          c._hardBlocked = true;
          c.reason.push(`neg:${rule.id}:hard_block`);
          continue;
        }

        if (rule.action.type === "redirect_preference") {
          redirectedPreferredOperator = rule.action.preferredOperator;
          const p = rule.action.confidencePenalty ?? neg.config.defaultPenalty;
          c.confidence = clamp(c.confidence - p, 0, 0.99);
          c.reason.push(`neg:${rule.id}:redirect_preference`);
          continue;
        }

        if (rule.action.type === "confidence_penalty") {
          c.confidence = clamp(c.confidence - rule.action.value, 0, 0.99);
          c.reason.push(`neg:${rule.id}:penalty`);
          continue;
        }
      }
    }

    // Remove hard blocked candidates
    const remaining = candidates.filter((c) => !c._hardBlocked);

    // If a redirect preference exists and that operator is present or can be added, boost it
    if (redirectedPreferredOperator) {
      const has = remaining.find((c) => c.operator === redirectedPreferredOperator);
      if (has) {
        has.confidence = clamp(has.confidence + 0.18, 0, 0.98);
        has.reason.push("neg_redirect_boost");
      } else {
        remaining.push({
          operator: redirectedPreferredOperator,
          intentFamily: this.operatorToFamily(redirectedPreferredOperator) ?? "documents",
          confidence: 0.55,
          reason: ["neg_redirect_insert"],
          signals: {},
          constraints: {},
        });
      }
    }

    return remaining;
  }

  // -----------------------------
  // Priority boosts
  // -----------------------------
  private applyOperatorPriority(candidates: Array<any>) {
    const baseBoost = this.operatorPriority.defaults?.baseBoost ?? 0.05;
    const priorityMap = new Map<string, number>();
    for (const p of this.operatorPriority.priority ?? []) {
      priorityMap.set(p.operator, p.baseBoost ?? baseBoost);
    }

    for (const c of candidates) {
      const b = priorityMap.get(c.operator);
      if (typeof b === "number") {
        c.confidence = clamp(c.confidence + b, 0, 0.99);
        c.reason.push("priority_boost");
      }
    }
    return candidates;
  }

  // -----------------------------
  // Choose best (ChatGPT-like tie-breaking)
  // -----------------------------
  private chooseBest(
    candidates: Array<any>,
    triggerContext: { signals: any; constraints: any; forced?: any },
    state?: ConversationState
  ) {
    // If triggers explicitly set intentFamily/operator in signals, honor it cautiously
    // (already handled earlier via forced)
    // Otherwise: sort by confidence, then by family preference
    // Family preference: documents > file_actions only if signals indicate file inventory
    // plus: followup bias (if activeDoc exists and operator is doc action)

    const followupBias = state?.activeDocRef?.docId ? 0.03 : 0;
    for (const c of candidates) {
      if (c.intentFamily === "documents" && followupBias > 0) c.confidence = clamp(c.confidence + followupBias, 0, 0.99);
    }

    candidates.sort((a, b) => b.confidence - a.confidence);

    const top = candidates[0];
    // Determine intentFamily if unclear: use the candidate’s family (already set)
    // but allow signals to force file_actions if a clear file action signal exists.
    const signals = triggerContext.signals ?? {};
    const fileActionHint = !!(signals.fileListRequest || signals.fileFilterRequest || signals.fileCountRequest || signals.discoveryQuery);

    let chosen = { ...top };
    if (fileActionHint && top.intentFamily !== "file_actions") {
      const alt = candidates.find((c) => c.intentFamily === "file_actions" && c.confidence >= top.confidence - 0.05);
      if (alt) chosen = { ...alt, confidence: clamp(alt.confidence + 0.03, 0, 0.99), reason: [...alt.reason, "file_action_hint_switch"] };
    }

    // If navQuery exists, prefer open/locate ops if close
    if (signals.navQuery) {
      const navOps = new Set(["open", "locate_file", "locate_docs", "where"]);
      const navAlt = candidates.find((c) => navOps.has(c.operator) && c.confidence >= chosen.confidence - 0.06);
      if (navAlt) chosen = { ...navAlt, confidence: clamp(navAlt.confidence + 0.05, 0, 0.99), reason: [...navAlt.reason, "nav_hint_switch"] };
    }

    // Clamp confidence and ensure operator exists
    chosen.operator = chosen.operator || this.intentConfig.config.defaults.fallbackOperator;
    chosen.intentFamily = chosen.intentFamily || this.intentConfig.config.defaults.fallbackIntentFamily;
    chosen.confidence = clamp(chosen.confidence, 0, 0.99);

    return chosen;
  }

  // -----------------------------
  // Constraints derivation
  // -----------------------------
  private deriveConstraints(chosen: any, triggerContext: any, normalized: string): IntentResult["constraints"] {
    const constraints: IntentResult["constraints"] = { ...(triggerContext.constraints ?? {}), ...(chosen.constraints ?? {}) };

    // Apply operator_output_shapes defaults
    const opShape = this.operatorOutputShapes.operators?.[chosen.operator];
    if (opShape?.defaultShape && !constraints.outputShape) {
      constraints.outputShape = mapOutputShapeToConstraint(opShape.defaultShape);
    }

    // Apply operator contract requirements
    const contract = this.operatorContracts.operators?.[chosen.operator];
    if (contract?.produces?.requireSourceButtons) constraints.requireSourceButtons = true;
    if (contract?.produces?.outputShape && !constraints.outputShape) constraints.outputShape = contract.produces.outputShape;

    // If operator is nav_pills operator → button_only outputShape
    if (opShape?.navPills) {
      constraints.outputShape = "button_only";
      constraints.requireSourceButtons = true;
    }

    // Additional derived constraints from query: exact bullets, max sentences, table request, etc.
    // (Already partly derived in triggerContext, but ensure consistency)
    const derived = deriveStructuralConstraints(normalized);
    if (derived.constraints.exactBulletCount && !constraints.exactBulletCount) constraints.exactBulletCount = derived.constraints.exactBulletCount;
    if (derived.constraints.maxSentences && !constraints.maxSentences) constraints.maxSentences = derived.constraints.maxSentences;
    if (derived.constraints.userRequestedShort) constraints.userRequestedShort = true;
    if (derived.constraints.requireTable) constraints.requireTable = true;

    // If requireTable requested, set output shape to table unless operator forbids it
    if (constraints.requireTable && constraints.outputShape !== "button_only") {
      constraints.outputShape = "table";
    }

    return constraints;
  }

  // -----------------------------
  // Conversation shield
  // -----------------------------
  private applyConversationShield(result: IntentResult, text: string, lang: LanguageCode): IntentResult {
    // If intent triggers already flagged conversation-only, keep it.
    if (result.intentFamily === "conversation") return result;

    // Use operator_negatives typically blocks this, but we add a final guard:
    const convoRegexByLang: Record<LanguageCode, RegExp> = {
      en: /^\s*(hi|hello|hey|thanks|thank you|ok|okay|got it)\s*[!?.]*\s*$/i,
      pt: /^\s*(oi|ol[aá]|obrigado|obrigada|valeu|ok|t[aá]|entendi)\s*[!?.]*\s*$/i,
      es: /^\s*(hola|gracias|ok|entendido|vale)\s*[!?.]*\s*$/i,
    };
    if (convoRegexByLang[lang].test(text)) {
      return {
        intentFamily: "conversation",
        operator: "greeting",
        confidence: Math.max(result.confidence, this.intentConfig.config.thresholds.conversationConfidenceFloor ?? 0.55),
        signals: { conversationOnly: true },
        constraints: { outputShape: "paragraph", userRequestedShort: true, maxSentences: 2 },
      };
    }
    return result;
  }

  // -----------------------------
  // Operator family mapping
  // -----------------------------
  private operatorToFamily(operator: string): IntentFamily | null {
    for (const f of this.operatorFamilies.families ?? []) {
      if (f.operators.includes(operator)) return f.id as IntentFamily;
    }
    return null;
  }
}

// -----------------------------
// Helpers: candidate merge, constraints, clamping
// -----------------------------
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mergeCandidates(cands: Array<any>) {
  const byOp = new Map<string, any>();
  for (const c of cands) {
    const key = `${c.intentFamily}::${c.operator}`;
    const existing = byOp.get(key);
    if (!existing) {
      byOp.set(key, { ...c, reason: [...(c.reason ?? [])] });
      continue;
    }
    // Merge: keep max confidence, union reasons/signals/constraints
    existing.confidence = Math.max(existing.confidence, c.confidence);
    existing.reason = Array.from(new Set([...(existing.reason ?? []), ...(c.reason ?? [])]));
    existing.signals = { ...(existing.signals ?? {}), ...(c.signals ?? {}) };
    existing.constraints = { ...(existing.constraints ?? {}), ...(c.constraints ?? {}) };
  }
  return Array.from(byOp.values());
}

function mapOutputShapeToConstraint(shape: OutputShape): OutputShape {
  // same union currently; kept for future mapping (e.g. "steps" -> "numbered_list")
  if (shape === "numbered_list") return "numbered_list";
  return shape;
}

function limitSignals(signals: Record<string, any>, max: number) {
  const keys = Object.keys(signals);
  if (keys.length <= max) return signals;
  const limited: Record<string, any> = {};
  for (const k of keys.slice(0, max)) limited[k] = signals[k];
  return limited;
}

// -----------------------------
// Structural constraints extraction (minimal, non-answer)
// -----------------------------
function deriveStructuralConstraints(rawText: string): { signals: Record<string, any>; constraints: Partial<IntentResult["constraints"]> } {
  const text = rawText.toLowerCase();
  const signals: Record<string, any> = {};
  const constraints: Partial<IntentResult["constraints"]> = {};

  // Exact bullet count (human ways)
  // ex: "give me 5 bullets", "top 3 points", "3 takeaways"
  const bulletCount =
    matchNumber(text, /\b(\d{1,2})\s*(bullets?|points?|takeaways?|itens?|pontos?|t[oó]picos?)\b/) ??
    matchNumber(text, /\btop\s+(\d{1,2})\b/);
  if (bulletCount) {
    constraints.outputShape = "bullets";
    constraints.exactBulletCount = bulletCount;
    signals.userAskedForBullets = true;
  }

  // Table request
  if (/\b(table|tabela|tabla)\b/.test(text)) {
    constraints.requireTable = true;
    constraints.outputShape = "table";
    signals.userAskedForTable = true;
  }

  // Quote request
  if (/\b(quote|verbatim|exact words|citar|textualmente|linha exata)\b/.test(text)) {
    signals.userAskedForQuote = true;
  }

  // Short overview / 2-3 sentences request
  if (/\b(2|two)\s*[-–—]?\s*(3|three)\s*(sentences?|frases?)\b/.test(text) || /\b(short overview|quick overview|resumo curto|bem curto|tldr)\b/.test(text)) {
    constraints.userRequestedShort = true;
    constraints.maxSentences = 3;
    signals.shortOverview = true;
  }

  // Nav-ish queries (open/where/show)
  if (/\b(open|abr(e|ir)|mostrar arquivo|onde est[aá]|where is)\b/.test(text)) {
    signals.navQuery = true;
  }

  // Discovery queries (which file contains…)
  if (/\b(which file|which document|what file|em qual arquivo|qual arquivo|em qual documento)\b/.test(text)) {
    signals.discoveryQuery = true;
  }

  return { signals, constraints };
}

function matchNumber(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
