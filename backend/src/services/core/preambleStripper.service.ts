/**
 * Preamble Stripper Service
 *
 * Deterministic removal of conversational preambles for answer-first responses.
 * ChatGPT-style: start with the answer, not "Here are the results..."
 *
 * Usage:
 * ```typescript
 * const stripper = new PreambleStripperService();
 * const cleaned = stripper.strip(text, operator, language);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { OperatorType } from './operatorResolver.service';

// Re-export for consumers who import from this module
export type { OperatorType };

export type SupportedLanguage = 'en' | 'pt' | 'es';

interface PreamblePolicy {
  policy: {
    default: 'allow' | 'deny';
  };
  allowlist: {
    operators: string[];
  };
  denylist: {
    operators: string[];
  };
  preamble_patterns: Record<SupportedLanguage, string[]>;
  exceptions: {
    conditions: Array<{
      name: string;
      check: string;
    }>;
  };
}

interface StripContext {
  hasError?: boolean;
  resultCount?: number;
  isPartial?: boolean;
  needsClarification?: boolean;
}

// ============================================================================
// Service
// ============================================================================

export class PreambleStripperService {
  private policy: PreamblePolicy | null = null;
  private compiledPatterns: Map<SupportedLanguage, RegExp[]> = new Map();

  constructor() {
    this.loadPolicy();
  }

  /**
   * Load the preamble policy from JSON
   */
  private loadPolicy(): void {
    try {
      const policyPath = path.join(
        __dirname,
        '../../data_banks/formatting/preamble_policy.json'
      );

      if (fs.existsSync(policyPath)) {
        const content = fs.readFileSync(policyPath, 'utf-8');
        this.policy = JSON.parse(content);
        this.compilePatterns();
        console.log('✅ [PreambleStripper] Policy loaded successfully');
      } else {
        console.warn('⚠️ [PreambleStripper] Policy file not found, using defaults');
        this.useDefaults();
      }
    } catch (error: any) {
      console.error('❌ [PreambleStripper] Failed to load policy:', error.message);
      this.useDefaults();
    }
  }

  /**
   * Use default patterns if policy file not available
   */
  private useDefaults(): void {
    this.policy = {
      policy: { default: 'deny' },
      allowlist: { operators: ['clarify', 'disambiguate', 'confirm', 'greet'] },
      denylist: { operators: ['list', 'filter', 'summarize', 'extract', 'explain'] },
      preamble_patterns: {
        en: [
          "^Here (is|are|'s) ",
          "^I found ",
          "^Based on ",
          "^Sure,? ",
          "^Let me "
        ],
        pt: [
          "^Aqui (está|estão) ",
          "^Encontrei ",
          "^Com base ",
          "^Claro,? ",
          "^Deixe-me "
        ],
        es: [
          "^Aquí (está|están) ",
          "^Encontré ",
          "^Basándome en ",
          "^Claro,? ",
          "^Déjame "
        ]
      },
      exceptions: { conditions: [] }
    };
    this.compilePatterns();
  }

  /**
   * Compile regex patterns for performance
   */
  private compilePatterns(): void {
    if (!this.policy) return;

    for (const lang of ['en', 'pt', 'es'] as SupportedLanguage[]) {
      const patterns = this.policy.preamble_patterns[lang] || [];
      const compiled = patterns.map(p => {
        try {
          return new RegExp(p, 'i');
        } catch {
          console.warn(`⚠️ [PreambleStripper] Invalid pattern: ${p}`);
          return null;
        }
      }).filter((r): r is RegExp => r !== null);

      this.compiledPatterns.set(lang, compiled);
    }
  }

  /**
   * Check if operator allows preambles
   */
  public allowsPreamble(operator: OperatorType): boolean {
    if (!this.policy) return false;

    // Check allowlist first
    if (this.policy.allowlist.operators.includes(operator)) {
      return true;
    }

    // Check denylist
    if (this.policy.denylist.operators.includes(operator)) {
      return false;
    }

    // Use default policy
    return this.policy.policy.default === 'allow';
  }

  /**
   * Check if context triggers an exception (preserve preamble)
   */
  private hasException(context?: StripContext): boolean {
    if (!context) return false;

    // Error responses may need context
    if (context.hasError) return true;

    // No results need explanation
    if (context.resultCount === 0) return true;

    // Partial results need caveat
    if (context.isPartial) return true;

    // Clarification needed
    if (context.needsClarification) return true;

    return false;
  }

  /**
   * Detect preamble in text
   */
  public detectPreamble(text: string, language: SupportedLanguage = 'en'): {
    found: boolean;
    pattern?: string;
    matchEnd?: number;
  } {
    const patterns = this.compiledPatterns.get(language) || [];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match) {
        return {
          found: true,
          pattern: regex.source,
          matchEnd: match.index! + match[0].length
        };
      }
    }

    return { found: false };
  }

  /**
   * Strip preamble from text
   */
  public stripPreamble(text: string, language: SupportedLanguage = 'en'): string {
    if (!text) return text;

    const trimmed = text.trim();
    if (trimmed.length === 0) return '';

    let result = trimmed;
    let changed = true;
    let iterations = 0;
    const maxIterations = 3; // Prevent infinite loops

    // Repeatedly strip until no more preambles found
    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      const detection = this.detectPreamble(result, language);
      if (detection.found && detection.matchEnd !== undefined) {
        // Get the remainder after the preamble
        let remainder = result.slice(detection.matchEnd);

        // Strip leading punctuation and whitespace
        remainder = remainder.replace(/^[,;:\s]+/, '').trim();

        // Capitalize first letter if needed
        if (remainder.length > 0) {
          remainder = remainder.charAt(0).toUpperCase() + remainder.slice(1);
        }

        result = remainder;
        changed = true;
      }
    }

    // Handle special case: "Here is X. Y Z" -> "Y Z" (strip entire first sentence if it's just intro)
    const introSentencePattern = /^(Here (is|are) .+?|I found .+?|Based on .+?)[.:](\s+)/i;
    const introMatch = result.match(introSentencePattern);
    if (introMatch) {
      const afterIntro = result.slice(introMatch[0].length).trim();
      // Only strip if there's substantial content after
      if (afterIntro.length > 20) {
        result = afterIntro.charAt(0).toUpperCase() + afterIntro.slice(1);
      }
    }

    return result;
  }

  /**
   * Main method: strip preamble based on operator and context
   */
  public strip(
    text: string,
    operator: OperatorType,
    language: SupportedLanguage = 'en',
    context?: StripContext
  ): string {
    if (!text || text.trim().length === 0) return text;

    // Check if operator allows preambles
    if (this.allowsPreamble(operator)) {
      return text;
    }

    // Check for exceptions
    if (this.hasException(context)) {
      return text;
    }

    // Strip the preamble
    return this.stripPreamble(text, language);
  }

  /**
   * Batch strip for multiple texts
   */
  public stripBatch(
    texts: string[],
    operator: OperatorType,
    language: SupportedLanguage = 'en'
  ): string[] {
    return texts.map(t => this.strip(t, operator, language));
  }

  /**
   * Get statistics about preamble patterns
   */
  public getStats(): {
    patternsLoaded: Record<SupportedLanguage, number>;
    allowlistSize: number;
    denylistSize: number;
  } {
    return {
      patternsLoaded: {
        en: this.compiledPatterns.get('en')?.length || 0,
        pt: this.compiledPatterns.get('pt')?.length || 0,
        es: this.compiledPatterns.get('es')?.length || 0,
      },
      allowlistSize: this.policy?.allowlist.operators.length || 0,
      denylistSize: this.policy?.denylist.operators.length || 0,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: PreambleStripperService | null = null;

export function getPreambleStripper(): PreambleStripperService {
  if (!instance) {
    instance = new PreambleStripperService();
  }
  return instance;
}

/**
 * Convenience function for quick stripping
 */
export function stripPreamble(
  text: string,
  operator: OperatorType,
  language: SupportedLanguage = 'en',
  context?: StripContext
): string {
  return getPreambleStripper().strip(text, operator, language, context);
}

// ============================================================================
// Exports
// ============================================================================

export default PreambleStripperService;
