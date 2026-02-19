/**
 * RuntimePatterns Service
 *
 * Central service for loading and matching patterns from compiled bank data.
 * This replaces hardcoded patterns scattered across orchestrator, fileSearch, etc.
 *
 * Key APIs:
 * - isFileActionQuery(query, lang): Check if query is file navigation/listing
 * - isLocationQuery(query, lang): Check if query is "where is X" type
 * - isFollowupQuery(query, lang): Check if query references previous context
 * - getOperatorMatches(query, lang): Get scored operator matches
 * - getIntentMatches(query, lang): Get scored intent matches
 * - getFormatConstraints(intent, operator): Get allowed output shapes
 */

import * as fs from "fs";
import * as path from "path";

// Types
export interface PatternMatch {
  id: string;
  pattern: string;
  confidence: number;
  operator?: string;
  subIntent?: string;
}

export interface OperatorMatch {
  operator: string;
  confidence: number;
  matchedPatterns: string[];
}

export interface IntentMatch {
  intent: string;
  confidence: number;
  matchedPatterns: string[];
  subIntent?: string;
}

export interface FormatConstraint {
  allowedShapes: string[];
  expectedTemplateIdPrefixes: string[];
}

interface RuntimeData {
  version: string;
  languages: string[];
  defaults: { language: string; intent: string; operator: string };
  operators: Record<
    string,
    {
      priority: number;
      patterns: Record<string, string[]>;
      negatives: Record<string, string[]>;
      allowedOutputShapes: string[];
      minConfidence: number;
    }
  >;
  intents: Record<
    string,
    {
      priority: number;
      description: string;
      operatorsAllowed: string[];
      patterns: Record<string, string[]>;
      negatives: Record<string, string[]>;
    }
  >;
  overlays: {
    followup: Record<string, string[]>;
    continue: Record<string, string[]>;
    clarifyRequired: Record<string, string[]>;
    driftDetectors: Record<string, string[]>;
  };
  scope: {
    typeRules: {
      anchorNouns: Record<string, Record<string, string[]>>;
    };
    confidencePolicy: Record<string, { autoScopeThreshold: number }>;
    disambiguation: { maxCandidates: number };
  };
  templates: {
    operatorTemplateMap: Record<string, FormatConstraint>;
  };
  policies: {
    bannedOpeners: string[];
    bannedPhrases: string[];
    completionGate: {
      forbidEllipsis: boolean;
      forbidDanglingMarkers: boolean;
      requireValidTableWhenRequested: boolean;
    };
  };
}

interface BankTrigger {
  id: string;
  pattern: string;
  confidence: number;
  operator?: string;
}

interface TriggerBank {
  bank_id: string;
  language: string;
  triggers?: BankTrigger[];
  subintents?: Record<string, { triggers: string[] }>;
}

class RuntimePatternsService {
  private static instance: RuntimePatternsService;
  private runtimeData: RuntimeData | null = null;
  private bankCache: Map<string, TriggerBank> = new Map();
  private compiledPatterns: Map<string, RegExp[]> = new Map();

  private readonly DATA_DIR = path.join(__dirname, "../../data");
  private readonly BANKS_DIR = path.join(__dirname, "../../data_banks");

  private constructor() {
    this.loadRuntimeData();
    this.loadBanks();
  }

  static getInstance(): RuntimePatternsService {
    if (!RuntimePatternsService.instance) {
      RuntimePatternsService.instance = new RuntimePatternsService();
    }
    return RuntimePatternsService.instance;
  }

  // ==================== Loading ====================

  private loadRuntimeData(): void {
    try {
      const runtimePath = path.join(
        this.DATA_DIR,
        "intent_patterns.runtime.json",
      );
      if (fs.existsSync(runtimePath)) {
        const content = fs.readFileSync(runtimePath, "utf-8");
        this.runtimeData = JSON.parse(content);
        console.log(
          `[RuntimePatterns] Loaded runtime data v${this.runtimeData?.version}`,
        );
      } else {
        console.warn(
          "[RuntimePatterns] Runtime JSON not found, using defaults",
        );
        this.runtimeData = this.getDefaultRuntimeData();
      }
    } catch (error) {
      console.error("[RuntimePatterns] Error loading runtime data:", error);
      this.runtimeData = this.getDefaultRuntimeData();
    }
  }

  private loadBanks(): void {
    const bankFiles = [
      "triggers/locate_content.en.json",
      "triggers/locate_content.pt.json",
      "triggers/file_actions_subintents.en.json",
      "triggers/file_actions_subintents.pt.json",
      "triggers/primary_intents.en.json",
      "triggers/primary_intents.pt.json",
      "triggers/documents_subintents.en.json",
      "triggers/documents_subintents.pt.json",
      "triggers/navigation_operators.en.json",
      "triggers/navigation_operators.pt.json",
      "overlays/followup_inherit.en.json",
      "overlays/followup_inherit.pt.json",
    ];

    for (const file of bankFiles) {
      const fullPath = path.join(this.BANKS_DIR, file);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const bank = JSON.parse(content) as TriggerBank;
          const key = file
            .replace(".json", "")
            .replace("triggers/", "")
            .replace("overlays/", "");
          this.bankCache.set(key, bank);
        } catch (error) {
          console.warn(`[RuntimePatterns] Error loading bank ${file}:`, error);
        }
      }
    }
    console.log(`[RuntimePatterns] Loaded ${this.bankCache.size} bank files`);
  }

  private getDefaultRuntimeData(): RuntimeData {
    return {
      version: "default",
      languages: ["en", "pt"],
      defaults: { language: "en", intent: "documents", operator: "summarize" },
      operators: {},
      intents: {},
      overlays: {
        followup: {},
        continue: {},
        clarifyRequired: {},
        driftDetectors: {},
      },
      scope: {
        typeRules: { anchorNouns: {} },
        confidencePolicy: {},
        disambiguation: { maxCandidates: 5 },
      },
      templates: { operatorTemplateMap: {} },
      policies: {
        bannedOpeners: [],
        bannedPhrases: [],
        completionGate: {
          forbidEllipsis: true,
          forbidDanglingMarkers: true,
          requireValidTableWhenRequested: true,
        },
      },
    };
  }

  // ==================== Pattern Compilation ====================

  private compilePatterns(key: string, patterns: string[]): RegExp[] {
    if (this.compiledPatterns.has(key)) {
      return this.compiledPatterns.get(key)!;
    }

    const compiled: RegExp[] = [];
    for (const pattern of patterns) {
      try {
        // If pattern looks like regex (contains special chars), compile as-is
        if (/[()|\[\]\\^$.*+?{}]/.test(pattern)) {
          compiled.push(new RegExp(pattern, "i"));
        } else {
          // Plain text: escape special chars and match as substring
          const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          compiled.push(new RegExp(`\\b${escaped}\\b`, "i"));
        }
      } catch (error) {
        // Skip invalid regex patterns
        console.warn(`[RuntimePatterns] Invalid pattern: ${pattern}`);
      }
    }

    this.compiledPatterns.set(key, compiled);
    return compiled;
  }

  private matchPatterns(query: string, patterns: RegExp[]): boolean {
    const normalized = query.toLowerCase().trim();
    return patterns.some((p) => p.test(normalized));
  }

  private countMatches(query: string, patterns: RegExp[]): number {
    const normalized = query.toLowerCase().trim();
    return patterns.filter((p) => p.test(normalized)).length;
  }

  // ==================== File Actions Detection ====================

  /**
   * Check if query is a file action (list, filter, locate, open)
   */
  isFileActionQuery(query: string, lang: string = "en"): boolean {
    const normalizedLang = this.normalizeLang(lang);

    // Get patterns from runtime data
    const runtimePatterns =
      this.runtimeData?.intents?.file_actions?.patterns?.[normalizedLang] || [];
    if (runtimePatterns.length > 0) {
      const compiled = this.compilePatterns(
        `file_actions_${normalizedLang}`,
        runtimePatterns,
      );
      if (this.matchPatterns(query, compiled)) {
        return true;
      }
    }

    // Check bank file for richer patterns
    const bankKey = `file_actions_subintents.${normalizedLang}`;
    const bank = this.bankCache.get(bankKey);
    if (bank?.subintents) {
      for (const subIntent of Object.values(bank.subintents)) {
        if (
          subIntent.triggers?.some((t) =>
            query.toLowerCase().includes(t.toLowerCase()),
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if query is a location query ("where is X", "onde está X")
   */
  isLocationQuery(query: string, lang: string = "en"): boolean {
    const normalizedLang = this.normalizeLang(lang);
    const bankKey = `locate_content.${normalizedLang}`;
    const bank = this.bankCache.get(bankKey);

    if (bank?.triggers) {
      for (const trigger of bank.triggers) {
        try {
          const regex = new RegExp(trigger.pattern, "i");
          if (regex.test(query)) {
            return true;
          }
        } catch {
          // Plain text match
          if (query.toLowerCase().includes(trigger.pattern.toLowerCase())) {
            return true;
          }
        }
      }
    }

    // Fallback: basic patterns
    const basicPatterns: Record<string, RegExp[]> = {
      en: [
        /\bwhere\s+(is|are)\s+(the\s+)?(my\s+)?/i,
        /\b(find|locate|show\s+me)\s+(the\s+)?(file|document)/i,
        /\b(open|preview)\s+(the\s+)?(file|document)/i,
        /\bwhich\s+folder/i,
      ],
      pt: [
        /\bonde\s+(est[aá]|fica)/i,
        /\bcad[êe]\s+/i,
        /\bem\s+qual\s+(pasta|arquivo|documento)/i,
        /\blocalizar?\s+(o|a)?\s*(arquivo|documento)/i,
        /\b(abrir|visualizar)\s+(o|a)?\s*(arquivo|documento)/i,
      ],
      es: [
        /\bd[oó]nde\s+est[aá]/i,
        /\ben\s+qu[eé]\s+(carpeta|archivo|documento)/i,
        /\blocalizar?\s+(el|la)?\s*(archivo|documento)/i,
        /\b(abrir|ver)\s+(el|la)?\s*(archivo|documento)/i,
      ],
    };

    const patterns = basicPatterns[normalizedLang] || basicPatterns.en;
    return patterns.some((p) => p.test(query));
  }

  /**
   * Check if query is a followup referencing previous context
   */
  isFollowupQuery(query: string, lang: string = "en"): boolean {
    const normalizedLang = this.normalizeLang(lang);

    // Get overlays from runtime data
    const followupPatterns =
      this.runtimeData?.overlays?.followup?.[normalizedLang] || [];
    if (followupPatterns.length > 0) {
      const compiled = this.compilePatterns(
        `followup_${normalizedLang}`,
        followupPatterns,
      );
      if (this.matchPatterns(query, compiled)) {
        return true;
      }
    }

    // Check bank file
    const bankKey = `followup_inherit.${normalizedLang}`;
    const bank = this.bankCache.get(bankKey);
    if (bank?.triggers) {
      for (const trigger of bank.triggers) {
        try {
          const regex = new RegExp(trigger.pattern, "i");
          if (regex.test(query)) {
            return true;
          }
        } catch {
          if (query.toLowerCase().includes(trigger.pattern.toLowerCase())) {
            return true;
          }
        }
      }
    }

    // Fallback: basic followup indicators
    const basicPatterns: Record<string, RegExp[]> = {
      en: [
        /^(and|but|also|or)\s+/i,
        /\b(it|that|this|them|those)\b/i,
        /^(show|open|find)\s+(it|that)\.?$/i,
        /^(yes|no|ok|okay|yep|nope)(\s|$)/i,
      ],
      pt: [
        /^(e|mas|também|ou)\s+/i,
        /\b(isso|isto|ele|ela|aquilo)\b/i,
        /^(mostrar?|abrir?|ver)\s+(isso|isto)\.?$/i,
        /^(sim|não|ok|tá|beleza)(\s|$)/i,
        /^abrir\.?$/i,
      ],
      es: [
        /^(y|pero|también|o)\s+/i,
        /\b(eso|esto|él|ella|aquello)\b/i,
        /^(mostrar?|abrir?|ver)\s+(eso|esto)\.?$/i,
        /^(sí|no|ok|vale)(\s|$)/i,
      ],
    };

    const patterns = basicPatterns[normalizedLang] || basicPatterns.en;
    return patterns.some((p) => p.test(query));
  }

  // ==================== Intent/Operator Detection ====================

  /**
   * Get intent matches with confidence scores
   */
  getIntentMatches(query: string, lang: string = "en"): IntentMatch[] {
    const normalizedLang = this.normalizeLang(lang);
    const matches: IntentMatch[] = [];

    // Check each intent's patterns
    for (const [intentName, intent] of Object.entries(
      this.runtimeData?.intents || {},
    )) {
      const patterns = intent.patterns?.[normalizedLang] || [];
      const negatives = intent.negatives?.[normalizedLang] || [];

      const compiledPatterns = this.compilePatterns(
        `intent_${intentName}_${normalizedLang}`,
        patterns,
      );
      const compiledNegatives = this.compilePatterns(
        `intent_${intentName}_neg_${normalizedLang}`,
        negatives,
      );

      const matchCount = this.countMatches(query, compiledPatterns);
      const negCount = this.countMatches(query, compiledNegatives);

      if (matchCount > 0 && negCount === 0) {
        const confidence = Math.min(0.95, 0.5 + matchCount * 0.15);
        matches.push({
          intent: intentName,
          confidence,
          matchedPatterns: patterns.filter((_, i) =>
            compiledPatterns[i]?.test(query),
          ),
        });
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get operator matches with confidence scores
   */
  getOperatorMatches(query: string, lang: string = "en"): OperatorMatch[] {
    const normalizedLang = this.normalizeLang(lang);
    const matches: OperatorMatch[] = [];

    // Check each operator's patterns
    for (const [opName, op] of Object.entries(
      this.runtimeData?.operators || {},
    )) {
      const patterns = op.patterns?.[normalizedLang] || [];
      const negatives = op.negatives?.[normalizedLang] || [];

      const compiledPatterns = this.compilePatterns(
        `op_${opName}_${normalizedLang}`,
        patterns,
      );
      const compiledNegatives = this.compilePatterns(
        `op_${opName}_neg_${normalizedLang}`,
        negatives,
      );

      const matchCount = this.countMatches(query, compiledPatterns);
      const negCount = this.countMatches(query, compiledNegatives);

      if (matchCount > 0 && negCount === 0) {
        const confidence = Math.min(0.95, op.minConfidence + matchCount * 0.1);
        matches.push({
          operator: opName,
          confidence,
          matchedPatterns: patterns.filter((_, i) =>
            compiledPatterns[i]?.test(query),
          ),
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  // ==================== Format/Template Access ====================

  /**
   * Get format constraints for an operator
   */
  getFormatConstraints(operator: string): FormatConstraint | null {
    return this.runtimeData?.templates?.operatorTemplateMap?.[operator] || null;
  }

  /**
   * Get allowed output shapes for an operator
   */
  getAllowedShapes(operator: string): string[] {
    return this.runtimeData?.operators?.[operator]?.allowedOutputShapes || [];
  }

  /**
   * Get policy rules
   */
  getPolicies() {
    return (
      this.runtimeData?.policies || {
        bannedOpeners: [],
        bannedPhrases: [],
        completionGate: {
          forbidEllipsis: true,
          forbidDanglingMarkers: true,
          requireValidTableWhenRequested: true,
        },
      }
    );
  }

  // ==================== Scope Detection ====================

  /**
   * Detect file type from query using anchor nouns
   */
  detectFileType(query: string, lang: string = "en"): string | null {
    const normalizedLang = this.normalizeLang(lang);
    const anchorNouns = this.runtimeData?.scope?.typeRules?.anchorNouns || {};

    for (const [fileType, nouns] of Object.entries(anchorNouns)) {
      const langNouns =
        (nouns as Record<string, string[]>)[normalizedLang] || [];
      for (const noun of langNouns) {
        if (query.toLowerCase().includes(noun.toLowerCase())) {
          return fileType;
        }
      }
    }

    return null;
  }

  /**
   * Get confidence threshold for auto-scoping
   */
  getAutoScopeThreshold(intent: string): number {
    return (
      this.runtimeData?.scope?.confidencePolicy?.[intent]?.autoScopeThreshold ||
      0.6
    );
  }

  // ==================== Utilities ====================

  private normalizeLang(lang: string): string {
    const lower = lang.toLowerCase();
    if (lower.startsWith("pt")) return "pt";
    if (lower.startsWith("es")) return "es";
    return "en";
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return this.runtimeData?.languages || ["en", "pt"];
  }

  /**
   * Get default values
   */
  getDefaults() {
    return (
      this.runtimeData?.defaults || {
        language: "en",
        intent: "documents",
        operator: "summarize",
      }
    );
  }

  /**
   * Reload runtime data (for hot reloading)
   */
  reload(): void {
    this.compiledPatterns.clear();
    this.bankCache.clear();
    this.loadRuntimeData();
    this.loadBanks();
    console.log("[RuntimePatterns] Reloaded all data");
  }

  /**
   * Debug: get loaded bank keys
   */
  getLoadedBanks(): string[] {
    return Array.from(this.bankCache.keys());
  }
}

// Export singleton
export const runtimePatterns = RuntimePatternsService.getInstance();

// Export class for testing
export { RuntimePatternsService };
