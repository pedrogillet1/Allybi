/**
 * Boilerplate Stripper Service
 *
 * Removes repetitive boilerplate phrases for ChatGPT-style direct answers.
 * Eliminates "Key points:", "Here's what I found:", etc.
 *
 * Usage:
 * ```typescript
 * const stripper = getBoilerplateStripper();
 * const clean = stripper.strip(text, 'en');
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface BoilerplateBlocklist {
  always_strip: Record<string, string[]>;
  strip_at_start: Record<string, string[]>;
  strip_at_end: Record<string, string[]>;
  strip_headers: Record<string, string[]>;
  conditional_strip: {
    rules: Array<{
      id: string;
      pattern: string;
      condition: string;
      reason: string;
    }>;
  };
  preserve: {
    patterns: string[];
  };
}

export interface StripContext {
  operator?: string;
  isFirstSentence?: boolean;
  preserveHeaders?: boolean;
}

export interface StripResult {
  text: string;
  strippedCount: number;
  strippedPhrases: string[];
  modified: boolean;
}

// ============================================================================
// Service
// ============================================================================

export class BoilerplateStripperService {
  private blocklist: BoilerplateBlocklist | null = null;
  private compiledStartPatterns: Map<string, RegExp[]> = new Map();
  private compiledEndPatterns: Map<string, RegExp[]> = new Map();
  private preservePatterns: RegExp[] = [];

  constructor() {
    this.loadBlocklist();
  }

  private loadBlocklist(): void {
    try {
      const blocklistPath = path.join(
        __dirname,
        '../../data_banks/formatting/boilerplate_blocklist.json'
      );

      if (fs.existsSync(blocklistPath)) {
        this.blocklist = JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'));
        this.compilePatterns();
        console.log('✅ [BoilerplateStripper] Blocklist loaded');
      } else {
        console.warn('⚠️ [BoilerplateStripper] Blocklist not found');
      }
    } catch (error: any) {
      console.error('❌ [BoilerplateStripper] Load failed:', error.message);
    }
  }

  private compilePatterns(): void {
    if (!this.blocklist) return;

    // Compile start patterns
    for (const [lang, patterns] of Object.entries(this.blocklist.strip_at_start)) {
      const compiled = patterns.map((p) => new RegExp(p, 'i'));
      this.compiledStartPatterns.set(lang, compiled);
    }

    // Compile end patterns
    for (const [lang, patterns] of Object.entries(this.blocklist.strip_at_end)) {
      const compiled = patterns.map((p) => new RegExp(p, 'i'));
      this.compiledEndPatterns.set(lang, compiled);
    }

    // Compile preserve patterns
    if (this.blocklist.preserve?.patterns) {
      this.preservePatterns = this.blocklist.preserve.patterns.map(
        (p) => new RegExp(p, 'i')
      );
    }
  }

  /**
   * Check if text contains a preserve pattern
   */
  private shouldPreserve(text: string): boolean {
    return this.preservePatterns.some((p) => p.test(text));
  }

  /**
   * Strip boilerplate from text
   */
  public strip(
    text: string,
    language: 'en' | 'pt' = 'en',
    context?: StripContext
  ): StripResult {
    if (!this.blocklist) {
      return { text, strippedCount: 0, strippedPhrases: [], modified: false };
    }

    let result = text;
    const strippedPhrases: string[] = [];

    // Check preserve patterns first
    if (this.shouldPreserve(text)) {
      return { text, strippedCount: 0, strippedPhrases: [], modified: false };
    }

    // 1. Strip exact phrases (always_strip)
    const alwaysStrip = this.blocklist.always_strip[language] || [];
    for (const phrase of alwaysStrip) {
      if (result.includes(phrase)) {
        result = result.replace(phrase, '');
        strippedPhrases.push(phrase);
      }
    }

    // 2. Strip headers (if not preserving)
    if (!context?.preserveHeaders) {
      const headers = this.blocklist.strip_headers[language] || [];
      for (const header of headers) {
        if (result.includes(header)) {
          result = result.replace(header, '');
          strippedPhrases.push(header);
        }
      }
    }

    // 3. Strip start patterns
    const startPatterns = this.compiledStartPatterns.get(language) || [];
    for (const pattern of startPatterns) {
      const match = result.match(pattern);
      if (match) {
        result = result.replace(pattern, '');
        strippedPhrases.push(match[0]);
      }
    }

    // 4. Strip end patterns
    const endPatterns = this.compiledEndPatterns.get(language) || [];
    for (const pattern of endPatterns) {
      const match = result.match(pattern);
      if (match) {
        result = result.replace(pattern, '');
        strippedPhrases.push(match[0]);
      }
    }

    // 5. Cleanup
    result = this.cleanup(result);

    return {
      text: result,
      strippedCount: strippedPhrases.length,
      strippedPhrases,
      modified: result !== text,
    };
  }

  /**
   * Strip only from the start of text
   */
  public stripStart(text: string, language: 'en' | 'pt' = 'en'): StripResult {
    if (!this.blocklist) {
      return { text, strippedCount: 0, strippedPhrases: [], modified: false };
    }

    let result = text;
    const strippedPhrases: string[] = [];

    // Check preserve patterns first
    if (this.shouldPreserve(text)) {
      return { text, strippedCount: 0, strippedPhrases: [], modified: false };
    }

    // Strip start patterns
    const startPatterns = this.compiledStartPatterns.get(language) || [];
    for (const pattern of startPatterns) {
      const match = result.match(pattern);
      if (match) {
        result = result.replace(pattern, '');
        strippedPhrases.push(match[0]);
      }
    }

    // Also strip exact phrases at start
    const alwaysStrip = this.blocklist.always_strip[language] || [];
    for (const phrase of alwaysStrip) {
      if (result.startsWith(phrase)) {
        result = result.slice(phrase.length);
        strippedPhrases.push(phrase);
      }
    }

    // Cleanup
    result = this.cleanup(result);

    return {
      text: result,
      strippedCount: strippedPhrases.length,
      strippedPhrases,
      modified: result !== text,
    };
  }

  /**
   * Strip only from the end of text
   */
  public stripEnd(text: string, language: 'en' | 'pt' = 'en'): StripResult {
    if (!this.blocklist) {
      return { text, strippedCount: 0, strippedPhrases: [], modified: false };
    }

    let result = text;
    const strippedPhrases: string[] = [];

    // Strip end patterns
    const endPatterns = this.compiledEndPatterns.get(language) || [];
    for (const pattern of endPatterns) {
      const match = result.match(pattern);
      if (match) {
        result = result.replace(pattern, '');
        strippedPhrases.push(match[0]);
      }
    }

    // Cleanup
    result = result.trimEnd();

    return {
      text: result,
      strippedCount: strippedPhrases.length,
      strippedPhrases,
      modified: result !== text,
    };
  }

  /**
   * Check if text starts with boilerplate
   */
  public startsWithBoilerplate(text: string, language: 'en' | 'pt' = 'en'): boolean {
    if (!this.blocklist) return false;

    // Check exact phrases
    const alwaysStrip = this.blocklist.always_strip[language] || [];
    for (const phrase of alwaysStrip) {
      if (text.startsWith(phrase)) return true;
    }

    // Check patterns
    const startPatterns = this.compiledStartPatterns.get(language) || [];
    for (const pattern of startPatterns) {
      if (pattern.test(text)) return true;
    }

    return false;
  }

  /**
   * Check if text ends with boilerplate
   */
  public endsWithBoilerplate(text: string, language: 'en' | 'pt' = 'en'): boolean {
    if (!this.blocklist) return false;

    const endPatterns = this.compiledEndPatterns.get(language) || [];
    for (const pattern of endPatterns) {
      if (pattern.test(text)) return true;
    }

    return false;
  }

  /**
   * Detect boilerplate in text
   */
  public detectBoilerplate(text: string, language: 'en' | 'pt' = 'en'): string[] {
    if (!this.blocklist) return [];

    const detected: string[] = [];

    // Check exact phrases
    const alwaysStrip = this.blocklist.always_strip[language] || [];
    for (const phrase of alwaysStrip) {
      if (text.includes(phrase)) {
        detected.push(phrase);
      }
    }

    // Check headers
    const headers = this.blocklist.strip_headers[language] || [];
    for (const header of headers) {
      if (text.includes(header)) {
        detected.push(header);
      }
    }

    return detected;
  }

  /**
   * Clean up text after stripping
   */
  private cleanup(text: string): string {
    let result = text;

    // Remove leading/trailing whitespace
    result = result.trim();

    // Remove multiple consecutive newlines
    result = result.replace(/\n{3,}/g, '\n\n');

    // Remove multiple consecutive spaces
    result = result.replace(/  +/g, ' ');

    // Remove orphaned bullet points
    result = result.replace(/^[•\-\*]\s*$/gm, '');

    // Capitalize first letter if needed
    if (result.length > 0 && /^[a-z]/.test(result)) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }

    return result;
  }

  /**
   * Get all blocklist phrases for a language
   */
  public getBlocklistPhrases(language: 'en' | 'pt' = 'en'): string[] {
    if (!this.blocklist) return [];

    const phrases: string[] = [];

    if (this.blocklist.always_strip[language]) {
      phrases.push(...this.blocklist.always_strip[language]);
    }

    if (this.blocklist.strip_headers[language]) {
      phrases.push(...this.blocklist.strip_headers[language]);
    }

    return phrases;
  }

  /**
   * Get service stats
   */
  public getStats(): {
    alwaysStripCount: number;
    startPatternCount: number;
    endPatternCount: number;
    headerCount: number;
    preservePatternCount: number;
  } {
    return {
      alwaysStripCount:
        (this.blocklist?.always_strip.en?.length || 0) +
        (this.blocklist?.always_strip.pt?.length || 0),
      startPatternCount:
        (this.compiledStartPatterns.get('en')?.length || 0) +
        (this.compiledStartPatterns.get('pt')?.length || 0),
      endPatternCount:
        (this.compiledEndPatterns.get('en')?.length || 0) +
        (this.compiledEndPatterns.get('pt')?.length || 0),
      headerCount:
        (this.blocklist?.strip_headers.en?.length || 0) +
        (this.blocklist?.strip_headers.pt?.length || 0),
      preservePatternCount: this.preservePatterns.length,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: BoilerplateStripperService | null = null;

export function getBoilerplateStripper(): BoilerplateStripperService {
  if (!instance) {
    instance = new BoilerplateStripperService();
  }
  return instance;
}

export default BoilerplateStripperService;
