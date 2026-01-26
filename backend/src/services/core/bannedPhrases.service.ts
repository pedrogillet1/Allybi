/**
 * Banned Phrases Service
 *
 * BANK-DRIVEN: Loads patterns from banned_phrases.any.json
 *
 * Provides:
 * - Hard blocked phrases (must trigger regeneration or stripping)
 * - Soft blocked phrases (should be stripped/avoided)
 * - Robotic phrases (should be replaced with natural alternatives)
 * - Source section patterns (should be removed, converted to attachments)
 * - Filename citation patterns (should use source buttons instead)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export type LanguageCode = 'en' | 'pt' | 'es';

export interface BannedPhrasesBank {
  _meta?: {
    id: string;
    version: string;
    description: string;
  };
  hardBlocked: {
    description: string;
    patterns: Record<LanguageCode, string[]>;
  };
  softBlocked: {
    description: string;
    patterns: Record<LanguageCode, string[]>;
    contextExceptions?: Record<string, string[]>;
  };
  roboticPhrases: {
    description: string;
    patterns: Record<LanguageCode, string[]>;
    replacements?: Record<string, string>;
  };
  sourcesSection: {
    description: string;
    patterns: string[];
  };
  filenameCitations: {
    description: string;
    patterns: string[];
  };
  enforcement: {
    hardBlocked: { action: string; maxAttempts: number; fallbackAction: string };
    softBlocked: { action: string; logWarning: boolean };
    roboticPhrases: { action: string; fallbackAction: string };
    sourcesSection: { action: string; convertToAttachment: boolean };
    filenameCitations: { action: string; convertToSourceButton: boolean };
  };
}

export interface BannedPhraseMatch {
  phrase: string;
  category: 'hardBlocked' | 'softBlocked' | 'roboticPhrases' | 'sourcesSection' | 'filenameCitations';
  replacement?: string;
}

export interface BannedPhraseCheckResult {
  hasHardBlocked: boolean;
  hasSoftBlocked: boolean;
  hasRoboticPhrases: boolean;
  hasSourcesSection: boolean;
  hasFilenameCitations: boolean;
  matches: BannedPhraseMatch[];
}

// ============================================================================
// SERVICE
// ============================================================================

export class BannedPhrasesService {
  private static instance: BannedPhrasesService;
  private bank: BannedPhrasesBank | null = null;
  private compiledPatterns: Map<string, RegExp[]> = new Map();

  private constructor() {
    this.loadBank();
  }

  static getInstance(): BannedPhrasesService {
    if (!BannedPhrasesService.instance) {
      BannedPhrasesService.instance = new BannedPhrasesService();
    }
    return BannedPhrasesService.instance;
  }

  private loadBank(): void {
    try {
      const bankPath = path.join(__dirname, '../../data/banks/quality/banned_phrases.any.json');
      if (fs.existsSync(bankPath)) {
        this.bank = JSON.parse(fs.readFileSync(bankPath, 'utf-8'));
        this.compilePatterns();
        console.log('✅ [BannedPhrases] Loaded banned_phrases.any.json');
      } else {
        console.warn('⚠️ [BannedPhrases] Bank file not found at:', bankPath);
      }
    } catch (error: any) {
      console.error('❌ [BannedPhrases] Failed to load bank:', error.message);
    }
  }

  private compilePatterns(): void {
    if (!this.bank) return;

    // Compile hard blocked patterns per language
    for (const lang of ['en', 'pt', 'es'] as LanguageCode[]) {
      const hardPatterns = this.bank.hardBlocked.patterns[lang] || [];
      const compiled = hardPatterns.map(p => this.phraseToRegex(p));
      this.compiledPatterns.set(`hardBlocked_${lang}`, compiled);

      const softPatterns = this.bank.softBlocked.patterns[lang] || [];
      const softCompiled = softPatterns.map(p => this.phraseToRegex(p));
      this.compiledPatterns.set(`softBlocked_${lang}`, softCompiled);

      const roboticPatterns = this.bank.roboticPhrases.patterns[lang] || [];
      const roboticCompiled = roboticPatterns.map(p => this.phraseToRegex(p));
      this.compiledPatterns.set(`roboticPhrases_${lang}`, roboticCompiled);
    }

    // Compile sources section patterns (language-independent)
    const sourcePatterns = this.bank.sourcesSection.patterns || [];
    const sourceCompiled = sourcePatterns.map(p => {
      try {
        // Handle escaped newlines in the pattern
        const unescaped = p.replace(/\\n/g, '\n');
        return new RegExp(this.escapeForRegex(unescaped), 'i');
      } catch {
        return new RegExp(this.escapeForRegex(p), 'i');
      }
    });
    this.compiledPatterns.set('sourcesSection', sourceCompiled);

    // Compile filename citation patterns (regex patterns)
    const filenamePatterns = this.bank.filenameCitations.patterns || [];
    const filenameCompiled = filenamePatterns.map(p => {
      try {
        return new RegExp(p, 'gi');
      } catch {
        return null;
      }
    }).filter((r): r is RegExp => r !== null);
    this.compiledPatterns.set('filenameCitations', filenameCompiled);
  }

  private escapeForRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private phraseToRegex(phrase: string): RegExp {
    // Escape special regex characters and make case-insensitive
    const escaped = this.escapeForRegex(phrase);
    return new RegExp(escaped, 'i');
  }

  /**
   * Check text for banned phrases
   */
  check(text: string, language: LanguageCode = 'en'): BannedPhraseCheckResult {
    const matches: BannedPhraseMatch[] = [];

    if (!this.bank) {
      return {
        hasHardBlocked: false,
        hasSoftBlocked: false,
        hasRoboticPhrases: false,
        hasSourcesSection: false,
        hasFilenameCitations: false,
        matches: [],
      };
    }

    // Check hard blocked
    const hardPatterns = this.compiledPatterns.get(`hardBlocked_${language}`) || [];
    const hardPhrases = this.bank.hardBlocked.patterns[language] || [];
    for (let i = 0; i < hardPatterns.length; i++) {
      if (hardPatterns[i].test(text)) {
        matches.push({ phrase: hardPhrases[i], category: 'hardBlocked' });
      }
    }

    // Check soft blocked
    const softPatterns = this.compiledPatterns.get(`softBlocked_${language}`) || [];
    const softPhrases = this.bank.softBlocked.patterns[language] || [];
    for (let i = 0; i < softPatterns.length; i++) {
      if (softPatterns[i].test(text)) {
        matches.push({ phrase: softPhrases[i], category: 'softBlocked' });
      }
    }

    // Check robotic phrases
    const roboticPatterns = this.compiledPatterns.get(`roboticPhrases_${language}`) || [];
    const roboticPhrases = this.bank.roboticPhrases.patterns[language] || [];
    for (let i = 0; i < roboticPatterns.length; i++) {
      if (roboticPatterns[i].test(text)) {
        const replacement = this.bank.roboticPhrases.replacements?.[roboticPhrases[i]];
        matches.push({ phrase: roboticPhrases[i], category: 'roboticPhrases', replacement });
      }
    }

    // Check sources section
    const sourcePatterns = this.compiledPatterns.get('sourcesSection') || [];
    for (const pattern of sourcePatterns) {
      if (pattern.test(text)) {
        matches.push({ phrase: pattern.source, category: 'sourcesSection' });
        break; // Only need to flag once
      }
    }

    // Check filename citations
    const filenamePatterns = this.compiledPatterns.get('filenameCitations') || [];
    for (const pattern of filenamePatterns) {
      if (pattern.test(text)) {
        matches.push({ phrase: pattern.source, category: 'filenameCitations' });
        break; // Only need to flag once
      }
    }

    return {
      hasHardBlocked: matches.some(m => m.category === 'hardBlocked'),
      hasSoftBlocked: matches.some(m => m.category === 'softBlocked'),
      hasRoboticPhrases: matches.some(m => m.category === 'roboticPhrases'),
      hasSourcesSection: matches.some(m => m.category === 'sourcesSection'),
      hasFilenameCitations: matches.some(m => m.category === 'filenameCitations'),
      matches,
    };
  }

  /**
   * Strip soft blocked and robotic phrases from text
   */
  strip(text: string, language: LanguageCode = 'en'): { text: string; strippedCount: number } {
    if (!this.bank) return { text, strippedCount: 0 };

    let result = text;
    let strippedCount = 0;

    // Strip soft blocked phrases
    const softPhrases = this.bank.softBlocked.patterns[language] || [];
    for (const phrase of softPhrases) {
      const before = result;
      result = result.replace(new RegExp(this.escapeForRegex(phrase), 'gi'), '');
      if (result !== before) strippedCount++;
    }

    // Replace robotic phrases
    const roboticPhrases = this.bank.roboticPhrases.patterns[language] || [];
    const replacements = this.bank.roboticPhrases.replacements || {};
    for (const phrase of roboticPhrases) {
      const replacement = replacements[phrase] || '';
      const before = result;
      result = result.replace(new RegExp(this.escapeForRegex(phrase), 'gi'), replacement);
      if (result !== before) strippedCount++;
    }

    // Strip sources sections
    for (const pattern of this.bank.sourcesSection.patterns) {
      try {
        const unescaped = pattern.replace(/\\n/g, '\n');
        const regex = new RegExp(this.escapeForRegex(unescaped) + '[\\s\\S]*$', 'i');
        const before = result;
        result = result.replace(regex, '');
        if (result !== before) strippedCount++;
      } catch {
        // Skip invalid patterns
      }
    }

    // Clean up whitespace
    result = result.trim().replace(/\n{3,}/g, '\n\n');

    return { text: result, strippedCount };
  }

  /**
   * Check if text contains any hard blocked phrases
   */
  hasHardBlocked(text: string, language: LanguageCode = 'en'): boolean {
    return this.check(text, language).hasHardBlocked;
  }

  /**
   * Get all hard blocked patterns for a language
   */
  getHardBlockedPhrases(language: LanguageCode = 'en'): string[] {
    return this.bank?.hardBlocked.patterns[language] || [];
  }

  /**
   * Get service stats
   */
  getStats(): {
    hardBlockedCount: Record<string, number>;
    softBlockedCount: Record<string, number>;
    roboticPhrasesCount: Record<string, number>;
    sourcesPatternsCount: number;
    filenamePatternsCount: number;
  } {
    return {
      hardBlockedCount: {
        en: this.bank?.hardBlocked.patterns.en?.length || 0,
        pt: this.bank?.hardBlocked.patterns.pt?.length || 0,
        es: this.bank?.hardBlocked.patterns.es?.length || 0,
      },
      softBlockedCount: {
        en: this.bank?.softBlocked.patterns.en?.length || 0,
        pt: this.bank?.softBlocked.patterns.pt?.length || 0,
        es: this.bank?.softBlocked.patterns.es?.length || 0,
      },
      roboticPhrasesCount: {
        en: this.bank?.roboticPhrases.patterns.en?.length || 0,
        pt: this.bank?.roboticPhrases.patterns.pt?.length || 0,
        es: this.bank?.roboticPhrases.patterns.es?.length || 0,
      },
      sourcesPatternsCount: this.bank?.sourcesSection.patterns?.length || 0,
      filenamePatternsCount: this.bank?.filenameCitations.patterns?.length || 0,
    };
  }

  /**
   * Check if bank is loaded
   */
  isLoaded(): boolean {
    return this.bank !== null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: BannedPhrasesService | null = null;

export function getBannedPhrases(): BannedPhrasesService {
  if (!instance) {
    instance = BannedPhrasesService.getInstance();
  }
  return instance;
}

export default BannedPhrasesService;
