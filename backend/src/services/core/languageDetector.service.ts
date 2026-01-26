/**
 * KODA V3 Language Detector Service - REWRITTEN
 *
 * Fixes from certification failure analysis:
 * 1. Tokenization + word-boundary matching (stops substring false positives)
 * 2. Weighted scores (rare/diagnostic tokens count more)
 * 3. Confidence threshold + 'unknown' output
 * 4. Conversation-language fallback when unknown
 * 5. Reduced EN generic indicators (avoid EN dominating)
 * 6. Proper accent/punctuation normalization
 */

import { LanguageCode } from '../../types/intentV3.types';

/**
 * Extended result with confidence and debug info
 */
export interface LanguageResult {
  lang: LanguageCode | 'unknown';
  confidence: number;  // 0..1
  scores: { en: number; pt: number; es: number };
  signals: string[];   // which indicators matched (for debugging)
}

/**
 * Interface for language detection
 * Allows swapping detection implementation (heuristic, ML-based, external API)
 */
export interface ILanguageDetector {
  detect(text: string, conversationLanguage?: LanguageCode): Promise<LanguageCode>;
  detectWithConfidence(text: string, conversationLanguage?: LanguageCode): Promise<LanguageResult>;
}

/**
 * Weighted indicator with diagnostic value
 */
interface WeightedIndicator {
  pattern: string;
  weight: number;  // 1-5, higher = more diagnostic
  isPhrase?: boolean;  // true if multi-word phrase
}

/**
 * REWRITTEN implementation with:
 * - Token-based matching with word boundaries
 * - Weighted scores for indicators
 * - Confidence thresholds
 * - Conversation language fallback
 */
export class DefaultLanguageDetector implements ILanguageDetector {
  // Minimum total score to make a decision (below this = unknown)
  private readonly MIN_TOTAL_SCORE = 2;
  // Minimum margin between top and second language (below this = unknown)
  private readonly MIN_MARGIN = 1.5;
  // Confidence scaling factor
  private readonly CONFIDENCE_SCALE = 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTUGUESE INDICATORS - Weighted by diagnostic value
  // ═══════════════════════════════════════════════════════════════════════════
  private readonly ptIndicators: WeightedIndicator[] = [
    // HIGH DIAGNOSTIC (weight 5) - Unique to Portuguese, rare in other languages
    { pattern: 'você', weight: 5 },
    { pattern: 'voce', weight: 5 },
    { pattern: 'ção', weight: 5 },
    { pattern: 'ções', weight: 5 },
    { pattern: 'ões', weight: 4 },
    { pattern: 'não', weight: 5 },
    { pattern: 'nao', weight: 4 },
    { pattern: 'são', weight: 4 },
    { pattern: 'também', weight: 5 },
    { pattern: 'tambem', weight: 4 },

    // HIGH DIAGNOSTIC - PT-only imperatives
    { pattern: 'mostre', weight: 5 },
    { pattern: 'liste', weight: 5 },
    { pattern: 'resuma', weight: 5 },
    { pattern: 'resume', weight: 5 },    // PT imperative "resume" (variant)
    { pattern: 'explique', weight: 5 },
    { pattern: 'descreva', weight: 5 },
    { pattern: 'abra', weight: 5 },
    { pattern: 'localize', weight: 5 },
    { pattern: 'crie', weight: 5 },      // create (PT imperative)
    { pattern: 'compare', weight: 5 },   // compare (PT imperative)
    { pattern: 'faça', weight: 5 },      // do/make (PT imperative)
    { pattern: 'encontre', weight: 5 },  // find (PT imperative)
    { pattern: 'extraia', weight: 5 },   // extract (PT imperative)

    // HIGH DIAGNOSTIC - PT nouns with unique spelling
    { pattern: 'projeto', weight: 4 },   // PT for project (ES: "proyecto")
    { pattern: 'projetos', weight: 4 },  // PT plural

    // MEDIUM DIAGNOSTIC (weight 3) - Common PT words
    { pattern: 'meus', weight: 3 },
    { pattern: 'minhas', weight: 3 },
    { pattern: 'meu', weight: 3 },
    { pattern: 'minha', weight: 3 },
    { pattern: 'quantos', weight: 3 },
    { pattern: 'quais', weight: 3 },
    { pattern: 'qual', weight: 3 },
    { pattern: 'onde', weight: 3 },
    { pattern: 'quando', weight: 2 },
    { pattern: 'isso', weight: 3 },
    { pattern: 'esse', weight: 2 },
    { pattern: 'essa', weight: 2 },
    { pattern: 'ele', weight: 2 },
    { pattern: 'ela', weight: 2 },
    { pattern: 'eles', weight: 3 },
    { pattern: 'elas', weight: 3 },

    // MEDIUM - PT nouns
    { pattern: 'arquivo', weight: 3 },
    { pattern: 'arquivos', weight: 3 },
    { pattern: 'documento', weight: 2 },  // Also Spanish
    { pattern: 'documentos', weight: 2 },
    { pattern: 'planilha', weight: 4 },  // PT-only
    { pattern: 'planilhas', weight: 4 },
    { pattern: 'tabela', weight: 4 },    // PT for table (distinct from Spanish "tabla")
    { pattern: 'receitas', weight: 3 },  // PT for revenues/receipts
    { pattern: 'despesas', weight: 3 },  // PT for expenses
    { pattern: 'trimestre', weight: 3 }, // PT for quarter (also Spanish)
    { pattern: 'despesa', weight: 3 },   // PT singular
    { pattern: 'receita', weight: 3 },   // PT singular
    { pattern: 'lucro', weight: 3 },     // PT for profit
    { pattern: 'resumo', weight: 3 },    // PT for summary

    // MEDIUM - PT prepositions (unique contractions)
    { pattern: 'nesse', weight: 4 },
    { pattern: 'nessa', weight: 4 },
    { pattern: 'dessa', weight: 4 },
    { pattern: 'desse', weight: 4 },
    { pattern: 'disso', weight: 4 },
    { pattern: 'nisso', weight: 4 },
    { pattern: 'nele', weight: 4 },
    { pattern: 'nela', weight: 4 },
    { pattern: 'dele', weight: 4 },
    { pattern: 'dela', weight: 4 },
    { pattern: 'pelo', weight: 3 },
    { pattern: 'pela', weight: 3 },

    // LOW DIAGNOSTIC (weight 1-2) - Ambiguous with Spanish/common
    { pattern: 'como', weight: 1 },  // Also Spanish
    { pattern: 'para', weight: 1 },  // Also Spanish
    { pattern: 'sobre', weight: 1 }, // Also Spanish
    { pattern: 'porque', weight: 2 },
    { pattern: 'ano', weight: 1 },
    { pattern: 'dia', weight: 1 },
    { pattern: 'mes', weight: 1 },
    { pattern: 'mês', weight: 3 },  // Accented = PT
    { pattern: 'uma', weight: 3 },  // PT feminine article (ES uses "una")
    { pattern: 'comparando', weight: 2 }, // PT/ES gerund
    { pattern: 'por', weight: 1 },  // PT/ES preposition
    { pattern: 'valores', weight: 2 }, // PT/ES values
    { pattern: 'mostrar', weight: 2 }, // PT/ES infinitive
    { pattern: 'em', weight: 2 },  // PT preposition "in" (distinct from ES "en")
    { pattern: 'no', weight: 1 },  // PT contraction "em+o" (in the)
    { pattern: 'na', weight: 1 },  // PT contraction "em+a" (in the)
    { pattern: 'do', weight: 1 },  // PT contraction "de+o" (of the)
    { pattern: 'da', weight: 1 },  // PT contraction "de+a" (of the)

    // PHRASES (multi-word, high diagnostic)
    { pattern: 'por favor', weight: 3, isPhrase: true },
    { pattern: 'por que', weight: 4, isPhrase: true },
    { pattern: 'o que', weight: 4, isPhrase: true },
    { pattern: 'com base', weight: 4, isPhrase: true },
    { pattern: 'me diga', weight: 5, isPhrase: true },
    { pattern: 'me mostre', weight: 5, isPhrase: true },
    { pattern: 'quero saber', weight: 5, isPhrase: true },
    { pattern: 'todos os', weight: 3, isPhrase: true },
    { pattern: 'todos meus', weight: 4, isPhrase: true },
    { pattern: 'e o', weight: 2, isPhrase: true },  // Follow-up pattern
    { pattern: 'e a', weight: 2, isPhrase: true },
    { pattern: 'e em', weight: 3, isPhrase: true },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SPANISH INDICATORS - Weighted by diagnostic value
  // ═══════════════════════════════════════════════════════════════════════════
  private readonly esIndicators: WeightedIndicator[] = [
    // HIGH DIAGNOSTIC (weight 5) - Unique to Spanish
    { pattern: 'usted', weight: 5 },
    { pattern: 'cuántos', weight: 5 },
    { pattern: 'cuantos', weight: 4 },
    { pattern: 'cuáles', weight: 5 },
    { pattern: 'cuales', weight: 4 },
    { pattern: 'dónde', weight: 5 },
    { pattern: 'qué', weight: 4 },
    { pattern: 'cómo', weight: 4 },
    { pattern: 'cuándo', weight: 5 },
    { pattern: 'dígame', weight: 5 },
    { pattern: 'muéstrame', weight: 5 },
    { pattern: 'muestre', weight: 5 },
    { pattern: 'explique', weight: 3 },  // Also PT

    // MEDIUM DIAGNOSTIC (weight 3)
    { pattern: 'archivo', weight: 2 },  // Also PT
    { pattern: 'archivos', weight: 3 },
    { pattern: 'hoja', weight: 4 },  // Spanish for spreadsheet
    { pattern: 'hojas', weight: 4 },
    { pattern: 'carpeta', weight: 4 },
    { pattern: 'fichero', weight: 5 },  // ES-only
    { pattern: 'ficheros', weight: 5 },

    // LOW DIAGNOSTIC - Ambiguous
    { pattern: 'donde', weight: 2 },
    { pattern: 'cuando', weight: 2 },
    { pattern: 'también', weight: 2 },  // Also PT
    { pattern: 'tambien', weight: 2 },
    { pattern: 'que', weight: 1 },  // Too common
    { pattern: 'como', weight: 1 },

    // PHRASES
    { pattern: 'por favor', weight: 2, isPhrase: true },  // Both PT/ES
    { pattern: 'qué es', weight: 4, isPhrase: true },
    { pattern: 'cuál es', weight: 5, isPhrase: true },
    { pattern: 'dónde está', weight: 5, isPhrase: true },
    { pattern: 'mis archivos', weight: 4, isPhrase: true },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGLISH INDICATORS - REDUCED to avoid dominating
  // Removed generic stopwords like "the", "this", "that"
  // ═══════════════════════════════════════════════════════════════════════════
  private readonly enIndicators: WeightedIndicator[] = [
    // HIGH DIAGNOSTIC - EN-specific phrases and structures
    { pattern: 'please', weight: 4 },
    { pattern: 'could you', weight: 5, isPhrase: true },
    { pattern: 'can you', weight: 4, isPhrase: true },
    { pattern: 'would you', weight: 5, isPhrase: true },
    { pattern: 'show me', weight: 4, isPhrase: true },
    { pattern: 'tell me', weight: 4, isPhrase: true },
    { pattern: 'give me', weight: 4, isPhrase: true },
    { pattern: 'find me', weight: 4, isPhrase: true },
    { pattern: 'list my', weight: 4, isPhrase: true },
    { pattern: 'open the', weight: 3, isPhrase: true },
    { pattern: 'in the document', weight: 5, isPhrase: true },
    { pattern: 'from the', weight: 2, isPhrase: true },
    { pattern: 'what is', weight: 3, isPhrase: true },
    { pattern: 'what are', weight: 3, isPhrase: true },
    { pattern: 'where is', weight: 3, isPhrase: true },
    { pattern: 'where are', weight: 3, isPhrase: true },
    { pattern: 'how many', weight: 4, isPhrase: true },
    { pattern: 'how much', weight: 4, isPhrase: true },

    // MEDIUM DIAGNOSTIC - EN question words (only when standalone)
    { pattern: 'summarize', weight: 5 },
    { pattern: 'explain', weight: 4 },
    { pattern: 'describe', weight: 4 },
    { pattern: 'compare', weight: 4 },
    { pattern: 'extract', weight: 5 },
    { pattern: 'locate', weight: 5 },

    // LOW DIAGNOSTIC - Common but not definitive
    { pattern: 'what', weight: 2 },
    { pattern: 'where', weight: 2 },
    { pattern: 'which', weight: 2 },
    { pattern: 'how', weight: 1 },
    { pattern: 'many', weight: 2 },
    { pattern: 'files', weight: 3 },
    { pattern: 'documents', weight: 2 },
    { pattern: 'document', weight: 2 },
    { pattern: 'folder', weight: 4 },
    { pattern: 'folders', weight: 4 },

    // REMOVED: 'the', 'this', 'that', 'you', 'are' - too generic, cause false positives
  ];

  /**
   * Create a language instruction for LLM prompts
   */
  createLanguageInstruction(lang: string): string {
    const instructions: Record<string, string> = {
      en: 'Respond in English.',
      pt: 'Responda em português brasileiro.',
      es: 'Responde en español.',
    };
    return instructions[lang] || instructions.en;
  }

  /**
   * Normalize text for matching:
   * 1. Lowercase
   * 2. Strip diacritics (for fallback matching)
   * 3. Normalize whitespace
   */
  private normalizeText(text: string): { original: string; stripped: string; tokens: string[] } {
    const lower = text.toLowerCase();

    // Strip diacritics for fallback matching
    const stripped = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Tokenize: split on whitespace and punctuation, keep words only
    const tokens = lower
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Replace non-letter/number with space
      .split(/\s+/)
      .filter(t => t.length > 0);

    return { original: lower, stripped, tokens };
  }

  /**
   * Check if a pattern matches using word boundaries
   */
  private matchesPattern(
    indicator: WeightedIndicator,
    normalized: { original: string; stripped: string; tokens: string[] }
  ): boolean {
    const { original, stripped, tokens } = normalized;
    const pattern = indicator.pattern.toLowerCase();

    if (indicator.isPhrase) {
      // Phrase matching: check if phrase appears as substring with word boundaries
      const phraseRegex = new RegExp(`\\b${this.escapeRegex(pattern)}\\b`, 'i');
      return phraseRegex.test(original) || phraseRegex.test(stripped);
    } else {
      // Single word: check token list for exact match
      const strippedPattern = pattern.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return tokens.includes(pattern) || tokens.includes(strippedPattern);
    }
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Calculate weighted score for a language
   */
  private calculateScore(
    indicators: WeightedIndicator[],
    normalized: { original: string; stripped: string; tokens: string[] }
  ): { score: number; matches: string[] } {
    let score = 0;
    const matches: string[] = [];

    for (const indicator of indicators) {
      if (this.matchesPattern(indicator, normalized)) {
        score += indicator.weight;
        matches.push(`${indicator.pattern}(+${indicator.weight})`);
      }
    }

    return { score, matches };
  }

  /**
   * Detect language with full confidence information
   */
  async detectWithConfidence(
    text: string,
    conversationLanguage?: LanguageCode
  ): Promise<LanguageResult> {
    const normalized = this.normalizeText(text);

    // Calculate weighted scores
    const ptResult = this.calculateScore(this.ptIndicators, normalized);
    const esResult = this.calculateScore(this.esIndicators, normalized);
    const enResult = this.calculateScore(this.enIndicators, normalized);

    const scores = {
      pt: ptResult.score,
      es: esResult.score,
      en: enResult.score,
    };

    const signals = [
      ...ptResult.matches.map(m => `PT:${m}`),
      ...esResult.matches.map(m => `ES:${m}`),
      ...enResult.matches.map(m => `EN:${m}`),
    ];

    const totalScore = scores.pt + scores.es + scores.en;

    // Find top two languages
    const sortedLangs = Object.entries(scores)
      .sort(([, a], [, b]) => b - a) as [LanguageCode, number][];

    const [topLang, topScore] = sortedLangs[0];
    const [, secondScore] = sortedLangs[1];
    const margin = topScore - secondScore;

    // Calculate confidence (0-1)
    const confidence = totalScore > 0
      ? Math.min(1, (topScore / this.CONFIDENCE_SCALE) * (margin / Math.max(1, topScore)))
      : 0;

    // Decision logic with thresholds
    if (totalScore < this.MIN_TOTAL_SCORE) {
      // Not enough signal - use fallback
      return {
        lang: conversationLanguage || 'unknown',
        confidence: 0,
        scores,
        signals: [...signals, 'FALLBACK:low_total_score'],
      };
    }

    if (margin < this.MIN_MARGIN) {
      // Too close to call - use conversation language or unknown
      return {
        lang: conversationLanguage || 'unknown',
        confidence: confidence * 0.5,  // Reduce confidence for ties
        scores,
        signals: [...signals, 'FALLBACK:low_margin'],
      };
    }

    return {
      lang: topLang,
      confidence,
      scores,
      signals,
    };
  }

  /**
   * Simple detect method for backward compatibility
   * Returns LanguageCode, falling back to 'en' if unknown
   */
  async detect(text: string, conversationLanguage?: LanguageCode): Promise<LanguageCode> {
    const result = await this.detectWithConfidence(text, conversationLanguage);

    if (result.lang === 'unknown') {
      // Final fallback chain:
      // 1. Conversation language (if provided)
      // 2. Default to English
      return conversationLanguage || 'en';
    }

    return result.lang as LanguageCode;
  }
}

// Use container.getLanguageDetector() instead of singleton
// Singleton removed - use DI container
export default DefaultLanguageDetector;
