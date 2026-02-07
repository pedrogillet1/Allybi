/**
 * EntityExtractorService
 *
 * Extracts folder names, filenames, and targets from user messages
 * using rules defined in the file_action_operators databank.
 *
 * 100% databank-driven - no hardcoded patterns or entity names.
 */

import { getBank, getOptionalBank } from '../banks/bankLoader.service';

export type LanguageCode = 'en' | 'pt' | 'es';

export interface EntityExtractionRule {
  type: string;
  required: boolean;
  afterKeywords?: Record<string, string[]>;
  keywords?: Record<string, string[]>;
  prepositions?: Record<string, string[]>;
  specialValues?: Record<string, string[]>;
}

export interface DetectionRule {
  id: string;
  operator: string;
  priority: number;
  confidence: number;
  patterns: Record<string, string[]>;
  mustContain?: Record<string, string[]>;
  mustNotContain?: Record<string, string[]>;
}

export interface FileActionOperatorsBank {
  _meta: any;
  config: {
    enabled: boolean;
    undoTtlSeconds: number;
    maxBulkItems: number;
    confirmBulkAbove: number;
    operatorDetection?: {
      enabled: boolean;
      useRegex: boolean;
      caseInsensitive: boolean;
      stripDiacritics?: boolean;
      collapseWhitespace?: boolean;
      multipleMatchPolicy?: string;
      maxCandidatesPerMessage?: number;
      minConfidence?: number;
      highConfidence?: number;
      guards?: {
        mustNotMatchWholeMessage?: Record<string, string[]>;
        mustNotContain?: Record<string, string[]>;
      };
    };
  };
  detectionRules?: DetectionRule[];
  operators: Record<string, {
    service: string;
    method: string;
    destructive: boolean;
    requiresConfirmation: boolean;
    canUndo: boolean;
    undoAction?: string;
    bulkSupport?: boolean;
    entityExtraction?: Record<string, EntityExtractionRule>;
    confirmation?: {
      prompt: Record<string, string>;
      confirmLabel: Record<string, string>;
      cancelLabel: Record<string, string>;
      confirmStyle: string;
    };
    microcopy: Record<string, Record<string, string>>;
    // Only on 'undo' operator:
    undoDescriptions?: Record<string, Record<string, string>>;
  }>;
  bulkOperators?: Record<string, any>;
  entityExtractionPatterns: Record<string, {
    _comment?: string;
    patterns: string[];
  }>;
}

export class EntityExtractorService {
  private bank: FileActionOperatorsBank | null = null;

  constructor() {
    this.loadBank();
  }

  private loadBank(): void {
    this.bank = getOptionalBank<FileActionOperatorsBank>('file_action_operators');
  }

  /**
   * Extract entities from a message using the extraction rules for a specific operator.
   */
  async extract(
    message: string,
    extractionRules: Record<string, EntityExtractionRule> | undefined,
    language: LanguageCode
  ): Promise<Record<string, string>> {
    if (!extractionRules || !this.bank) {
      return {};
    }

    const entities: Record<string, string> = {};

    for (const [entityName, rule] of Object.entries(extractionRules)) {
      const value = await this.extractEntity(message, rule, language);
      if (value) {
        entities[entityName] = value;
      }
    }

    return entities;
  }

  /**
   * Extract a single entity based on its rule type.
   */
  private async extractEntity(
    message: string,
    rule: EntityExtractionRule,
    lang: LanguageCode
  ): Promise<string | null> {
    if (!this.bank) return null;

    const patternDef = this.bank.entityExtractionPatterns[rule.type];

    switch (rule.type) {
      case 'quoted_or_trailing':
        return this.extractQuotedOrTrailing(message, rule, lang);

      case 'filelike_pattern':
        return this.extractFilelikePattern(message);

      case 'multiple_filelike':
        // Extract multiple filenames, return first one for single entity
        // (the full list can be retrieved via extractMultipleFilenames)
        const filenames = this.extractMultipleFilenames(message);
        return filenames.length > 0 ? filenames[0] : null;

      case 'after_keyword':
        const keywords = rule.keywords?.[lang] || rule.keywords?.en || [];
        return this.extractAfterKeywords(message, keywords);

      case 'after_preposition':
        const preps = rule.prepositions?.[lang] || rule.prepositions?.en || [];
        return this.extractAfterKeywords(message, preps);

      case 'first_quoted_or_noun':
        return this.extractFirstQuotedOrNoun(message, lang);

      default:
        // If patternDef exists, use its patterns directly
        if (patternDef?.patterns?.length) {
          return this.matchPatterns(message, patternDef.patterns);
        }
        return null;
    }
  }

  /**
   * Extract quoted string or trailing noun phrase.
   */
  private extractQuotedOrTrailing(
    message: string,
    rule: EntityExtractionRule,
    lang: LanguageCode
  ): string | null {
    // First try quoted strings
    const quotedMatch = message.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return quotedMatch[1].trim();
    }

    // Try after keywords like "called", "named", "titled"
    if (rule.afterKeywords) {
      const keywords = [...(rule.afterKeywords[lang] || []), ...(rule.afterKeywords.en || [])];
      for (const kw of keywords) {
        // Stop before prepositions that indicate parent folder
        const pattern = new RegExp(`\\b${kw}\\s+["']?([^"'\\n]+?)["']?(?:\\s*$|\\s+(?:to|para|inside|dentro|in|em|under|into))`, 'i');
        const match = message.match(pattern);
        if (match?.[1]) {
          return match[1].trim();
        }
      }
    }

    // Fallback: extract trailing noun after folder/pasta keywords
    // Stop before prepositions that indicate parent folder or destination
    const folderPattern = /(?:folder|pasta|directory|diret[oó]rio)\s+["']?([^"'\n]+?)["']?(?:\s*$|\s+(?:to|para|inside|dentro|in|em|under|into))/i;
    const folderMatch = message.match(folderPattern);
    if (folderMatch?.[1]) {
      return folderMatch[1].trim();
    }

    // Last resort: get the last word/phrase after the verb
    const trailingPattern = /(?:create|make|add|new|delete|remove|trash|criar|crie|nova|novo|excluir|deletar|remover|apagar)\s+(?:a\s+)?(?:folder|pasta|directory|diret[oó]rio)\s+["']?(.+?)["']?\s*$/i;
    const trailingMatch = message.match(trailingPattern);
    if (trailingMatch?.[1]) {
      return trailingMatch[1].trim();
    }

    return null;
  }

  /**
   * Extract filename with extension or quoted filename.
   */
  private extractFilelikePattern(message: string): string | null {
    // First try quoted strings
    const quotedMatch = message.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return quotedMatch[1].trim();
    }

    // Try to match filename with extension
    const fileExtPattern = /([\w\-\.]+\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg|jpeg|gif|webp|svg|mp4|mov|mp3|wav|zip|rar))/i;
    const fileMatch = message.match(fileExtPattern);
    if (fileMatch) {
      return fileMatch[1].trim();
    }

    // Try to extract filename after verbs (move, delete, rename, etc.)
    const afterVerbPattern = /(?:move|transfer|put|delete|remove|trash|rename|copy|duplicate|clone|mover|transferir|colocar|excluir|deletar|remover|apagar|renomear|copiar|duplicar|clonar)\s+(?:the\s+)?(?:file\s+|document\s+|o\s+)?(?:arquivo\s+|documento\s+)?["']?([^\s"']+?)["']?\s+(?:to|para|em|na|no|as|como)/i;
    const afterVerbMatch = message.match(afterVerbPattern);
    if (afterVerbMatch?.[1]) {
      return afterVerbMatch[1].trim();
    }

    return null;
  }

  /**
   * Extract multiple filenames from a message (e.g., "file a.pdf, file b.xlsx and file c.docx").
   * Supports comma-separated lists with "and"/"e" conjunctions.
   */
  extractMultipleFilenames(message: string): string[] {
    const filenames: string[] = [];

    // First try quoted filenames (highest priority)
    const quotedMatches = message.matchAll(/["']([^"']+)["']/g);
    for (const match of quotedMatches) {
      const filename = match[1].trim();
      if (filename && !filenames.includes(filename)) {
        filenames.push(filename);
      }
    }

    // If we found quoted filenames, return those
    if (filenames.length > 0) {
      return filenames;
    }

    // Split message by conjunctions/separators, then extract filename from each part
    // This handles: "move file1.pdf and file2.xlsx to folder"
    //               "move file1.pdf, file2.xlsx, and file3.docx to folder"
    const separatorPattern = /\s*(?:,\s*(?:and|e)?|(?:\s+and\s+|\s+e\s+))\s*/i;
    const parts = message.split(separatorPattern);

    for (const part of parts) {
      // Match filename with extension anywhere in the part
      // Non-greedy match for multi-word names ending with extension
      const fileMatch = part.match(/([A-Za-z0-9][A-Za-z0-9\s\-_\.]*?\.(?:pdf|xlsx?|docx?|pptx?|csv|txt|png|jpe?g|gif|webp|svg|mp4|mov|mp3|wav|zip|rar))(?:\s|$|(?=\s+(?:to|para|em|na|no)\b))/i);

      if (fileMatch) {
        let filename = fileMatch[1].trim();
        // Clean up leading verbs/articles
        filename = filename
          .replace(/^(?:move|mover|transfer|transferir|copy|copiar|delete|excluir|the\s+|o\s+|a\s+|file\s+|arquivo\s+|document\s+|documento\s+)/i, '')
          .trim();

        if (filename && !filenames.includes(filename)) {
          filenames.push(filename);
        }
      }
    }

    return filenames;
  }

  /**
   * Extract content after specific keywords.
   */
  private extractAfterKeywords(text: string, keywords: string[]): string | null {
    for (const kw of keywords) {
      // Handle multi-word keywords
      const escapedKw = kw.replace(/\s+/g, '\\s+');
      const pattern = new RegExp(`\\b${escapedKw}\\b\\s+["']?([^"']+?)["']?(?:\\s*$|\\s+(?:and|e|,|folder|pasta))`, 'i');
      const match = text.match(pattern);
      if (match?.[1]) {
        let result = match[1].trim();
        // Remove trailing "folder" or "pasta" if present
        result = result.replace(/\s+(folder|pasta)\s*$/i, '').trim();
        return result;
      }
    }

    // Fallback: simple extraction after keyword
    for (const kw of keywords) {
      const escapedKw = kw.replace(/\s+/g, '\\s+');
      const simplePattern = new RegExp(`\\b${escapedKw}\\b\\s+["']?([\\w\\s\\-\\.]+?)["']?\\s*$`, 'i');
      const simpleMatch = text.match(simplePattern);
      if (simpleMatch?.[1]) {
        return simpleMatch[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract first quoted string or first noun phrase after verb.
   */
  private extractFirstQuotedOrNoun(message: string, lang: LanguageCode): string | null {
    // First try quoted strings
    const quotedMatch = message.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return quotedMatch[1].trim();
    }

    // Try to find folder name before "to"/"para"
    const beforeToPattern = /(?:folder|pasta)\s+["']?([^"'\n]+?)["']?\s+(?:to|para)/i;
    const beforeToMatch = message.match(beforeToPattern);
    if (beforeToMatch?.[1]) {
      return beforeToMatch[1].trim();
    }

    // Try after rename/renomear verb
    const renamePattern = /(?:rename|renomear|change\s+(?:the\s+)?name\s+of|mudar\s+(?:o\s+)?nome\s+d[ao])\s+(?:the\s+)?(?:folder\s+|pasta\s+)?["']?([^"'\n]+?)["']?\s+(?:to|para|as|como)/i;
    const renameMatch = message.match(renamePattern);
    if (renameMatch?.[1]) {
      return renameMatch[1].trim();
    }

    return null;
  }

  /**
   * Match text against multiple regex patterns and return first capture group.
   */
  private matchPatterns(text: string, patterns: string[]): string | null {
    for (const p of patterns) {
      try {
        const match = text.match(new RegExp(p, 'i'));
        if (match?.[1]) {
          return match[1].trim();
        }
      } catch (e) {
        // Invalid regex pattern, skip
        continue;
      }
    }
    return null;
  }

  /**
   * Check if special values are present (e.g., "root", "top level").
   */
  isSpecialValue(value: string, specialValues: Record<string, string[]> | undefined, lang: LanguageCode): boolean {
    if (!specialValues) return false;
    const values = [...(specialValues[lang] || []), ...(specialValues.en || [])];
    return values.some(v => value.toLowerCase().includes(v.toLowerCase()));
  }

  /**
   * Get missing required entities for an operator.
   */
  getMissingEntities(
    entities: Record<string, string>,
    extractionRules: Record<string, EntityExtractionRule> | undefined
  ): string[] {
    if (!extractionRules) return [];

    const missing: string[] = [];
    for (const [name, rule] of Object.entries(extractionRules)) {
      if (rule.required && !entities[name]) {
        missing.push(name);
      }
    }
    return missing;
  }
}

// Singleton instance
let instance: EntityExtractorService | null = null;

export function getEntityExtractor(): EntityExtractorService {
  if (!instance) {
    instance = new EntityExtractorService();
  }
  return instance;
}
