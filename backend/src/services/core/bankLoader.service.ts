/**
 * BankLoaderService - Loads all data banks at runtime
 *
 * This service provides access to all trigger, negative, overlay, formatting,
 * normalizer, lexicon, and template banks for the Koda intent routing system.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface TriggerPattern {
  id: string;
  pattern: string;
  intent?: string;
  subintent?: string;
  lang?: string;
  examples?: string[];
  weight?: number;
  priority?: number;
}

export interface NegativePattern {
  id: string;
  pattern: string;
  blocks: string | string[];
  lang?: string;
  penalty?: number;
  reason?: string;
}

export interface OverlayPattern {
  id: string;
  pattern: string;
  lang?: string;
  action?: string;
  inherit_context?: boolean;
  constraint?: {
    type: string;
    capture_group?: number;
  };
}

export interface FormattingConstraint {
  id: string;
  pattern: string;
  lang?: string;
  constraint_type: string;
  value_group?: number;
}

export interface Validator {
  id: string;
  type: string;
  regex?: string;
  multiline?: boolean;
}

export interface Normalizer {
  id: string;
  pattern?: string;
  from?: string;
  to?: string;
  lang?: string;
  weight?: number;
}

export interface LexiconTerm {
  id: string;
  canonical: Record<string, string>;
  synonyms?: Record<string, string[]>;
  category?: string;
}

export interface Template {
  id: string;
  template: string;
  variants?: string[];
  lang?: string;
  style?: string;
  operator?: string;
}

export interface DataBank<T> {
  bank: string;
  version?: string;
  generated?: string;
  patterns?: T[];
  indicators?: T[];
  validators?: T[];
  rules?: T[];
  terms?: T[];
  templates?: T[];
}

// ============================================================================
// BANK LOADER SERVICE
// ============================================================================

export class BankLoaderService {
  private dataDir: string;
  private cache: Map<string, any> = new Map();
  private loaded = false;

  // Compiled regex cache for performance
  private compiledPatterns: Map<string, RegExp[]> = new Map();

  constructor() {
    this.dataDir = path.join(__dirname, '../../data_banks');
  }

  // ============================================================================
  // LOADING
  // ============================================================================

  /**
   * Load all banks into memory
   */
  async loadAll(): Promise<void> {
    if (this.loaded) return;

    console.log('[BankLoader] Loading data banks from:', this.dataDir);

    const categories = ['triggers', 'negatives', 'overlays', 'formatting', 'normalizers', 'lexicons', 'templates', 'aliases'];

    for (const category of categories) {
      await this.loadCategory(category);
    }

    this.loaded = true;
    console.log(`[BankLoader] Loaded ${this.cache.size} bank files`);
  }

  private async loadCategory(category: string): Promise<void> {
    const categoryDir = path.join(this.dataDir, category);

    if (!fs.existsSync(categoryDir)) {
      console.log(`[BankLoader] Category not found: ${category}`);
      return;
    }

    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(categoryDir, file);
      const bankName = `${category}/${file.replace('.json', '')}`;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        this.cache.set(bankName, data);
      } catch (error) {
        console.error(`[BankLoader] Failed to load ${bankName}:`, error);
      }
    }
  }

  // ============================================================================
  // TRIGGERS
  // ============================================================================

  /**
   * Get all trigger patterns for a specific intent
   */
  getTriggers(intentOrSubintent: string, lang?: string): TriggerPattern[] {
    const results: TriggerPattern[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('triggers/')) continue;

      const patterns = data.patterns || data.triggers || [];
      for (const pattern of patterns) {
        if (pattern.intent === intentOrSubintent || pattern.subintent === intentOrSubintent) {
          if (!lang || !pattern.lang || pattern.lang === lang) {
            results.push(pattern);
          }
        }
      }
    }

    return results;
  }

  /**
   * Get all trigger patterns for a language
   */
  getTriggersForLang(lang: string): TriggerPattern[] {
    const results: TriggerPattern[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('triggers/')) continue;

      // Check if bank is language-specific
      if (bankName.endsWith(`.${lang}`) || !bankName.includes('.')) {
        const patterns = data.patterns || data.triggers || [];
        for (const pattern of patterns) {
          if (!pattern.lang || pattern.lang === lang) {
            results.push(pattern);
          }
        }
      }
    }

    return results;
  }

  /**
   * Get compiled regex patterns for an intent (cached)
   */
  getCompiledTriggers(intentOrSubintent: string, lang?: string): RegExp[] {
    const cacheKey = `triggers:${intentOrSubintent}:${lang || 'all'}`;

    if (this.compiledPatterns.has(cacheKey)) {
      return this.compiledPatterns.get(cacheKey)!;
    }

    const patterns = this.getTriggers(intentOrSubintent, lang);
    const compiled = patterns
      .map(p => {
        try {
          return new RegExp(p.pattern, 'i');
        } catch {
          console.error(`[BankLoader] Invalid regex in ${p.id}: ${p.pattern}`);
          return null;
        }
      })
      .filter((r): r is RegExp => r !== null);

    this.compiledPatterns.set(cacheKey, compiled);
    return compiled;
  }

  // ============================================================================
  // NEGATIVES
  // ============================================================================

  /**
   * Get negative patterns that block a specific intent
   */
  getNegatives(blockedIntent: string, lang?: string): NegativePattern[] {
    const results: NegativePattern[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('negatives/')) continue;

      const patterns = data.patterns || data.negatives || [];
      for (const pattern of patterns) {
        const blocks = Array.isArray(pattern.blocks) ? pattern.blocks : [pattern.blocks];
        if (blocks.includes(blockedIntent)) {
          if (!lang || !pattern.lang || pattern.lang === lang) {
            results.push(pattern);
          }
        }
      }
    }

    return results;
  }

  /**
   * Get compiled negative patterns (cached)
   */
  getCompiledNegatives(blockedIntent: string, lang?: string): Array<{ regex: RegExp; penalty: number }> {
    const cacheKey = `negatives:${blockedIntent}:${lang || 'all'}`;

    if (this.compiledPatterns.has(cacheKey)) {
      return this.compiledPatterns.get(cacheKey) as any;
    }

    const patterns = this.getNegatives(blockedIntent, lang);
    const compiled = patterns
      .map(p => {
        try {
          return {
            regex: new RegExp(p.pattern, 'i'),
            penalty: p.penalty || -0.3
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is { regex: RegExp; penalty: number } => r !== null);

    this.compiledPatterns.set(cacheKey, compiled as any);
    return compiled;
  }

  // ============================================================================
  // OVERLAYS
  // ============================================================================

  /**
   * Get overlay patterns by type
   */
  getOverlays(type: 'followup' | 'format' | 'clarify' | 'drift' | 'scope', lang?: string): OverlayPattern[] {
    const results: OverlayPattern[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('overlays/')) continue;
      if (!bankName.includes(type)) continue;

      const patterns = data.patterns || data.overlays || [];
      for (const pattern of patterns) {
        if (!lang || !pattern.lang || pattern.lang === lang) {
          results.push(pattern);
        }
      }
    }

    return results;
  }

  /**
   * Get format constraint overlays
   */
  getFormatOverlays(lang?: string): OverlayPattern[] {
    return this.getOverlays('format', lang);
  }

  // ============================================================================
  // FORMATTING
  // ============================================================================

  /**
   * Get formatting constraints
   */
  getFormatConstraints(lang?: string): FormattingConstraint[] {
    const results: FormattingConstraint[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('formatting/')) continue;
      if (bankName.includes('validator') || bankName.includes('repair') || bankName.includes('readability')) continue;

      // Check language match
      if (lang && bankName.includes('.')) {
        const fileLang = bankName.split('.').pop();
        if (fileLang !== lang) continue;
      }

      const patterns = data.patterns || data.constraints || [];
      for (const pattern of patterns) {
        if (!lang || !pattern.lang || pattern.lang === lang) {
          results.push(pattern);
        }
      }
    }

    return results;
  }

  /**
   * Get validators
   */
  getValidators(): Validator[] {
    const results: Validator[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.includes('validator')) continue;

      const validators = data.validators || data.rules || [];
      results.push(...validators);
    }

    return results;
  }

  // ============================================================================
  // NORMALIZERS
  // ============================================================================

  /**
   * Get normalizers by type
   */
  getNormalizers(type: string): Normalizer[] {
    const results: Normalizer[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('normalizers/')) continue;
      if (!bankName.includes(type)) continue;

      const normalizers = data.normalizers || data.rules || data.patterns || [];
      results.push(...normalizers);
    }

    return results;
  }

  /**
   * Get language indicators for detection
   */
  getLanguageIndicators(): Normalizer[] {
    return this.getNormalizers('language');
  }

  /**
   * Get month normalizers
   */
  getMonthNormalizers(): Normalizer[] {
    return this.getNormalizers('month');
  }

  /**
   * Get filetype aliases
   */
  getFiletypeAliases(): Normalizer[] {
    const results: Normalizer[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (bankName.includes('filetype') || bankName.includes('document_type')) {
        const aliases = data.aliases || data.mappings || data.normalizers || [];
        results.push(...aliases);
      }
    }

    return results;
  }

  // ============================================================================
  // LEXICONS
  // ============================================================================

  /**
   * Get lexicon terms for a domain
   */
  getLexicon(domain: string): LexiconTerm[] {
    const results: LexiconTerm[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('lexicons/')) continue;
      if (!bankName.includes(domain)) continue;

      const terms = data.terms || data.lexicon || [];
      results.push(...terms);
    }

    return results;
  }

  /**
   * Get all finance terms
   */
  getFinanceLexicon(): LexiconTerm[] {
    return this.getLexicon('finance');
  }

  /**
   * Get all legal terms
   */
  getLegalLexicon(): LexiconTerm[] {
    return this.getLexicon('legal');
  }

  /**
   * Get all medical terms
   */
  getMedicalLexicon(): LexiconTerm[] {
    return this.getLexicon('medical');
  }

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  /**
   * Get templates by type
   */
  getTemplates(type: 'answer' | 'microcopy' | 'clarify' | 'error', lang?: string): Template[] {
    const results: Template[] = [];

    for (const [bankName, data] of this.cache.entries()) {
      if (!bankName.startsWith('templates/')) continue;
      if (!bankName.includes(type)) continue;

      const templates = data.templates || [];
      for (const template of templates) {
        if (!lang || !template.lang || template.lang === lang) {
          results.push(template);
        }
      }
    }

    return results;
  }

  /**
   * Get file actions microcopy templates
   */
  getFileActionsMicrocopy(lang: string): Template[] {
    return this.getTemplates('microcopy', lang);
  }

  /**
   * Get a random template for an operator
   */
  getRandomMicrocopy(operator: string, lang: string): Template | null {
    const templates = this.getFileActionsMicrocopy(lang);
    const matching = templates.filter(t => t.operator === operator);
    if (matching.length === 0) return null;
    return matching[Math.floor(Math.random() * matching.length)];
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get bank statistics
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const [bankName, data] of this.cache.entries()) {
      const category = bankName.split('/')[0];
      const count = data.patterns?.length || data.terms?.length || data.templates?.length ||
                    data.normalizers?.length || data.validators?.length || data.rules?.length || 0;

      stats[category] = (stats[category] || 0) + count;
    }

    return stats;
  }

  /**
   * Check if banks are loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get raw bank data
   */
  getBank(name: string): any {
    return this.cache.get(name);
  }

  /**
   * List all loaded banks
   */
  listBanks(): string[] {
    return Array.from(this.cache.keys());
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let bankLoaderInstance: BankLoaderService | null = null;

export function getBankLoader(): BankLoaderService {
  if (!bankLoaderInstance) {
    bankLoaderInstance = new BankLoaderService();
  }
  return bankLoaderInstance;
}

export async function initBankLoader(): Promise<BankLoaderService> {
  const loader = getBankLoader();
  await loader.loadAll();
  return loader;
}
