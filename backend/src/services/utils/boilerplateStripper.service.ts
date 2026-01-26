/**
 * BoilerplateStripperService
 *
 * Bank-driven preamble and boilerplate removal for ChatGPT-quality responses.
 * Replaces hardcoded regex patterns with data-bank driven approach.
 *
 * CERT-110 COMPLIANT: Ensures responses don't start with robotic preambles.
 */

import * as fs from 'fs';
import * as path from 'path';

// Using 'any' for logger type to match existing codebase patterns
type Logger = any;

interface ForbiddenPattern {
  id: string;
  family: string;
  pattern: string;
  lang: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  regex?: string;
}

interface AllowedPattern {
  id: string;
  pattern: string;
  context: string;
  lang: string;
  purpose: string;
}

interface RegexPattern {
  id: string;
  family: string;
  regex: string;
  lang: string;
  note?: string;
}

interface PreambleForbiddenBank {
  bank_id: string;
  language: string;
  version: string;
  forbidden: ForbiddenPattern[];
  regexPatterns?: RegexPattern[];
}

interface PreambleAllowedBank {
  bank_id: string;
  language: string;
  version: string;
  allowed: AllowedPattern[];
}

export interface StripResult {
  stripped: string;
  wasStripped: boolean;
  matchedPatterns: string[];
  matchedFamily?: string;
}

export class BoilerplateStripperService {
  private forbiddenBank: PreambleForbiddenBank | null = null;
  private allowedBank: PreambleAllowedBank | null = null;
  private forbiddenPatterns: Map<string, RegExp> = new Map();
  private allowedPatterns: Set<string> = new Set();
  private compiledRegex: RegExp[] = [];
  private initialized = false;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Load and compile patterns from bank files
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dataPath = path.join(__dirname, '../../data_banks/formatting');

    try {
      // Load forbidden bank
      const forbiddenPath = path.join(dataPath, 'preamble_forbidden.any.json');
      if (fs.existsSync(forbiddenPath)) {
        const content = fs.readFileSync(forbiddenPath, 'utf-8');
        this.forbiddenBank = JSON.parse(content);
        this.compileForbiddenPatterns();
        this.logger.info(`BoilerplateStripper: Loaded ${this.forbiddenBank?.forbidden?.length || 0} forbidden patterns`);
      }

      // Load allowed bank
      const allowedPath = path.join(dataPath, 'preamble_allowed.any.json');
      if (fs.existsSync(allowedPath)) {
        const content = fs.readFileSync(allowedPath, 'utf-8');
        this.allowedBank = JSON.parse(content);
        this.compileAllowedPatterns();
        this.logger.info(`BoilerplateStripper: Loaded ${this.allowedBank?.allowed?.length || 0} allowed patterns`);
      }

      this.initialized = true;
    } catch (error) {
      this.logger.error('BoilerplateStripper: Failed to load banks', { error });
      // Fall through - will use empty patterns which means no stripping
    }
  }

  /**
   * Compile forbidden patterns into regex
   */
  private compileForbiddenPatterns(): void {
    if (!this.forbiddenBank) return;

    // Compile string patterns (case-insensitive, start of string)
    for (const entry of this.forbiddenBank.forbidden) {
      // If explicit regex provided, use it; otherwise escape and anchor the pattern
      if (entry.regex) {
        try {
          const regex = new RegExp(entry.regex, 'i');
          this.forbiddenPatterns.set(entry.id, regex);
        } catch (e) {
          this.logger.warn(`BoilerplateStripper: Invalid regex for ${entry.id}: ${entry.regex}`);
        }
      } else {
        // Escape special regex chars and anchor to start
        const escaped = entry.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^${escaped}\\s*[:,]?\\s*`, 'i');
        this.forbiddenPatterns.set(entry.id, regex);
      }
    }

    // Compile additional regex patterns
    if (this.forbiddenBank.regexPatterns) {
      for (const entry of this.forbiddenBank.regexPatterns) {
        try {
          const regex = new RegExp(entry.regex, 'i');
          this.compiledRegex.push(regex);
        } catch (e) {
          this.logger.warn(`BoilerplateStripper: Invalid regex ${entry.id}: ${entry.regex}`);
        }
      }
    }
  }

  /**
   * Compile allowed patterns into lookup set
   */
  private compileAllowedPatterns(): void {
    if (!this.allowedBank) return;

    for (const entry of this.allowedBank.allowed) {
      this.allowedPatterns.add(entry.pattern.toLowerCase());
    }
  }

  /**
   * Check if text starts with an allowed pattern (e.g., disambiguation)
   */
  isAllowed(text: string): boolean {
    const trimmed = text.trim().toLowerCase();
    for (const allowed of this.allowedPatterns) {
      if (trimmed.startsWith(allowed.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Strip preambles from text
   * @param text - Input text to process
   * @param intent - Optional intent for context-aware stripping
   * @returns StripResult with stripped text and metadata
   */
  strip(text: string, intent?: string): StripResult {
    if (!text || text.length === 0) {
      return { stripped: text, wasStripped: false, matchedPatterns: [] };
    }

    // Don't strip for clarification/disambiguation intents
    if (intent && ['clarify', 'disambiguate', 'help'].includes(intent)) {
      return { stripped: text, wasStripped: false, matchedPatterns: [] };
    }

    // Check if starts with allowed pattern
    if (this.isAllowed(text)) {
      return { stripped: text, wasStripped: false, matchedPatterns: [] };
    }

    let result = text;
    const matchedPatterns: string[] = [];
    let matchedFamily: string | undefined;
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops

    // Keep stripping until no more matches (handles nested preambles)
    let didMatch = true;
    while (didMatch && iterations < maxIterations) {
      didMatch = false;
      iterations++;

      // Try string patterns first (faster)
      for (const [id, regex] of this.forbiddenPatterns) {
        const match = result.match(regex);
        if (match && match.index === 0) {
          result = result.replace(regex, '').trim();
          matchedPatterns.push(id);

          // Track family from ID (e.g., "F4_001" -> "F4_key_main_are")
          const familyMatch = id.match(/^(F\d+)/);
          if (familyMatch) {
            matchedFamily = familyMatch[1];
          }

          didMatch = true;
          break; // Restart loop after match
        }
      }

      // If no string pattern matched, try compiled regex
      if (!didMatch) {
        for (const regex of this.compiledRegex) {
          const match = result.match(regex);
          if (match && match.index === 0) {
            result = result.replace(regex, '').trim();
            matchedPatterns.push(`regex:${regex.source.slice(0, 30)}...`);
            didMatch = true;
            break;
          }
        }
      }
    }

    // Clean up orphaned punctuation after stripping
    result = result
      .replace(/^[,.:;]+\s*/, '')
      .replace(/^\s+/, '')
      .trim();

    // Capitalize first letter if we stripped something
    if (matchedPatterns.length > 0 && result.length > 0) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }

    return {
      stripped: result,
      wasStripped: matchedPatterns.length > 0,
      matchedPatterns,
      matchedFamily,
    };
  }

  /**
   * Strip both preambles and closers from text
   */
  stripFull(text: string, intent?: string): StripResult {
    // First strip preambles
    const preambleResult = this.strip(text, intent);

    // Then strip closers (robotic endings)
    let result = preambleResult.stripped;
    const closerPatterns = [
      /\s*Would you like (me to |more |any )?.*\?\s*$/i,
      /\s*Do you (want|need) (me to |more |any )?.*\?\s*$/i,
      /\s*Let me know if you('d like| need| want).*$/i,
      /\s*Feel free to ask.*$/i,
      /\s*Is there anything else.*\?\s*$/i,
      /\s*Gostaria (de )?(mais |que eu )?.*\?\s*$/i,
      /\s*Quer (que eu |mais |saber )?.*\?\s*$/i,
      /\s*Posso ajudar com (mais )?algo.*\?\s*$/i,
    ];

    for (const pattern of closerPatterns) {
      result = result.replace(pattern, '');
    }

    return {
      ...preambleResult,
      stripped: result.trim(),
      wasStripped: preambleResult.wasStripped || result !== preambleResult.stripped,
    };
  }

  /**
   * Get statistics about loaded patterns
   */
  getStats(): { forbiddenCount: number; allowedCount: number; regexCount: number } {
    return {
      forbiddenCount: this.forbiddenPatterns.size,
      allowedCount: this.allowedPatterns.size,
      regexCount: this.compiledRegex.length,
    };
  }
}

// Singleton instance for reuse
let singletonInstance: BoilerplateStripperService | null = null;

export function getBoilerplateStripper(logger: Logger): BoilerplateStripperService {
  if (!singletonInstance) {
    singletonInstance = new BoilerplateStripperService(logger);
  }
  return singletonInstance;
}
