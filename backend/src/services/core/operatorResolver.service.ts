/**
 * OperatorResolver - 100% Bank-Driven Operator Detection
 *
 * This module determines WHAT ACTION the user wants performed.
 * ALL patterns are loaded from data banks - ZERO hardcoded regex.
 *
 * Banks used:
 * - operators/operator_triggers.*.json: operator trigger patterns
 * - operators/operator_negatives.*.json: operator negative blockers
 * - operators/operator_frames.*.json: operator frames
 * - triggers/help_subintents.*.json: help patterns
 * - triggers/doc_stats_subintents.*.json: doc_stats patterns
 * - triggers/file_actions_subintents.*.json: file action patterns
 * - overlays/followup_inherit.*.json: followup patterns
 * - formatting/operator_confidence.json: confidence thresholds
 * - formatting/operator_guards.json: signal boosters/dampers
 *
 * Universal operators (13):
 * 1. open (button-only)
 * 2. locate_file (button-only, folder path)
 * 3. list (inventory list)
 * 4. filter (list constrained by type/topic/name)
 * 5. sort (newest/largest/date order)
 * 6. summarize
 * 7. extract (structured extraction)
 * 8. locate_content (where in doc: page/slide/tab/cell)
 * 9. compare (table or side-by-side)
 * 10. compute (deterministic math)
 * 11. explain (why/how reasoning)
 * 12. help (product/feature help)
 * 13. doc_stats (document statistics)
 * 14. clarify (ambiguity or missing evidence)
 */

import * as fs from 'fs';
import * as path from 'path';

export type OperatorType =
  | 'open'
  | 'locate_file'
  | 'list'
  | 'filter'
  | 'sort'
  | 'summarize'
  | 'extract'
  | 'locate_content'
  | 'compare'
  | 'compute'
  | 'explain'
  | 'help'
  | 'doc_stats'
  | 'clarify'
  | 'unknown';

/**
 * Match metadata for bank-driven routing
 */
export interface OperatorMatch {
  name: string;
  score: number;
  matchedPatternIds: string[];
}

export interface OperatorResult {
  operator: OperatorType;
  confidence: number;
  signalsMatched: string[];
  isFollowup: boolean;
  needsMemory: boolean;
  guardsFired: string[];
  topMatches: OperatorMatch[];
  primaryMatch: OperatorMatch;
}

type LanguageCode = 'en' | 'pt' | 'es';

// ============================================================================
// BANK LOADING TYPES
// ============================================================================

interface OperatorTriggerBank {
  _meta?: { version: string; language: string };
  operators: Record<string, {
    priority: number;
    triggers: string[];
  }>;
}

interface OperatorNegativeBank {
  _meta?: { version: string; language: string };
  blockers: Record<string, {
    blocks: string[];
    patterns: string[];
  }>;
}

interface HelpSubintentBank {
  product_help?: string[];
  capabilities?: string[];
  troubleshooting?: string[];
  [key: string]: string[] | undefined;
}

interface DocStatsSubintentBank {
  page_count?: string[];
  slide_count?: string[];
  word_count?: string[];
  document_overview?: string[];
  [key: string]: string[] | undefined;
}

interface FileActionsSubintentBank {
  open?: string[];
  locate_file?: string[];
  list?: string[];
  filter?: string[];
  sort?: string[];
  [key: string]: string[] | undefined;
}

interface FollowupBank {
  inherit_patterns?: string[];
  pronouns?: string[];
  continuation?: string[];
  [key: string]: string[] | undefined;
}

interface GuardRule {
  name: string;
  patterns: RegExp[];
  forceOperator: OperatorType;
  blockOperators: OperatorType[];
}

// ============================================================================
// OPERATOR PRIORITY ORDER (from banks or fallback)
// ============================================================================

const DEFAULT_OPERATOR_PRIORITY: OperatorType[] = [
  'open',           // 1 - explicit file action
  'locate_file',    // 2 - where is file/folder
  'locate_content', // 3 - where in document
  'compare',        // 4 - comparison
  'compute',        // 5 - math/calculation
  'summarize',      // 6 - summarization
  'extract',        // 7 - structured extraction
  'filter',         // 8 - constrained list
  'sort',           // 9 - ordered list
  'list',           // 10 - generic inventory
  'explain',        // 11 - reasoning
  'help',           // 12 - product help
  'doc_stats',      // 13 - document statistics
  'clarify',        // 14 - disambiguation
];

// ============================================================================
// MAIN RESOLVER CLASS - 100% BANK-DRIVEN
// ============================================================================

export class OperatorResolver {
  private banksPath: string;
  private operatorPatterns: Map<OperatorType, Map<LanguageCode, RegExp[]>> = new Map();
  private operatorPriorities: Map<OperatorType, number> = new Map();
  private negativeBlockers: Map<OperatorType, Map<LanguageCode, RegExp[]>> = new Map();
  private followupPatterns: Map<LanguageCode, RegExp[]> = new Map();
  private guardRules: GuardRule[] = [];
  private initialized = false;

  constructor() {
    this.banksPath = path.join(__dirname, '../../data_banks');
    this.loadAllBanks();
  }

  /**
   * Load ALL patterns from banks - NO hardcoded patterns
   */
  private loadAllBanks(): void {
    try {
      // Load operator triggers (primary patterns)
      this.loadOperatorTriggers('en');
      this.loadOperatorTriggers('pt');

      // Load operator negatives (blockers)
      this.loadOperatorNegatives('en');
      this.loadOperatorNegatives('pt');

      // Load help patterns
      this.loadHelpPatterns('en');
      this.loadHelpPatterns('pt');

      // Load doc_stats patterns
      this.loadDocStatsPatterns('en');
      this.loadDocStatsPatterns('pt');

      // Load file_actions patterns (for open/locate_file/list/filter/sort)
      this.loadFileActionsPatterns('en');
      this.loadFileActionsPatterns('pt');

      // Load followup patterns
      this.loadFollowupPatterns('en');
      this.loadFollowupPatterns('pt');

      // Load guard rules from banks
      this.loadGuardRules('en');
      this.loadGuardRules('pt');

      this.initialized = true;
      console.log('✅ [OperatorResolver] All banks loaded - 100% bank-driven');
    } catch (error: any) {
      console.warn('⚠️ [OperatorResolver] Bank loading failed:', error.message);
    }
  }

  /**
   * Load operator trigger patterns from bank
   */
  private loadOperatorTriggers(lang: LanguageCode): void {
    const filePath = path.join(this.banksPath, `operators/operator_triggers.${lang}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ [OperatorResolver] Missing: operator_triggers.${lang}.json`);
      return;
    }

    try {
      const bank: OperatorTriggerBank = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      for (const [opName, config] of Object.entries(bank.operators || {})) {
        const operator = opName as OperatorType;

        // Store priority
        if (config.priority !== undefined) {
          this.operatorPriorities.set(operator, config.priority);
        }

        // Compile patterns
        const compiled = this.compilePatterns(config.triggers || []);
        if (compiled.length > 0) {
          if (!this.operatorPatterns.has(operator)) {
            this.operatorPatterns.set(operator, new Map());
          }
          this.operatorPatterns.get(operator)!.set(lang, compiled);
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ [OperatorResolver] Failed to load operator_triggers.${lang}.json:`, error.message);
    }
  }

  /**
   * Load operator negative patterns from bank
   */
  private loadOperatorNegatives(lang: LanguageCode): void {
    // First try language-specific file
    const langFilePath = path.join(this.banksPath, `operators/operator_negatives.${lang}.json`);
    if (fs.existsSync(langFilePath)) {
      try {
        const bank: OperatorNegativeBank = JSON.parse(fs.readFileSync(langFilePath, 'utf-8'));
        this.processLegacyNegativeBank(bank, lang);
      } catch (error: any) {
        console.warn(`⚠️ [OperatorResolver] Failed to load operator_negatives.${lang}.json:`, error.message);
      }
    }

    // Also load the universal .any.json format (multilingual patterns embedded)
    const anyFilePath = path.join(this.banksPath, 'operators/operator_negatives.any.json');
    if (fs.existsSync(anyFilePath)) {
      try {
        const bank = JSON.parse(fs.readFileSync(anyFilePath, 'utf-8'));
        this.processUniversalNegativeBank(bank, lang);
      } catch (error: any) {
        console.warn(`⚠️ [OperatorResolver] Failed to load operator_negatives.any.json:`, error.message);
      }
    }
  }

  /**
   * Process legacy operator negatives format (blockers with patterns array)
   */
  private processLegacyNegativeBank(bank: OperatorNegativeBank, lang: LanguageCode): void {
    for (const [blockerName, config] of Object.entries(bank.blockers || {})) {
      const blockedOps = config.blocks || [];
      const patterns = this.compilePatterns(config.patterns || []);

      for (const opName of blockedOps) {
        const operator = opName as OperatorType;
        if (!this.negativeBlockers.has(operator)) {
          this.negativeBlockers.set(operator, new Map());
        }
        const existing = this.negativeBlockers.get(operator)!.get(lang) || [];
        this.negativeBlockers.get(operator)!.set(lang, [...existing, ...patterns]);
      }
    }
  }

  /**
   * Process universal operator negatives format (rules with multilingual triggerPatterns)
   */
  private processUniversalNegativeBank(bank: any, lang: LanguageCode): void {
    const rules = bank.rules || [];
    for (const rule of rules) {
      const appliesToOperators = rule.appliesToOperators || [];

      // Get patterns for this language (or fallback to 'en')
      const triggerPatterns = rule.triggerPatterns || {};
      const patterns = triggerPatterns[lang] || triggerPatterns['en'] || [];
      const compiled = this.compilePatterns(patterns);

      // Handle action types
      const actionType = rule.action?.type;
      if (actionType === 'hard_block' || actionType === 'confidence_penalty') {
        for (const opName of appliesToOperators) {
          const operator = opName as OperatorType;
          if (!this.negativeBlockers.has(operator)) {
            this.negativeBlockers.set(operator, new Map());
          }
          const existing = this.negativeBlockers.get(operator)!.get(lang) || [];
          this.negativeBlockers.get(operator)!.set(lang, [...existing, ...compiled]);
        }
      }
    }
  }

  /**
   * Load help patterns from help_subintents bank
   */
  private loadHelpPatterns(lang: LanguageCode): void {
    const filePath = path.join(this.banksPath, `triggers/help_subintents.${lang}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ [OperatorResolver] Missing: help_subintents.${lang}.json`);
      return;
    }

    try {
      const bank: HelpSubintentBank = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Collect all help phrases
      const allPhrases: string[] = [];
      for (const [key, phrases] of Object.entries(bank)) {
        if (key.startsWith('_')) continue; // Skip meta fields
        if (Array.isArray(phrases)) {
          allPhrases.push(...phrases);
        }
      }

      // Convert phrases to regex patterns (exact phrase match)
      const patterns = allPhrases.map(phrase => {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          return new RegExp(`\\b${escaped}\\b`, 'i');
        } catch {
          return null;
        }
      }).filter((r): r is RegExp => r !== null);

      if (patterns.length > 0) {
        if (!this.operatorPatterns.has('help')) {
          this.operatorPatterns.set('help', new Map());
        }
        // MERGE with existing patterns from operator_triggers (don't overwrite)
        const existing = this.operatorPatterns.get('help')!.get(lang) || [];
        this.operatorPatterns.get('help')!.set(lang, [...existing, ...patterns]);
        // Only set priority if not already set from operator_triggers
        if (!this.operatorPriorities.has('help')) {
          this.operatorPriorities.set('help', 40);
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ [OperatorResolver] Failed to load help_subintents.${lang}.json:`, error.message);
    }
  }

  /**
   * Load doc_stats patterns from doc_stats_subintents bank
   */
  private loadDocStatsPatterns(lang: LanguageCode): void {
    const filePath = path.join(this.banksPath, `triggers/doc_stats_subintents.${lang}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ [OperatorResolver] Missing: doc_stats_subintents.${lang}.json`);
      return;
    }

    try {
      const bank: DocStatsSubintentBank = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Collect all doc_stats phrases
      const allPhrases: string[] = [];
      for (const [key, phrases] of Object.entries(bank)) {
        if (key.startsWith('_')) continue;
        if (Array.isArray(phrases)) {
          allPhrases.push(...phrases);
        }
      }

      // Convert phrases to regex patterns
      const patterns = allPhrases.map(phrase => {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          return new RegExp(`\\b${escaped}\\b`, 'i');
        } catch {
          return null;
        }
      }).filter((r): r is RegExp => r !== null);

      if (patterns.length > 0) {
        if (!this.operatorPatterns.has('doc_stats')) {
          this.operatorPatterns.set('doc_stats', new Map());
        }
        // MERGE with existing patterns from operator_triggers (don't overwrite)
        const existing = this.operatorPatterns.get('doc_stats')!.get(lang) || [];
        this.operatorPatterns.get('doc_stats')!.set(lang, [...existing, ...patterns]);
        // Only set priority if not already set from operator_triggers
        if (!this.operatorPriorities.has('doc_stats')) {
          this.operatorPriorities.set('doc_stats', 45);
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ [OperatorResolver] Failed to load doc_stats_subintents.${lang}.json:`, error.message);
    }
  }

  /**
   * Load file_actions patterns
   */
  private loadFileActionsPatterns(lang: LanguageCode): void {
    const filePath = path.join(this.banksPath, `triggers/file_actions_subintents.${lang}.json`);
    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const bank = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Map bank keys to operators
      const keyToOperator: Record<string, OperatorType> = {
        open: 'open',
        locate_file: 'locate_file',
        list: 'list',
        filter: 'filter',
        filter_type: 'filter',
        filter_topic: 'filter',
        sort: 'sort',
        newest: 'sort',
        largest: 'sort',
        where_file: 'locate_file',
        inventory: 'list',
        group_by_folder: 'list',
      };

      // Handle nested subintents structure: { subintents: { open: { triggers: [...] } } }
      const subintents = bank.subintents || bank;

      for (const [key, value] of Object.entries(subintents)) {
        if (key.startsWith('_')) continue;

        const operator = keyToOperator[key];
        if (!operator) continue;

        // Handle both { triggers: [...] } and direct array formats
        let phrases: string[] = [];
        if (Array.isArray(value)) {
          phrases = value;
        } else if (value && typeof value === 'object' && 'triggers' in value) {
          phrases = (value as { triggers: string[] }).triggers || [];
        }

        if (phrases.length === 0) continue;

        const patterns = phrases.map(phrase => {
          const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          try {
            return new RegExp(`\\b${escaped}\\b`, 'i');
          } catch {
            return null;
          }
        }).filter((r): r is RegExp => r !== null);

        if (patterns.length > 0) {
          if (!this.operatorPatterns.has(operator)) {
            this.operatorPatterns.set(operator, new Map());
          }
          const existing = this.operatorPatterns.get(operator)!.get(lang) || [];
          this.operatorPatterns.get(operator)!.set(lang, [...existing, ...patterns]);

          // Set priorities for file actions
          if (operator === 'open') this.operatorPriorities.set('open', 95);
          if (operator === 'locate_file') this.operatorPriorities.set('locate_file', 93);
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ [OperatorResolver] Failed to load file_actions_subintents.${lang}.json:`, error.message);
    }
  }

  /**
   * Load followup patterns from bank
   */
  private loadFollowupPatterns(lang: LanguageCode): void {
    const filePath = path.join(this.banksPath, `overlays/followup_inherit.${lang}.json`);
    if (!fs.existsSync(filePath)) {
      // Try alternative path
      const altPath = path.join(this.banksPath, `overlays/followup_patterns.${lang}.json`);
      if (!fs.existsSync(altPath)) {
        return;
      }
    }

    try {
      const actualPath = fs.existsSync(path.join(this.banksPath, `overlays/followup_inherit.${lang}.json`))
        ? path.join(this.banksPath, `overlays/followup_inherit.${lang}.json`)
        : path.join(this.banksPath, `overlays/followup_patterns.${lang}.json`);

      const bank: FollowupBank = JSON.parse(fs.readFileSync(actualPath, 'utf-8'));

      const allPatterns: string[] = [];
      for (const [key, patterns] of Object.entries(bank)) {
        if (key.startsWith('_')) continue;
        if (Array.isArray(patterns)) {
          allPatterns.push(...patterns);
        }
      }

      const compiled = this.compilePatterns(allPatterns);
      if (compiled.length > 0) {
        this.followupPatterns.set(lang, compiled);
      }
    } catch (error: any) {
      console.warn(`⚠️ [OperatorResolver] Failed to load followup patterns for ${lang}:`, error.message);
    }
  }

  /**
   * Load guard rules from banks (or use minimal fallback)
   */
  private loadGuardRules(lang: LanguageCode): void {
    // Try to load from formatting/operator_guards.json
    const filePath = path.join(this.banksPath, 'formatting/operator_guards.json');
    if (fs.existsSync(filePath)) {
      try {
        const bank = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (bank.guard_rules && Array.isArray(bank.guard_rules)) {
          for (const rule of bank.guard_rules) {
            const patterns = this.compilePatterns(rule.patterns?.[lang] || rule.patterns?.en || []);
            if (patterns.length > 0) {
              this.guardRules.push({
                name: rule.name,
                patterns,
                forceOperator: rule.force_operator as OperatorType,
                blockOperators: (rule.block_operators || []) as OperatorType[],
              });
            }
          }
        }
      } catch (error: any) {
        console.warn('⚠️ [OperatorResolver] Failed to load operator_guards.json:', error.message);
      }
    }

    // If no guards loaded, use minimal critical guards loaded from negative banks
    if (this.guardRules.length === 0) {
      // Guards will be inferred from negative patterns during resolution
      console.log('ℹ️ [OperatorResolver] No explicit guard rules - using negative patterns as guards');
    }
  }

  /**
   * Compile string patterns to RegExp
   */
  private compilePatterns(patterns: string[]): RegExp[] {
    return patterns.map(p => {
      try {
        // If it looks like a regex (starts with ^ or contains special chars), use as-is
        if (p.startsWith('^') || p.includes('\\b') || p.includes('|') || p.includes('(')) {
          return new RegExp(p, 'i');
        }
        // Otherwise, escape and create word-boundary pattern
        const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i');
      } catch {
        return null;
      }
    }).filter((r): r is RegExp => r !== null);
  }

  /**
   * Resolve the operator from a query - 100% bank-driven
   */
  resolve(
    query: string,
    language: LanguageCode = 'en',
    lastOperator?: OperatorType
  ): OperatorResult {
    const normalizedQuery = this.normalizeQuery(query);
    const signalsMatched: string[] = [];
    const guardsFired: string[] = [];

    // Check for followup
    const isFollowup = this.detectFollowup(normalizedQuery, language);
    const needsMemory = isFollowup;

    // Step 1: Check guard rules first (from banks)
    for (const guard of this.guardRules) {
      for (let i = 0; i < guard.patterns.length; i++) {
        if (guard.patterns[i].test(normalizedQuery)) {
          guardsFired.push(guard.name);
          const patternId = `guard_${guard.name}_${i}`;
          signalsMatched.push(`guard:${guard.name}:${patternId}`);

          const primaryMatch: OperatorMatch = {
            name: guard.forceOperator,
            score: 0.95,
            matchedPatternIds: [patternId],
          };

          return {
            operator: guard.forceOperator,
            confidence: 0.95,
            signalsMatched,
            isFollowup,
            needsMemory,
            guardsFired,
            topMatches: [primaryMatch],
            primaryMatch,
          };
        }
      }
    }

    // Step 2: Check negative blockers first to build block list
    const blockedOperators = new Set<OperatorType>();
    for (const [operator, langPatterns] of this.negativeBlockers) {
      const patterns = langPatterns.get(language) || langPatterns.get('en') || [];
      for (const pattern of patterns) {
        if (pattern.test(normalizedQuery)) {
          blockedOperators.add(operator);
          signalsMatched.push(`negative:${operator}`);
          break;
        }
      }
    }

    // Step 3: Match patterns in priority order (from banks)
    const matches: { operator: OperatorType; patterns: number; priority: number; patternIds: string[] }[] = [];

    // Get sorted operators by priority
    const sortedOperators = Array.from(this.operatorPatterns.keys())
      .filter(op => !blockedOperators.has(op))
      .sort((a, b) => {
        const prioA = this.operatorPriorities.get(a) ?? 50;
        const prioB = this.operatorPriorities.get(b) ?? 50;
        return prioB - prioA; // Higher priority number = higher priority
      });

    for (const operator of sortedOperators) {
      const langPatterns = this.operatorPatterns.get(operator);
      if (!langPatterns) continue;

      const patterns = langPatterns.get(language) || langPatterns.get('en') || [];
      let matchCount = 0;
      const patternIds: string[] = [];

      for (let i = 0; i < patterns.length; i++) {
        if (patterns[i].test(normalizedQuery)) {
          matchCount++;
          const patternId = `op_${operator}_${language}_${i}`;
          patternIds.push(patternId);
          signalsMatched.push(`pattern:${operator}:${patternId}`);
        }
      }

      if (matchCount > 0) {
        matches.push({
          operator,
          patterns: matchCount,
          priority: this.operatorPriorities.get(operator) ?? 50,
          patternIds,
        });
      }
    }

    // Step 4: Select best match (priority wins, then pattern count)
    if (matches.length > 0) {
      matches.sort((a, b) => {
        // Higher priority number = higher priority
        if (a.priority !== b.priority) return b.priority - a.priority;
        // More pattern matches = higher confidence
        return b.patterns - a.patterns;
      });

      const best = matches[0];
      const confidence = Math.min(0.95, 0.6 + (best.patterns * 0.1));

      // Build topMatches for routing signals
      const topMatches: OperatorMatch[] = matches.slice(0, 5).map(m => ({
        name: m.operator,
        score: Math.min(0.95, 0.6 + (m.patterns * 0.1)),
        matchedPatternIds: m.patternIds,
      }));

      const primaryMatch: OperatorMatch = {
        name: best.operator,
        score: confidence,
        matchedPatternIds: best.patternIds,
      };

      return {
        operator: best.operator,
        confidence,
        signalsMatched,
        isFollowup,
        needsMemory,
        guardsFired,
        topMatches,
        primaryMatch,
      };
    }

    // Step 5: Fallback for followups
    if (isFollowup && lastOperator && lastOperator !== 'unknown') {
      signalsMatched.push('fallback:followup_inherit');
      const primaryMatch: OperatorMatch = {
        name: lastOperator,
        score: 0.7,
        matchedPatternIds: ['followup_inherit'],
      };
      return {
        operator: lastOperator,
        confidence: 0.7,
        signalsMatched,
        isFollowup: true,
        needsMemory: true,
        guardsFired,
        topMatches: [primaryMatch],
        primaryMatch,
      };
    }

    // Step 6: Unknown
    const unknownMatch: OperatorMatch = {
      name: 'unknown',
      score: 0.3,
      matchedPatternIds: [],
    };
    return {
      operator: 'unknown',
      confidence: 0.3,
      signalsMatched,
      isFollowup,
      needsMemory,
      guardsFired,
      topMatches: [unknownMatch],
      primaryMatch: unknownMatch,
    };
  }

  /**
   * Normalize query for pattern matching
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Detect if query is a followup - from banks
   */
  private detectFollowup(query: string, language: LanguageCode): boolean {
    const patterns = this.followupPatterns.get(language) || this.followupPatterns.get('en') || [];
    return patterns.some(p => p.test(query));
  }

  /**
   * Get loaded operator count for diagnostics
   */
  getLoadedOperatorCount(): number {
    return this.operatorPatterns.size;
  }

  /**
   * Get pattern count for a specific operator
   */
  getPatternCount(operator: OperatorType, lang: LanguageCode = 'en'): number {
    const langPatterns = this.operatorPatterns.get(operator);
    if (!langPatterns) return 0;
    return (langPatterns.get(lang) || []).length;
  }

  /**
   * Diagnostic: list all loaded operators with pattern counts
   */
  getDiagnostics(): Record<string, { en: number; pt: number; priority: number }> {
    const result: Record<string, { en: number; pt: number; priority: number }> = {};
    for (const [operator, langPatterns] of this.operatorPatterns) {
      result[operator] = {
        en: (langPatterns.get('en') || []).length,
        pt: (langPatterns.get('pt') || []).length,
        priority: this.operatorPriorities.get(operator) ?? 50,
      };
    }
    return result;
  }
}

// ============================================================================
// CONFIDENCE POLICY INTEGRATION
// ============================================================================

export type ActionType =
  | 'execute'
  | 'execute_with_caveat'
  | 'execute_with_results'
  | 'clarify'
  | 'disambiguate'
  | 'confirm';

interface ConfidencePolicy {
  confidence_thresholds: {
    high: number;
    medium: number;
    low: number;
    very_low: number;
  };
  operator_rules: Record<string, {
    min_confidence: number;
    action_below_threshold: ActionType;
    caveat_template?: string;
    clarify_template?: string;
    confirm_template?: string;
  }>;
  clarification_templates: Record<string, Record<string, string>>;
}

interface SignalBooster {
  patterns: string[];
  boost: number;
}

interface SignalDamper {
  anti_patterns: string[];
  dampen: number;
}

interface GuardPolicy {
  signal_boosters: Record<string, SignalBooster>;
  signal_dampers: Record<string, SignalDamper>;
  fallback_chain: {
    chains: Record<string, string[]>;
  };
}

export interface ActionResult {
  action: ActionType;
  template?: string;
  fallbackChain?: OperatorType[];
}

/**
 * Extended resolver with confidence policy integration
 */
export class OperatorResolverWithPolicy extends OperatorResolver {
  private confidencePolicy: ConfidencePolicy | null = null;
  private guardPolicy: GuardPolicy | null = null;
  private compiledBoosters: Map<string, RegExp[]> = new Map();
  private compiledDampers: Map<string, RegExp[]> = new Map();

  constructor() {
    super();
    this.loadPolicies();
  }

  private loadPolicies(): void {
    try {
      const confidencePath = path.join(
        __dirname,
        '../../data_banks/formatting/operator_confidence.json'
      );
      const guardPath = path.join(
        __dirname,
        '../../data_banks/formatting/operator_guards.json'
      );

      if (fs.existsSync(confidencePath)) {
        this.confidencePolicy = JSON.parse(fs.readFileSync(confidencePath, 'utf-8'));
      }

      if (fs.existsSync(guardPath)) {
        this.guardPolicy = JSON.parse(fs.readFileSync(guardPath, 'utf-8'));
        this.compileSignalPatterns();
      }

      console.log('✅ [OperatorResolverWithPolicy] Policies loaded');
    } catch (error: any) {
      console.warn('⚠️ [OperatorResolverWithPolicy] Policy load failed:', error.message);
    }
  }

  private compileSignalPatterns(): void {
    if (!this.guardPolicy) return;

    // Compile boosters - ALL from banks
    for (const [op, booster] of Object.entries(this.guardPolicy.signal_boosters || {})) {
      const compiled = booster.patterns.map(p => {
        try { return new RegExp(p, 'i'); } catch { return null; }
      }).filter((r): r is RegExp => r !== null);
      this.compiledBoosters.set(op, compiled);
    }

    // Compile dampers - ALL from banks
    for (const [op, damper] of Object.entries(this.guardPolicy.signal_dampers || {})) {
      const compiled = damper.anti_patterns.map(p => {
        try { return new RegExp(p, 'i'); } catch { return null; }
      }).filter((r): r is RegExp => r !== null);
      this.compiledDampers.set(op, compiled);
    }
  }

  /**
   * Apply signal boosters to confidence
   */
  applyBoosters(operator: OperatorType, query: string, baseConfidence: number): number {
    const patterns = this.compiledBoosters.get(operator);
    if (!patterns || patterns.length === 0) return baseConfidence;

    const boostConfig = this.guardPolicy?.signal_boosters[operator];
    if (!boostConfig) return baseConfidence;

    for (const regex of patterns) {
      if (regex.test(query)) {
        return Math.min(1.0, baseConfidence + boostConfig.boost);
      }
    }
    return baseConfidence;
  }

  /**
   * Apply signal dampers to confidence
   */
  applyDampers(operator: OperatorType, query: string, baseConfidence: number): number {
    const patterns = this.compiledDampers.get(operator);
    if (!patterns || patterns.length === 0) return baseConfidence;

    const dampConfig = this.guardPolicy?.signal_dampers[operator];
    if (!dampConfig) return baseConfidence;

    for (const regex of patterns) {
      if (regex.test(query)) {
        return Math.max(0, baseConfidence - dampConfig.dampen);
      }
    }
    return baseConfidence;
  }

  /**
   * Adjust confidence with boosters and dampers
   */
  adjustConfidence(operator: OperatorType, query: string, baseConfidence: number): number {
    let adjusted = this.applyBoosters(operator, query, baseConfidence);
    adjusted = this.applyDampers(operator, query, adjusted);
    return adjusted;
  }

  /**
   * Determine action based on confidence
   */
  determineAction(operator: OperatorType, confidence: number, language: 'en' | 'pt' = 'en'): ActionResult {
    if (!this.confidencePolicy) {
      return { action: confidence >= 0.70 ? 'execute' : 'clarify' };
    }

    const rule = this.confidencePolicy.operator_rules[operator];
    if (!rule) {
      return { action: confidence >= 0.70 ? 'execute' : 'clarify' };
    }

    if (confidence >= rule.min_confidence) {
      return { action: 'execute' };
    }

    const action = rule.action_below_threshold;
    let template: string | undefined;

    switch (action) {
      case 'execute_with_caveat':
        template = rule.caveat_template;
        break;
      case 'clarify':
        template = rule.clarify_template;
        break;
      case 'confirm':
        template = rule.confirm_template;
        break;
    }

    const fallbackChain = this.guardPolicy?.fallback_chain?.chains[operator] as OperatorType[] | undefined;

    return { action, template, fallbackChain };
  }

  /**
   * Get confidence band
   */
  getConfidenceBand(confidence: number): 'high' | 'medium' | 'low' | 'very_low' {
    if (!this.confidencePolicy) {
      return confidence >= 0.85 ? 'high' : confidence >= 0.65 ? 'medium' : confidence >= 0.45 ? 'low' : 'very_low';
    }
    const { high, medium, low } = this.confidencePolicy.confidence_thresholds;
    if (confidence >= high) return 'high';
    if (confidence >= medium) return 'medium';
    if (confidence >= low) return 'low';
    return 'very_low';
  }

  /**
   * Check if operator needs confirmation
   */
  needsConfirmation(operator: OperatorType): boolean {
    const confirmOperators = ['delete', 'rename', 'move', 'create_folder'];
    return confirmOperators.includes(operator);
  }

  /**
   * Resolve with policy-aware confidence adjustment
   */
  resolveWithPolicy(
    query: string,
    language: 'en' | 'pt' | 'es' = 'en',
    lastOperator?: OperatorType
  ): OperatorResult & { action: ActionResult } {
    const baseResult = this.resolve(query, language, lastOperator);
    const adjustedConfidence = this.adjustConfidence(baseResult.operator, query, baseResult.confidence);
    const action = this.determineAction(baseResult.operator, adjustedConfidence, language === 'es' ? 'en' : language);

    return {
      ...baseResult,
      confidence: adjustedConfidence,
      action,
    };
  }

  /**
   * Get clarification template
   */
  getClarificationTemplate(templateKey: string, language: 'en' | 'pt' = 'en'): string | undefined {
    return this.confidencePolicy?.clarification_templates[language]?.[templateKey];
  }
}

// Singleton instance
let operatorResolverInstance: OperatorResolver | null = null;
let policyResolverInstance: OperatorResolverWithPolicy | null = null;

export function getOperatorResolver(): OperatorResolver {
  if (!operatorResolverInstance) {
    operatorResolverInstance = new OperatorResolver();
  }
  return operatorResolverInstance;
}

export function getOperatorResolverWithPolicy(): OperatorResolverWithPolicy {
  if (!policyResolverInstance) {
    policyResolverInstance = new OperatorResolverWithPolicy();
  }
  return policyResolverInstance;
}
