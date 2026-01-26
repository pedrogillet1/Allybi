/**
 * Terminology Service
 *
 * Enforces consistent terminology in answers for ChatGPT-like output.
 * Ensures document terms are mirrored (not thesaurus-switched) and
 * uses preferred professional terminology per domain.
 *
 * Banks loaded:
 * - terminology_policy.any.json (global rules)
 * - terminology_policy.{domain}.any.json (domain-specific rules)
 * - lexicon_output_rules.any.json (output term selection)
 *
 * Usage:
 * ```typescript
 * const ts = getTerminologyService();
 * const text = ts.enforce(answer, { domain: 'finance', language: 'en' });
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type DomainType = 'finance' | 'legal' | 'accounting' | 'medical' | 'general';
export type LanguageCode = 'en' | 'pt' | 'es';

export interface TerminologyPolicy {
  _meta?: { version: string; purpose: string };
  banned_openers: string[];
  banned_phrases: string[];
  banned_closers?: string[];
  term_selection: {
    prefer_canonical: boolean;
    mirror_document_terms: boolean;
    avoid_synonym_switching: boolean;
  };
  domain_defaults: {
    register: string;
    abbreviation_policy: string;
    preserve_acronyms: boolean;
  };
}

export interface DomainTerminologyPolicy {
  _meta?: { version: string; domain: string };
  preferred_terms: Record<string, Record<string, string>>; // { en: { "term": "preferred" }, pt: {...} }
  forbidden_phrases: Record<string, string[]>; // { en: [...], pt: [...] }
  register?: string;
  use_abbreviations?: boolean;
}

export interface LexiconOutputRules {
  _meta?: { version: string };
  output_rules: {
    always_canonical: string[];
    prefer_full_form: string[];
    allow_abbreviation: string[];
    context_dependent: Array<{
      term: string;
      rules: Array<{ context: string; use: string }>;
    }>;
  };
  domain_overrides: Record<string, {
    always_canonical: string[];
    prefer_abbreviation: string[];
  }>;
}

export interface TerminologyContext {
  domain?: DomainType;
  language?: LanguageCode;
  documentTerms?: string[]; // Terms found in user's documents - mirror these
  operator?: string;
}

export interface TerminologyResult {
  text: string;
  replacements: Array<{ from: string; to: string; reason: string }>;
  bannedPhraseCount: number;
  modified: boolean;
}

// ============================================================================
// Service
// ============================================================================

export class TerminologyService {
  private globalPolicy: TerminologyPolicy | null = null;
  private domainPolicies: Map<DomainType, DomainTerminologyPolicy> = new Map();
  private outputRules: LexiconOutputRules | null = null;
  private bannedOpenerPatterns: RegExp[] = [];
  private bannedPhrasePatterns: RegExp[] = [];
  private initialized = false;

  constructor() {
    this.loadAllPolicies();
  }

  private loadAllPolicies(): void {
    const basePath = path.join(__dirname, '../../data_banks');

    // Load global policy
    try {
      const globalPath = path.join(basePath, 'formatting/terminology_policy.any.json');
      if (fs.existsSync(globalPath)) {
        this.globalPolicy = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
        this.compileGlobalPatterns();
        console.log('✅ [TerminologyService] Global policy loaded');
      }
    } catch (e: any) {
      console.warn('⚠️ [TerminologyService] Failed to load global policy:', e.message);
    }

    // Load domain policies
    const domains: DomainType[] = ['finance', 'legal', 'accounting', 'medical'];
    for (const domain of domains) {
      try {
        const domainPath = path.join(basePath, `formatting/terminology_policy.${domain}.any.json`);
        if (fs.existsSync(domainPath)) {
          const policy = JSON.parse(fs.readFileSync(domainPath, 'utf-8'));
          this.domainPolicies.set(domain, policy);
        }
      } catch (e: any) {
        console.warn(`⚠️ [TerminologyService] Failed to load ${domain} policy:`, e.message);
      }
    }

    // Load output rules
    try {
      const rulesPath = path.join(basePath, 'lexicons/lexicon_output_rules.any.json');
      if (fs.existsSync(rulesPath)) {
        this.outputRules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
        console.log('✅ [TerminologyService] Output rules loaded');
      }
    } catch (e: any) {
      console.warn('⚠️ [TerminologyService] Failed to load output rules:', e.message);
    }

    this.initialized = true;
    console.log(`✅ [TerminologyService] Initialized with ${this.domainPolicies.size} domain policies`);
  }

  private compileGlobalPatterns(): void {
    if (!this.globalPolicy) return;

    // Compile banned opener patterns (they're already regex patterns in the policy)
    this.bannedOpenerPatterns = this.globalPolicy.banned_openers.map((pattern) => {
      try {
        // If it starts with ^, it's a regex pattern
        if (pattern.startsWith('^')) {
          return new RegExp(pattern, 'i');
        }
        // Otherwise escape and match at start
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^\\s*${escaped}`, 'i');
      } catch {
        return new RegExp(`^\\s*${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      }
    });

    // Compile banned phrase patterns (can be regex or plain text)
    this.bannedPhrasePatterns = this.globalPolicy.banned_phrases.map((phrase) => {
      try {
        // Try as regex first (for patterns like "\\b...")
        if (phrase.includes('\\b') || phrase.includes('\\s') || phrase.includes('|')) {
          return new RegExp(phrase, 'gi');
        }
        // Plain text - escape and match
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped, 'gi');
      } catch {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped, 'gi');
      }
    });
  }

  /**
   * Main enforcement method - applies terminology rules to output text
   */
  enforce(text: string, ctx: TerminologyContext = {}): TerminologyResult {
    if (!this.initialized || !text) {
      return { text, replacements: [], bannedPhraseCount: 0, modified: false };
    }

    const domain = ctx.domain || 'general';
    const language = ctx.language || 'en';
    const replacements: Array<{ from: string; to: string; reason: string }> = [];
    let result = text;
    let bannedPhraseCount = 0;

    // 1. Strip banned openers
    for (const pattern of this.bannedOpenerPatterns) {
      const match = result.match(pattern);
      if (match) {
        result = result.replace(pattern, '').trimStart();
        replacements.push({ from: match[0], to: '', reason: 'banned_opener' });
      }
    }

    // 2. Strip banned phrases (but track them)
    for (const pattern of this.bannedPhrasePatterns) {
      const matches = result.match(pattern);
      if (matches) {
        bannedPhraseCount += matches.length;
        result = result.replace(pattern, '');
        for (const m of matches) {
          replacements.push({ from: m, to: '', reason: 'banned_phrase' });
        }
      }
    }

    // 3. Apply domain-specific preferred terms
    const domainPolicy = this.domainPolicies.get(domain as DomainType);
    if (domainPolicy?.preferred_terms?.[language]) {
      const preferred = domainPolicy.preferred_terms[language];
      for (const [term, preferredTerm] of Object.entries(preferred)) {
        const termPattern = new RegExp(`\\b${term}\\b`, 'gi');
        if (termPattern.test(result)) {
          result = result.replace(termPattern, preferredTerm);
          replacements.push({ from: term, to: preferredTerm, reason: 'domain_preferred' });
        }
      }
    }

    // 4. Apply domain forbidden phrases
    if (domainPolicy?.forbidden_phrases?.[language]) {
      for (const phrase of domainPolicy.forbidden_phrases[language]) {
        const phrasePattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = result.match(phrasePattern);
        if (matches) {
          bannedPhraseCount += matches.length;
          result = result.replace(phrasePattern, '');
          for (const m of matches) {
            replacements.push({ from: m, to: '', reason: 'domain_forbidden' });
          }
        }
      }
    }

    // 5. Mirror document terms (if provided) - don't replace doc terms with synonyms
    if (ctx.documentTerms && this.globalPolicy?.term_selection?.mirror_document_terms) {
      // This is mostly about NOT replacing - we preserve document terms
      // The actual mirroring happens by not having those terms in replacement lists
    }

    // Clean up multiple spaces and trim
    result = result.replace(/\s{2,}/g, ' ').trim();

    return {
      text: result,
      replacements,
      bannedPhraseCount,
      modified: result !== text,
    };
  }

  /**
   * Get the canonical/preferred term for output
   */
  selectTerm(
    term: string,
    domain: DomainType = 'general',
    language: LanguageCode = 'en'
  ): string {
    if (!this.initialized) return term;

    // Check domain policy preferred terms
    const domainPolicy = this.domainPolicies.get(domain);
    if (domainPolicy?.preferred_terms?.[language]) {
      const termLower = term.toLowerCase();
      for (const [key, preferred] of Object.entries(domainPolicy.preferred_terms[language])) {
        if (key.toLowerCase() === termLower) {
          return preferred;
        }
      }
    }

    // Check output rules for canonical preference
    if (this.outputRules?.output_rules?.always_canonical) {
      const termLower = term.toLowerCase();
      if (this.outputRules.output_rules.always_canonical.includes(termLower)) {
        // Return as-is (it's already canonical)
        return term;
      }
    }

    return term;
  }

  /**
   * Validate text against terminology rules without modifying
   */
  validate(text: string, ctx: TerminologyContext = {}): {
    valid: boolean;
    violations: string[];
  } {
    if (!this.initialized || !text) {
      return { valid: true, violations: [] };
    }

    const violations: string[] = [];
    const domain = ctx.domain || 'general';
    const language = ctx.language || 'en';

    // Check banned openers
    for (const pattern of this.bannedOpenerPatterns) {
      if (pattern.test(text)) {
        violations.push(`Starts with banned opener`);
      }
    }

    // Check banned phrases
    for (const pattern of this.bannedPhrasePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        violations.push(`Contains banned phrase: "${matches[0]}"`);
      }
    }

    // Check domain forbidden phrases
    const domainPolicy = this.domainPolicies.get(domain as DomainType);
    if (domainPolicy?.forbidden_phrases?.[language]) {
      for (const phrase of domainPolicy.forbidden_phrases[language]) {
        if (text.toLowerCase().includes(phrase.toLowerCase())) {
          violations.push(`Contains domain-forbidden phrase: "${phrase}"`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get loaded domain count for diagnostics
   */
  getDomainCount(): number {
    return this.domainPolicies.size;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: TerminologyService | null = null;

export function getTerminologyService(): TerminologyService {
  if (!instance) {
    instance = new TerminologyService();
  }
  return instance;
}
