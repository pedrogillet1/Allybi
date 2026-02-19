/**
 * Data Bank Registry
 *
 * Central registry for all generated data banks.
 * Loads patterns from JSON files and provides typed access.
 *
 * Usage:
 *   import { DataBankRegistry } from './data_banks/dataBankRegistry';
 *   const registry = DataBankRegistry.getInstance();
 *   const triggers = registry.getTriggers('documents_qa', 'en');
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES
// ============================================================================

export interface TriggerPattern {
  id: string;
  pattern: string;
  regex?: string;
  priority?: number;
  language: "en" | "pt";
}

export interface NegativePattern {
  id: string;
  pattern: string;
  blocks: string;
  priority?: number;
  language: "en" | "pt";
}

export interface FormattingConstraint {
  id: string;
  pattern: string;
  regex?: string;
  extractCount?: boolean;
  language: "en" | "pt";
}

export interface NormalizerEntry {
  id: string;
  input: string[];
  output: string;
  lang?: "en" | "pt" | "both";
}

export interface LexiconTerm {
  id: string;
  canonical_en: string;
  canonical_pt: string;
  aliases_en: string[];
  aliases_pt: string[];
  category?: string;
}

export interface OperatorVerbBank {
  bank_id: string;
  language: "en" | "pt";
  version: string;
  operators: {
    [operator: string]: {
      verbs: string[];
      phrases: string[];
    };
  };
}

export interface OperatorTrigger {
  id: string;
  pattern: string;
  operator: string;
  priority: number;
  confidence: number;
}

export interface OperatorNegative {
  id: string;
  blocked_operator: string;
  correct_operator?: string;
  pattern: string;
  reason: string;
}

export interface PreamblePattern {
  id: string;
  pattern: string;
  languages: string[];
  reason: string;
}

// Domain-specific types
export interface DomainLexiconEntry {
  canonical: string;
  aliases: string[];
  type?: string;
  aggregatable?: boolean;
}

export interface DomainLexicon {
  _meta: {
    version: string;
    totalTerms: number;
    domain: string;
    language: string;
  };
  categories?: Record<string, Record<string, DomainLexiconEntry>>;
  terms?: Array<{ canonical: string; aliases: string[] }>;
}

export interface DomainExtractor {
  description: string;
  patterns: string[];
}

export interface DomainExtractorBank {
  _meta: {
    version: string;
    totalPatterns: number;
    domain: string;
    language: string;
  };
  extractors: Record<string, DomainExtractor>;
}

export interface DomainTemplate {
  description: string;
  variants: string[];
}

export interface DomainTemplateBank {
  _meta: {
    version: string;
    totalTemplates: number;
    language: string;
  };
  templates: Record<string, Record<string, DomainTemplate>>;
}

export interface DomainProbe {
  id: string;
  query: string;
  expected_domain: string;
  expected_operator: string;
  reason: string;
}

export interface DomainProbeBank {
  _meta: {
    version: string;
    totalProbes: number;
    domain: string;
    language: string;
  };
  probes: DomainProbe[];
}

export interface DomainScopeRule {
  domain: string;
  preferred_file_types: string[];
  required_signals: string[];
  boost_factor: number;
}

export type DomainType =
  | "finance"
  | "accounting"
  | "legal"
  | "medical"
  | "excel";

export interface OperatorPriorityConfig {
  bank_id: string;
  version: string;
  priority_stack: Array<{
    rank: number;
    operator: string;
    base_priority: number;
    requires_context?: string[];
    anchor_nouns?: string[];
    anchor_verbs?: string[];
    description: string;
  }>;
  guard_rules: Array<{
    id: string;
    name: string;
    condition: string;
    resolution: string;
    priority: string;
  }>;
  content_anchors: {
    nouns: string[];
    verbs: string[];
  };
  path_anchors: {
    nouns: string[];
    verbs: string[];
  };
  filter_qualifiers: {
    en: string[];
    pt: string[];
  };
}

export type LanguageCode = "en" | "pt";

// ============================================================================
// REGISTRY
// ============================================================================

export class DataBankRegistry {
  private static instance: DataBankRegistry;
  private basePath: string;

  // Caches
  private triggers: Map<string, TriggerPattern[]> = new Map();
  private negatives: Map<string, NegativePattern[]> = new Map();
  private formatting: Map<string, FormattingConstraint[]> = new Map();
  private normalizers: Map<string, NormalizerEntry[]> = new Map();
  private lexicons: Map<string, LexiconTerm[]> = new Map();

  // Operator backbone caches
  private operatorVerbs: Map<string, OperatorVerbBank> = new Map();
  private operatorTriggers: Map<string, OperatorTrigger[]> = new Map();
  private operatorNegatives: Map<string, OperatorNegative[]> = new Map();
  private preambleForbidden: PreamblePattern[] = [];
  private preambleAllowed: PreamblePattern[] = [];
  private operatorPriority: OperatorPriorityConfig | null = null;
  private overlays: Map<string, any[]> = new Map();

  // Domain-specific caches
  private domainLexicons: Map<string, DomainLexicon> = new Map();
  private domainExtractors: Map<string, DomainExtractorBank> = new Map();
  private domainTemplates: Map<string, DomainTemplateBank> = new Map();
  private domainClarifyTemplates: Map<string, DomainTemplateBank> = new Map();
  private domainProbes: Map<string, DomainProbeBank> = new Map();
  private domainScopeRules: DomainScopeRule[] = [];
  private domainHeaders: Map<string, string[]> = new Map();
  private domainNegatives: Map<string, any[]> = new Map();

  private loaded = false;

  private constructor() {
    this.basePath = path.join(__dirname);
  }

  static getInstance(): DataBankRegistry {
    if (!DataBankRegistry.instance) {
      DataBankRegistry.instance = new DataBankRegistry();
    }
    return DataBankRegistry.instance;
  }

  // -------------------------------------------------------------------------
  // LOADING
  // -------------------------------------------------------------------------

  loadAll(): void {
    if (this.loaded) return;

    console.log("[DataBankRegistry] Loading data banks...");

    this.loadTriggers();
    this.loadNegatives();
    this.loadFormatting();
    this.loadNormalizers();
    this.loadLexicons();
    this.loadOperatorBackbone();
    this.loadOverlays();
    this.loadDomainBanks();

    this.loaded = true;
    console.log("[DataBankRegistry] All banks loaded");
  }

  private loadTriggers(): void {
    const dir = path.join(this.basePath, "triggers");
    if (!fs.existsSync(dir)) {
      console.log("[DataBankRegistry] No triggers directory");
      return;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const key = file.replace(".json", "");
      const data = this.loadJson<TriggerPattern[]>(path.join(dir, file));
      if (data) {
        this.triggers.set(key, data);
      }
    }
    console.log(
      `[DataBankRegistry] Loaded ${this.triggers.size} trigger banks`,
    );
  }

  private loadNegatives(): void {
    const dir = path.join(this.basePath, "negatives");
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const key = file.replace(".json", "");
      const data = this.loadJson<NegativePattern[]>(path.join(dir, file));
      if (data) {
        this.negatives.set(key, data);
      }
    }
    console.log(
      `[DataBankRegistry] Loaded ${this.negatives.size} negative banks`,
    );
  }

  private loadFormatting(): void {
    const dir = path.join(this.basePath, "formatting");
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const key = file.replace(".json", "");
      const data = this.loadJson<FormattingConstraint[]>(path.join(dir, file));
      if (data) {
        this.formatting.set(key, data);
      }
    }
    console.log(
      `[DataBankRegistry] Loaded ${this.formatting.size} formatting banks`,
    );
  }

  private loadNormalizers(): void {
    const dir = path.join(this.basePath, "normalizers");
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const key = file.replace(".json", "");
      const data = this.loadJson<NormalizerEntry[]>(path.join(dir, file));
      if (data) {
        this.normalizers.set(key, data);
      }
    }
    console.log(
      `[DataBankRegistry] Loaded ${this.normalizers.size} normalizer banks`,
    );
  }

  private loadLexicons(): void {
    const dir = path.join(this.basePath, "lexicons");
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const key = file.replace(".json", "");
      const data = this.loadJson<LexiconTerm[]>(path.join(dir, file));
      if (data) {
        this.lexicons.set(key, data);
      }
    }
    console.log(
      `[DataBankRegistry] Loaded ${this.lexicons.size} lexicon banks`,
    );
  }

  private loadOperatorBackbone(): void {
    // Load operator verbs (source banks)
    const normDir = path.join(this.basePath, "normalizers");
    for (const lang of ["en", "pt"] as const) {
      const verbFile = path.join(normDir, `operator_verbs.${lang}.json`);
      if (fs.existsSync(verbFile)) {
        const data = this.loadJson<OperatorVerbBank>(verbFile);
        if (data) {
          this.operatorVerbs.set(lang, data);
        }
      }
    }

    // Load operator triggers (compiled)
    const trigDir = path.join(this.basePath, "triggers");
    for (const lang of ["en", "pt"] as const) {
      const trigFile = path.join(trigDir, `operator_triggers.${lang}.json`);
      if (fs.existsSync(trigFile)) {
        const data = this.loadJson<{ triggers: OperatorTrigger[] }>(trigFile);
        if (data?.triggers) {
          this.operatorTriggers.set(lang, data.triggers);
        }
      }
    }

    // Load operator negatives (compiled)
    const negDir = path.join(this.basePath, "negatives");
    for (const lang of ["en", "pt"] as const) {
      const negFile = path.join(negDir, `operator_negatives.${lang}.json`);
      if (fs.existsSync(negFile)) {
        const data = this.loadJson<{ negatives: OperatorNegative[] }>(negFile);
        if (data?.negatives) {
          this.operatorNegatives.set(lang, data.negatives);
        }
      }
    }

    // Load preamble patterns
    const fmtDir = path.join(this.basePath, "formatting");
    const forbiddenFile = path.join(fmtDir, "preamble_forbidden.any.json");
    if (fs.existsSync(forbiddenFile)) {
      const data = this.loadJson<{ patterns: PreamblePattern[] }>(
        forbiddenFile,
      );
      if (data?.patterns) {
        this.preambleForbidden = data.patterns;
      }
    }
    const allowedFile = path.join(fmtDir, "preamble_allowed.any.json");
    if (fs.existsSync(allowedFile)) {
      const data = this.loadJson<{ exceptions: PreamblePattern[] }>(
        allowedFile,
      );
      if (data?.exceptions) {
        this.preambleAllowed = data.exceptions;
      }
    }

    // Load operator priority config
    const overlayDir = path.join(this.basePath, "overlays");
    const priorityFile = path.join(overlayDir, "operator_priority.any.json");
    if (fs.existsSync(priorityFile)) {
      this.operatorPriority =
        this.loadJson<OperatorPriorityConfig>(priorityFile);
    }

    const verbCount = Array.from(this.operatorVerbs.values()).reduce(
      (sum, b) =>
        sum +
        Object.values(b.operators || {}).reduce(
          (s, o) => s + (o.verbs?.length || 0) + (o.phrases?.length || 0),
          0,
        ),
      0,
    );
    const trigCount = Array.from(this.operatorTriggers.values()).reduce(
      (sum, t) => sum + t.length,
      0,
    );
    const negCount = Array.from(this.operatorNegatives.values()).reduce(
      (sum, n) => sum + n.length,
      0,
    );

    console.log(
      `[DataBankRegistry] Loaded operator backbone: ${verbCount} verbs/phrases, ${trigCount} triggers, ${negCount} negatives`,
    );
  }

  private loadOverlays(): void {
    const dir = path.join(this.basePath, "overlays");
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const key = file.replace(".json", "");
      const data = this.loadJson<any>(path.join(dir, file));
      if (data) {
        // Handle both array and object formats
        if (Array.isArray(data)) {
          this.overlays.set(key, data);
        } else if (data.patterns) {
          this.overlays.set(key, data.patterns);
        } else if (data.frames) {
          this.overlays.set(key, data.frames);
        } else {
          this.overlays.set(key, [data]);
        }
      }
    }
    console.log(
      `[DataBankRegistry] Loaded ${this.overlays.size} overlay banks`,
    );
  }

  private loadDomainBanks(): void {
    const domains: DomainType[] = [
      "finance",
      "accounting",
      "legal",
      "medical",
      "excel",
    ];
    const languages = ["en", "pt"] as const;

    // Load domain lexicons
    const lexDir = path.join(this.basePath, "lexicons");
    if (fs.existsSync(lexDir)) {
      for (const domain of domains) {
        for (const lang of languages) {
          const file = path.join(lexDir, `${domain}.${lang}.json`);
          if (fs.existsSync(file)) {
            const data = this.loadJson<DomainLexicon>(file);
            if (data) {
              this.domainLexicons.set(`${domain}.${lang}`, data);
            }
          }
        }
      }
    }

    // Load domain headers (from triggers)
    const trigDir = path.join(this.basePath, "triggers");
    if (fs.existsSync(trigDir)) {
      for (const lang of languages) {
        const headerFile = path.join(trigDir, `domain_headers.${lang}.json`);
        if (fs.existsSync(headerFile)) {
          const data = this.loadJson<any>(headerFile);
          if (data?.families) {
            for (const [familyId, family] of Object.entries(
              data.families as Record<string, any>,
            )) {
              const domain = family.domain as DomainType;
              if (domain && family.patterns) {
                this.domainHeaders.set(`${domain}.${lang}`, family.patterns);
              }
            }
          }
        }
      }
    }

    // Load domain entity extractors
    const extractorPatterns = [
      { domain: "finance", file: "finance_entity_extractors" },
      { domain: "accounting", file: "accounting_entity_extractors" },
      { domain: "legal", file: "legal_clause_extractors" },
      { domain: "medical", file: "medical_extractors" },
    ];
    for (const { domain, file } of extractorPatterns) {
      for (const lang of languages) {
        const extractorFile = path.join(trigDir, `${file}.${lang}.json`);
        if (fs.existsSync(extractorFile)) {
          const data = this.loadJson<DomainExtractorBank>(extractorFile);
          if (data) {
            this.domainExtractors.set(`${domain}.${lang}`, data);
          }
        }
      }
    }

    // Load domain templates
    const templatesDir = path.join(this.basePath, "templates");
    if (fs.existsSync(templatesDir)) {
      for (const lang of languages) {
        const templateFile = path.join(
          templatesDir,
          `domain_templates.${lang}.json`,
        );
        if (fs.existsSync(templateFile)) {
          const data = this.loadJson<DomainTemplateBank>(templateFile);
          if (data) {
            this.domainTemplates.set(lang, data);
          }
        }

        const clarifyFile = path.join(
          templatesDir,
          `domain_clarify_templates.${lang}.json`,
        );
        if (fs.existsSync(clarifyFile)) {
          const data = this.loadJson<DomainTemplateBank>(clarifyFile);
          if (data) {
            this.domainClarifyTemplates.set(lang, data);
          }
        }
      }
    }

    // Load domain scope rules
    const overlayDir = path.join(this.basePath, "overlays");
    const scopeFile = path.join(overlayDir, "domain_scope_rules.any.json");
    if (fs.existsSync(scopeFile)) {
      const data = this.loadJson<{ rules?: DomainScopeRule[] }>(scopeFile);
      if (data?.rules) {
        this.domainScopeRules = data.rules;
      }
    }

    // Load domain negatives
    const negDir = path.join(this.basePath, "negatives");
    const domainNegFiles = [
      "not_domain_when_no_signal",
      "not_legal_when_no_clause_signal",
      "not_finance_when_no_metric_signal",
      "not_medical_when_no_med_signal",
    ];
    for (const negType of domainNegFiles) {
      for (const lang of languages) {
        const negFile = path.join(negDir, `${negType}.${lang}.json`);
        if (fs.existsSync(negFile)) {
          const data = this.loadJson<{ blockers?: any[] }>(negFile);
          if (data?.blockers) {
            this.domainNegatives.set(`${negType}.${lang}`, data.blockers);
          }
        }
      }
    }

    // Load domain probes
    const probeTypes = ["finance", "legal", "accounting", "medical"];
    for (const domain of probeTypes) {
      for (const lang of languages) {
        const probeFile = path.join(
          overlayDir,
          `domain_probe_${domain}.${lang}.json`,
        );
        if (fs.existsSync(probeFile)) {
          const data = this.loadJson<DomainProbeBank>(probeFile);
          if (data) {
            this.domainProbes.set(`${domain}.${lang}`, data);
          }
        }
      }
    }

    // Log domain bank stats
    const lexiconCount = this.domainLexicons.size;
    const headerCount = this.domainHeaders.size;
    const extractorCount = this.domainExtractors.size;
    const templateCount = this.domainTemplates.size;
    const probeCount = this.domainProbes.size;
    const negCount = this.domainNegatives.size;

    console.log(
      `[DataBankRegistry] Loaded domain banks: ${lexiconCount} lexicons, ${headerCount} header sets, ${extractorCount} extractors, ${templateCount} templates, ${probeCount} probes, ${negCount} negative sets`,
    );
  }

  private loadJson<T>(filePath: string): T | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.error(`[DataBankRegistry] Failed to load ${filePath}: ${e}`);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // GETTERS
  // -------------------------------------------------------------------------

  getTriggers(intent: string, lang: LanguageCode): TriggerPattern[] {
    this.ensureLoaded();
    return this.triggers.get(`${intent}.${lang}`) || [];
  }

  getAllTriggers(lang: LanguageCode): Map<string, TriggerPattern[]> {
    this.ensureLoaded();
    const result = new Map<string, TriggerPattern[]>();
    for (const [key, patterns] of this.triggers) {
      if (key.endsWith(`.${lang}`)) {
        const intent = key.replace(`.${lang}`, "");
        result.set(intent, patterns);
      }
    }
    return result;
  }

  getNegatives(category: string, lang: LanguageCode): NegativePattern[] {
    this.ensureLoaded();
    return this.negatives.get(`${category}.${lang}`) || [];
  }

  getAllNegatives(lang: LanguageCode): NegativePattern[] {
    this.ensureLoaded();
    const result: NegativePattern[] = [];
    for (const [key, patterns] of this.negatives) {
      if (key.endsWith(`.${lang}`)) {
        result.push(...patterns);
      }
    }
    return result;
  }

  getFormatting(type: string, lang: LanguageCode): FormattingConstraint[] {
    this.ensureLoaded();
    return this.formatting.get(`${type}.${lang}`) || [];
  }

  getAllFormatting(lang: LanguageCode): FormattingConstraint[] {
    this.ensureLoaded();
    const result: FormattingConstraint[] = [];
    for (const [key, patterns] of this.formatting) {
      if (key.endsWith(`.${lang}`)) {
        result.push(...patterns);
      }
    }
    return result;
  }

  getNormalizer(type: string): NormalizerEntry[] {
    this.ensureLoaded();
    return this.normalizers.get(type) || [];
  }

  getLexicon(domain: string): LexiconTerm[] {
    this.ensureLoaded();
    return this.lexicons.get(domain) || [];
  }

  getAllLexiconTerms(): LexiconTerm[] {
    this.ensureLoaded();
    const result: LexiconTerm[] = [];
    for (const terms of this.lexicons.values()) {
      result.push(...terms);
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // OPERATOR BACKBONE GETTERS
  // -------------------------------------------------------------------------

  /**
   * Get operator verbs/phrases for a language
   */
  getOperatorVerbs(lang: LanguageCode): OperatorVerbBank | null {
    this.ensureLoaded();
    return this.operatorVerbs.get(lang) || null;
  }

  /**
   * Get verbs for a specific operator
   */
  getVerbsForOperator(operator: string, lang: LanguageCode): string[] {
    this.ensureLoaded();
    const bank = this.operatorVerbs.get(lang);
    if (!bank?.operators?.[operator]) return [];
    return [
      ...(bank.operators[operator].verbs || []),
      ...(bank.operators[operator].phrases || []),
    ];
  }

  /**
   * Get all operator triggers for a language
   */
  getOperatorTriggers(lang: LanguageCode): OperatorTrigger[] {
    this.ensureLoaded();
    return this.operatorTriggers.get(lang) || [];
  }

  /**
   * Get triggers for a specific operator
   */
  getTriggersForOperator(
    operator: string,
    lang: LanguageCode,
  ): OperatorTrigger[] {
    this.ensureLoaded();
    const triggers = this.operatorTriggers.get(lang) || [];
    return triggers.filter((t) => t.operator === operator);
  }

  /**
   * Get all operator negatives for a language
   */
  getOperatorNegatives(lang: LanguageCode): OperatorNegative[] {
    this.ensureLoaded();
    return this.operatorNegatives.get(lang) || [];
  }

  /**
   * Get negatives that block a specific operator
   */
  getNegativesBlockingOperator(
    operator: string,
    lang: LanguageCode,
  ): OperatorNegative[] {
    this.ensureLoaded();
    const negs = this.operatorNegatives.get(lang) || [];
    return negs.filter((n) => n.blocked_operator === operator);
  }

  /**
   * Get forbidden preamble patterns
   */
  getPreambleForbidden(): PreamblePattern[] {
    this.ensureLoaded();
    return this.preambleForbidden;
  }

  /**
   * Get allowed preamble exceptions
   */
  getPreambleAllowed(): PreamblePattern[] {
    this.ensureLoaded();
    return this.preambleAllowed;
  }

  /**
   * Get operator priority configuration
   */
  getOperatorPriority(): OperatorPriorityConfig | null {
    this.ensureLoaded();
    return this.operatorPriority;
  }

  /**
   * Get overlay patterns by name
   */
  getOverlay(name: string): any[] {
    this.ensureLoaded();
    return this.overlays.get(name) || [];
  }

  // -------------------------------------------------------------------------
  // DOMAIN-SPECIFIC GETTERS
  // -------------------------------------------------------------------------

  /**
   * Get domain lexicon for a specific domain and language
   */
  getDomainLexicon(
    domain: DomainType,
    lang: LanguageCode,
  ): DomainLexicon | null {
    this.ensureLoaded();
    return this.domainLexicons.get(`${domain}.${lang}`) || null;
  }

  /**
   * Get all terms from a domain lexicon as a flat array
   */
  getDomainLexiconTerms(domain: DomainType, lang: LanguageCode): string[] {
    this.ensureLoaded();
    const lexicon = this.domainLexicons.get(`${domain}.${lang}`);
    if (!lexicon) return [];

    const terms: string[] = [];

    // Handle categorized format
    if (lexicon.categories) {
      for (const category of Object.values(lexicon.categories)) {
        for (const entry of Object.values(category)) {
          terms.push(entry.canonical);
          if (entry.aliases) {
            terms.push(...entry.aliases);
          }
        }
      }
    }

    // Handle flat terms format
    if (lexicon.terms) {
      for (const term of lexicon.terms) {
        terms.push(term.canonical);
        if (term.aliases) {
          terms.push(...term.aliases);
        }
      }
    }

    return terms;
  }

  /**
   * Get domain headers (detection patterns) for a domain
   */
  getDomainHeaders(domain: DomainType, lang: LanguageCode): string[] {
    this.ensureLoaded();
    return this.domainHeaders.get(`${domain}.${lang}`) || [];
  }

  /**
   * Get all domain headers for a language
   */
  getAllDomainHeaders(lang: LanguageCode): Map<DomainType, string[]> {
    this.ensureLoaded();
    const result = new Map<DomainType, string[]>();
    const domains: DomainType[] = [
      "finance",
      "accounting",
      "legal",
      "medical",
      "excel",
    ];
    for (const domain of domains) {
      const headers = this.domainHeaders.get(`${domain}.${lang}`);
      if (headers && headers.length > 0) {
        result.set(domain, headers);
      }
    }
    return result;
  }

  /**
   * Get domain entity extractors
   */
  getDomainExtractors(
    domain: DomainType,
    lang: LanguageCode,
  ): DomainExtractorBank | null {
    this.ensureLoaded();
    return this.domainExtractors.get(`${domain}.${lang}`) || null;
  }

  /**
   * Get extractor patterns for a specific type
   */
  getExtractorPatterns(
    domain: DomainType,
    extractorType: string,
    lang: LanguageCode,
  ): string[] {
    this.ensureLoaded();
    const bank = this.domainExtractors.get(`${domain}.${lang}`);
    if (!bank?.extractors?.[extractorType]) return [];
    return bank.extractors[extractorType].patterns || [];
  }

  /**
   * Get domain templates
   */
  getDomainTemplates(lang: LanguageCode): DomainTemplateBank | null {
    this.ensureLoaded();
    return this.domainTemplates.get(lang) || null;
  }

  /**
   * Get template variants for a domain and template type
   */
  getTemplateVariants(
    domain: DomainType,
    templateType: string,
    lang: LanguageCode,
  ): string[] {
    this.ensureLoaded();
    const bank = this.domainTemplates.get(lang);
    if (!bank?.templates?.[domain]?.[templateType]) return [];
    return bank.templates[domain][templateType].variants || [];
  }

  /**
   * Get domain clarify templates
   */
  getDomainClarifyTemplates(lang: LanguageCode): DomainTemplateBank | null {
    this.ensureLoaded();
    return this.domainClarifyTemplates.get(lang) || null;
  }

  /**
   * Get clarify template variants
   */
  getClarifyVariants(
    domain: DomainType,
    clarifyType: string,
    lang: LanguageCode,
  ): string[] {
    this.ensureLoaded();
    const bank = this.domainClarifyTemplates.get(lang);
    if (!bank?.templates?.[domain]?.[clarifyType]) return [];
    return bank.templates[domain][clarifyType].variants || [];
  }

  /**
   * Get domain scope rules
   */
  getDomainScopeRules(): DomainScopeRule[] {
    this.ensureLoaded();
    return this.domainScopeRules;
  }

  /**
   * Get scope rule for a specific domain
   */
  getScopeRuleForDomain(domain: DomainType): DomainScopeRule | null {
    this.ensureLoaded();
    return this.domainScopeRules.find((r) => r.domain === domain) || null;
  }

  /**
   * Get domain negatives
   */
  getDomainNegatives(negType: string, lang: LanguageCode): any[] {
    this.ensureLoaded();
    return this.domainNegatives.get(`${negType}.${lang}`) || [];
  }

  /**
   * Get domain probes for validation
   */
  getDomainProbes(
    domain: DomainType,
    lang: LanguageCode,
  ): DomainProbeBank | null {
    this.ensureLoaded();
    return this.domainProbes.get(`${domain}.${lang}`) || null;
  }

  /**
   * Detect domain from query using domain headers and lexicon overlap
   */
  detectDomain(
    query: string,
    lang: LanguageCode,
  ): { domain: DomainType; confidence: number; signals: string[] } | null {
    this.ensureLoaded();
    const lowerQuery = query.toLowerCase();
    const domains: DomainType[] = [
      "finance",
      "accounting",
      "legal",
      "medical",
      "excel",
    ];

    let bestMatch: {
      domain: DomainType;
      confidence: number;
      signals: string[];
    } | null = null;

    for (const domain of domains) {
      const signals: string[] = [];
      let score = 0;

      // Check domain headers
      const headers = this.domainHeaders.get(`${domain}.${lang}`) || [];
      for (const header of headers) {
        if (lowerQuery.includes(header.toLowerCase())) {
          signals.push(`header:${header}`);
          score += 2;
        }
      }

      // Check lexicon terms (sample for performance)
      const lexicon = this.domainLexicons.get(`${domain}.${lang}`);
      if (lexicon?.categories) {
        for (const category of Object.values(lexicon.categories)) {
          for (const entry of Object.values(category)) {
            if (lowerQuery.includes(entry.canonical.toLowerCase())) {
              signals.push(`lexicon:${entry.canonical}`);
              score += 1;
            }
          }
        }
      }

      // Check if blocked by domain negatives
      const negatives =
        this.domainNegatives.get(`not_domain_when_no_signal.${lang}`) || [];
      let blocked = false;
      for (const neg of negatives) {
        if (neg.pattern && new RegExp(neg.pattern, "i").test(query)) {
          blocked = true;
          break;
        }
      }

      if (!blocked && score > 0) {
        const confidence = Math.min(score / 10, 1.0);
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { domain, confidence, signals };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Match query against operator triggers and return best match
   */
  matchOperator(
    query: string,
    lang: LanguageCode,
  ): { operator: string; confidence: number; triggerId: string } | null {
    this.ensureLoaded();
    const triggers = this.operatorTriggers.get(lang) || [];
    const lowerQuery = query.toLowerCase();

    let bestMatch: {
      operator: string;
      confidence: number;
      triggerId: string;
      priority: number;
    } | null = null;

    for (const trigger of triggers) {
      try {
        const regex = new RegExp(trigger.pattern, "i");
        if (regex.test(lowerQuery)) {
          // Check if blocked by negatives
          const negs = this.operatorNegatives.get(lang) || [];
          let blocked = false;
          for (const neg of negs) {
            if (neg.blocked_operator === trigger.operator) {
              const negRegex = new RegExp(neg.pattern, "i");
              if (negRegex.test(lowerQuery)) {
                blocked = true;
                break;
              }
            }
          }

          if (!blocked) {
            const score = trigger.priority * trigger.confidence;
            if (
              !bestMatch ||
              score > bestMatch.priority * bestMatch.confidence
            ) {
              bestMatch = {
                operator: trigger.operator,
                confidence: trigger.confidence,
                triggerId: trigger.id,
                priority: trigger.priority,
              };
            }
          }
        }
      } catch {
        // Invalid regex, skip
      }
    }

    if (bestMatch) {
      return {
        operator: bestMatch.operator,
        confidence: bestMatch.confidence,
        triggerId: bestMatch.triggerId,
      };
    }
    return null;
  }

  /**
   * Check if text has forbidden preamble
   */
  hasForbiddenPreamble(
    text: string,
    lang: "en" | "pt",
  ): { pattern: PreamblePattern; match: string } | null {
    this.ensureLoaded();
    for (const p of this.preambleForbidden) {
      if (p.languages.includes(lang) || p.languages.includes("any")) {
        try {
          const regex = new RegExp(p.pattern, "i");
          const match = text.match(regex);
          if (match) {
            return { pattern: p, match: match[0] };
          }
        } catch {
          // Invalid regex
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // PATTERN MATCHING HELPERS
  // -------------------------------------------------------------------------

  /**
   * Check if query matches any trigger pattern for an intent
   */
  matchesTrigger(query: string, intent: string, lang: LanguageCode): boolean {
    const triggers = this.getTriggers(intent, lang);
    const lowerQuery = query.toLowerCase();

    for (const trigger of triggers) {
      if (trigger.regex) {
        try {
          const regex = new RegExp(trigger.regex, "i");
          if (regex.test(query)) return true;
        } catch {
          // Invalid regex, skip
        }
      }

      if (lowerQuery.includes(trigger.pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if query matches any negative pattern
   */
  matchesNegative(query: string, lang: LanguageCode): NegativePattern | null {
    const negatives = this.getAllNegatives(lang);
    const lowerQuery = query.toLowerCase();

    for (const negative of negatives) {
      if (lowerQuery.includes(negative.pattern.toLowerCase())) {
        return negative;
      }
    }

    return null;
  }

  /**
   * Detect format request in query
   */
  detectFormatRequest(
    query: string,
    lang: LanguageCode,
  ): FormattingConstraint | null {
    const constraints = this.getAllFormatting(lang);
    const lowerQuery = query.toLowerCase();

    for (const constraint of constraints) {
      if (constraint.regex) {
        try {
          const regex = new RegExp(constraint.regex, "i");
          if (regex.test(query)) return constraint;
        } catch {
          // Invalid regex, skip
        }
      }

      if (lowerQuery.includes(constraint.pattern.toLowerCase())) {
        return constraint;
      }
    }

    return null;
  }

  /**
   * Normalize input using normalizer bank
   */
  normalize(input: string, type: string): string {
    const entries = this.getNormalizer(type);
    const lowerInput = input.toLowerCase();

    for (const entry of entries) {
      for (const variant of entry.input) {
        if (lowerInput.includes(variant.toLowerCase())) {
          return input.replace(new RegExp(variant, "gi"), entry.output);
        }
      }
    }

    return input;
  }

  /**
   * Find matching lexicon term
   */
  findLexiconTerm(term: string, lang: LanguageCode): LexiconTerm | null {
    const allTerms = this.getAllLexiconTerms();
    const lowerTerm = term.toLowerCase();

    for (const lexTerm of allTerms) {
      const canonical =
        lang === "en" ? lexTerm.canonical_en : lexTerm.canonical_pt;
      const aliases = lang === "en" ? lexTerm.aliases_en : lexTerm.aliases_pt;

      if (canonical.toLowerCase() === lowerTerm) return lexTerm;
      if (aliases.some((a) => a.toLowerCase() === lowerTerm)) return lexTerm;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): {
    triggers: number;
    negatives: number;
    formatting: number;
    normalizers: number;
    lexicons: number;
    operatorTriggers: number;
    operatorNegatives: number;
    operatorVerbs: number;
    preamblePatterns: number;
    overlays: number;
  } {
    this.ensureLoaded();

    let triggerCount = 0;
    let negativeCount = 0;
    let formattingCount = 0;
    let normalizerCount = 0;
    let lexiconCount = 0;
    let opTriggerCount = 0;
    let opNegativeCount = 0;
    let opVerbCount = 0;
    let overlayCount = 0;

    for (const patterns of this.triggers.values())
      triggerCount += patterns.length;
    for (const patterns of this.negatives.values())
      negativeCount += patterns.length;
    for (const patterns of this.formatting.values())
      formattingCount += patterns.length;
    for (const entries of this.normalizers.values())
      normalizerCount += entries.length;
    for (const terms of this.lexicons.values()) lexiconCount += terms.length;
    for (const triggers of this.operatorTriggers.values())
      opTriggerCount += triggers.length;
    for (const negs of this.operatorNegatives.values())
      opNegativeCount += negs.length;
    for (const bank of this.operatorVerbs.values()) {
      for (const op of Object.values(bank.operators || {})) {
        opVerbCount += (op.verbs?.length || 0) + (op.phrases?.length || 0);
      }
    }
    for (const overlay of this.overlays.values())
      overlayCount += overlay.length;

    return {
      triggers: triggerCount,
      negatives: negativeCount,
      formatting: formattingCount,
      normalizers: normalizerCount,
      lexicons: lexiconCount,
      operatorTriggers: opTriggerCount,
      operatorNegatives: opNegativeCount,
      operatorVerbs: opVerbCount,
      preamblePatterns:
        this.preambleForbidden.length + this.preambleAllowed.length,
      overlays: overlayCount,
    };
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      this.loadAll();
    }
  }

  // -------------------------------------------------------------------------
  // HOT RELOAD (for development)
  // -------------------------------------------------------------------------

  reload(): void {
    console.log("[DataBankRegistry] Reloading all banks...");
    this.triggers.clear();
    this.negatives.clear();
    this.formatting.clear();
    this.normalizers.clear();
    this.lexicons.clear();
    this.operatorVerbs.clear();
    this.operatorTriggers.clear();
    this.operatorNegatives.clear();
    this.preambleForbidden = [];
    this.preambleAllowed = [];
    this.operatorPriority = null;
    this.overlays.clear();
    this.loaded = false;
    this.loadAll();
  }
}

// Export singleton getter
export function getDataBankRegistry(): DataBankRegistry {
  return DataBankRegistry.getInstance();
}
