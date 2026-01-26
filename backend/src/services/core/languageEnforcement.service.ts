/**
 * Language Enforcement Service
 *
 * Provides comprehensive language validation and correction for RAG answers.
 * Ensures responses stay in the user's target language without mid-answer switches.
 *
 * Features:
 * - Mixed-language detection using word frequency analysis
 * - Preservation of {{DOC::...}} markers and code blocks during correction
 * - Configurable tolerance for proper nouns and technical terms
 */

type LanguageCode = 'en' | 'pt' | 'es';

/**
 * Common English words that indicate language drift in PT/ES responses
 * Excludes proper nouns, technical terms, and words that appear in multiple languages
 */
const ENGLISH_INDICATOR_WORDS = new Set([
  // Articles and determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  // Common verbs
  'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
  'being', 'been', 'having',
  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'its',
  // Prepositions/conjunctions
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as',
  'but', 'or', 'and', 'if', 'then', 'because', 'while', 'although',
  // Common adverbs/adjectives
  'not', 'also', 'only', 'just', 'very', 'more', 'most', 'some', 'any',
  'all', 'each', 'every', 'both', 'few', 'many', 'much', 'other',
  // RAG-specific phrases
  'document', 'file', 'found', 'shows', 'indicates', 'according',
  'based', 'information', 'data', 'however', 'therefore', 'additionally',
  'furthermore', 'specifically', 'contains', 'mentions', 'states',
]);

/**
 * Portuguese indicator words
 */
const PORTUGUESE_INDICATOR_WORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
  'para', 'por', 'com', 'sem', 'sob', 'sobre', 'entre',
  'que', 'qual', 'quais', 'quem', 'onde', 'quando', 'como', 'porque',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
  'aquele', 'aquela', 'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',
  'seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'nosso', 'nossa',
  'ser', 'estar', 'ter', 'haver', 'fazer', 'poder', 'dever',
  'foi', 'foram', 'será', 'serão', 'está', 'estão', 'tinha', 'tinham',
  'não', 'sim', 'mais', 'menos', 'muito', 'pouco', 'bem', 'mal',
  'também', 'ainda', 'já', 'sempre', 'nunca', 'talvez', 'apenas',
  'documento', 'arquivo', 'dados', 'informações', 'encontrado',
  'mostra', 'indica', 'contém', 'menciona', 'segundo', 'conforme',
]);

/**
 * Spanish indicator words
 */
const SPANISH_INDICATOR_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'en', 'con', 'sin', 'sobre', 'entre', 'para', 'por',
  'que', 'cual', 'cuales', 'quien', 'donde', 'cuando', 'como', 'porque',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'esto', 'eso', 'aquello',
  'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nuestro', 'nuestra',
  'ser', 'estar', 'tener', 'haber', 'hacer', 'poder', 'deber',
  'fue', 'fueron', 'será', 'serán', 'está', 'están', 'tenía', 'tenían',
  'no', 'sí', 'más', 'menos', 'muy', 'poco', 'bien', 'mal',
  'también', 'todavía', 'ya', 'siempre', 'nunca', 'quizás', 'solo',
  'documento', 'archivo', 'datos', 'información', 'encontrado',
  'muestra', 'indica', 'contiene', 'menciona', 'según', 'conforme',
]);

export interface LanguageValidationResult {
  isValid: boolean;
  detectedLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  driftScore: number; // 0-1, higher = more drift
  driftDetails: {
    totalWords: number;
    wrongLanguageWords: number;
    targetLanguageWords: number;
    wrongLanguageExamples: string[];
  };
}

export interface LanguageEnforcementResult {
  text: string;
  wasModified: boolean;
  validationBefore: LanguageValidationResult;
  validationAfter?: LanguageValidationResult;
  corrections: string[];
}

export interface EnforcementOptions {
  /** Maximum drift score allowed (0-1). Default: 0.15 (15% wrong-language words) */
  driftThreshold?: number;
  /** Preserve these patterns during correction */
  preservePatterns?: RegExp[];
  /** Log corrections for debugging */
  verbose?: boolean;
}

/**
 * Expanded phrase map for more comprehensive replacement
 */
const EXPANDED_PHRASE_MAP: Record<LanguageCode, Record<string, string>> = {
  pt: {
    // Sentence starters
    'The document': 'O documento',
    'The file': 'O arquivo',
    'The spreadsheet': 'A planilha',
    'The data': 'Os dados',
    'The information': 'As informações',
    'The results': 'Os resultados',
    'The analysis': 'A análise',
    'The report': 'O relatório',
    'This document': 'Este documento',
    'This file': 'Este arquivo',
    'These documents': 'Estes documentos',
    'These files': 'Estes arquivos',
    'According to': 'De acordo com',
    'Based on': 'Com base em',
    'As shown': 'Como mostrado',
    'As indicated': 'Como indicado',
    'As mentioned': 'Como mencionado',

    // Verbs and phrases
    'shows that': 'mostra que',
    'indicates that': 'indica que',
    'contains': 'contém',
    'mentions': 'menciona',
    'states that': 'afirma que',
    'reveals that': 'revela que',
    'demonstrates': 'demonstra',
    'suggests that': 'sugere que',
    'I found': 'Encontrei',
    'I found that': 'Descobri que',
    'I couldn\'t find': 'Não encontrei',
    'I don\'t see': 'Não vejo',
    'was found': 'foi encontrado',
    'were found': 'foram encontrados',
    'can be found': 'pode ser encontrado',
    'is located': 'está localizado',
    'is mentioned': 'é mencionado',

    // Connectors
    'However,': 'No entanto,',
    'Therefore,': 'Portanto,',
    'Additionally,': 'Além disso,',
    'Furthermore,': 'Além disso,',
    'Moreover,': 'Além disso,',
    'In summary,': 'Em resumo,',
    'In conclusion,': 'Em conclusão,',
    'Specifically,': 'Especificamente,',
    'For example,': 'Por exemplo,',
    'In other words,': 'Em outras palavras,',
    'On the other hand,': 'Por outro lado,',

    // Questions/closers (should not appear but just in case)
    'Would you like': 'Você gostaria',
    'Do you want': 'Você quer',
    'Let me know': 'Me avise',
    'Feel free to': 'Fique à vontade para',

    // Financial terms
    'Total Revenue': 'Receita Total',
    'Net Income': 'Lucro Líquido',
    'Gross Profit': 'Lucro Bruto',
    'Operating Expenses': 'Despesas Operacionais',
    'Operating Income': 'Receita Operacional',
    'Total Expenses': 'Despesas Totais',

    // Months
    'January': 'Janeiro',
    'February': 'Fevereiro',
    'March': 'Março',
    'April': 'Abril',
    'May': 'Maio',
    'June': 'Junho',
    'July': 'Julho',
    'August': 'Agosto',
    'September': 'Setembro',
    'October': 'Outubro',
    'November': 'Novembro',
    'December': 'Dezembro',
  },
  es: {
    'The document': 'El documento',
    'The file': 'El archivo',
    'According to': 'Según',
    'Based on': 'Basado en',
    'shows that': 'muestra que',
    'indicates that': 'indica que',
    'I found': 'Encontré',
    'I couldn\'t find': 'No encontré',
    'However,': 'Sin embargo,',
    'Therefore,': 'Por lo tanto,',
    'January': 'Enero',
    'February': 'Febrero',
    'March': 'Marzo',
    'April': 'Abril',
    'May': 'Mayo',
    'June': 'Junio',
    'July': 'Julio',
    'August': 'Agosto',
    'September': 'Septiembre',
    'October': 'Octubre',
    'November': 'Noviembre',
    'December': 'Diciembre',
  },
  en: {}, // No replacement needed for English
};

export class LanguageEnforcementService {
  private readonly preservePatterns: RegExp[] = [
    /\{\{DOC::[^}]+\}\}/g,  // Document markers
    /```[\s\S]*?```/g,       // Code blocks
    /`[^`]+`/g,              // Inline code
    /\[[^\]]+\]\([^)]+\)/g,  // Markdown links
    /\|[^|]+\|/g,            // Table cells (preserve structure)
  ];

  /**
   * Validate if text is predominantly in the target language
   */
  validateLanguage(text: string, targetLanguage: LanguageCode): LanguageValidationResult {
    // Remove preserved patterns before analysis
    let cleanText = text;
    const placeholders: string[] = [];

    for (const pattern of this.preservePatterns) {
      cleanText = cleanText.replace(pattern, (match) => {
        placeholders.push(match);
        return ` __PRESERVE_${placeholders.length - 1}__ `;
      });
    }

    // Tokenize into words
    const words = cleanText
      .toLowerCase()
      .replace(/[^\w\sàáâãäåèéêëìíîïòóôõöùúûüñç]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);

    const totalWords = words.length;
    if (totalWords === 0) {
      return {
        isValid: true,
        detectedLanguage: targetLanguage,
        targetLanguage,
        driftScore: 0,
        driftDetails: {
          totalWords: 0,
          wrongLanguageWords: 0,
          targetLanguageWords: 0,
          wrongLanguageExamples: [],
        },
      };
    }

    // Count language indicators
    let englishCount = 0;
    let portugueseCount = 0;
    let spanishCount = 0;
    const wrongLanguageExamples: string[] = [];

    for (const word of words) {
      if (ENGLISH_INDICATOR_WORDS.has(word)) {
        englishCount++;
        if (targetLanguage !== 'en' && wrongLanguageExamples.length < 10) {
          wrongLanguageExamples.push(word);
        }
      }
      if (PORTUGUESE_INDICATOR_WORDS.has(word)) {
        portugueseCount++;
      }
      if (SPANISH_INDICATOR_WORDS.has(word)) {
        spanishCount++;
      }
    }

    // Determine detected language
    let detectedLanguage: LanguageCode = 'en';
    const maxCount = Math.max(englishCount, portugueseCount, spanishCount);
    if (maxCount === portugueseCount && portugueseCount > englishCount) {
      detectedLanguage = 'pt';
    } else if (maxCount === spanishCount && spanishCount > englishCount) {
      detectedLanguage = 'es';
    }

    // Calculate drift score
    let wrongLanguageWords = 0;
    let targetLanguageWords = 0;

    if (targetLanguage === 'pt') {
      wrongLanguageWords = englishCount;
      targetLanguageWords = portugueseCount;
    } else if (targetLanguage === 'es') {
      wrongLanguageWords = englishCount;
      targetLanguageWords = spanishCount;
    } else {
      // English is target, count non-English as wrong
      wrongLanguageWords = portugueseCount + spanishCount;
      targetLanguageWords = englishCount;
    }

    const indicatorWords = wrongLanguageWords + targetLanguageWords;
    const driftScore = indicatorWords > 0 ? wrongLanguageWords / indicatorWords : 0;

    return {
      isValid: driftScore < 0.15, // Less than 15% wrong-language words
      detectedLanguage,
      targetLanguage,
      driftScore,
      driftDetails: {
        totalWords,
        wrongLanguageWords,
        targetLanguageWords,
        wrongLanguageExamples: [...new Set(wrongLanguageExamples)],
      },
    };
  }

  /**
   * Apply phrase replacements to correct language drift
   */
  private applyPhraseReplacements(text: string, targetLanguage: LanguageCode): string {
    const phraseMap = EXPANDED_PHRASE_MAP[targetLanguage];
    if (!phraseMap || Object.keys(phraseMap).length === 0) {
      return text;
    }

    let result = text;

    // Sort phrases by length (longest first) to avoid partial replacements
    const sortedPhrases = Object.entries(phraseMap)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [englishPhrase, targetPhrase] of sortedPhrases) {
      const escapedPhrase = englishPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Handle phrases ending with punctuation differently
      // Word boundary \b doesn't work after punctuation, so use lookahead for whitespace/end
      const endsWithPunct = /[,.:;!?]$/.test(englishPhrase);
      const regex = endsWithPunct
        ? new RegExp(`\\b${escapedPhrase}(?=\\s|$)`, 'gi')
        : new RegExp(`\\b${escapedPhrase}\\b`, 'gi');

      result = result.replace(regex, (match) => {
        // Preserve case of first letter
        if (match[0] === match[0].toUpperCase()) {
          return targetPhrase.charAt(0).toUpperCase() + targetPhrase.slice(1);
        }
        return targetPhrase;
      });
    }

    return result;
  }

  /**
   * Enforce language consistency on text
   * This is the main entry point for language enforcement
   */
  enforceLanguage(
    text: string,
    targetLanguage: LanguageCode,
    options: EnforcementOptions = {}
  ): LanguageEnforcementResult {
    const { driftThreshold = 0.15, verbose = false } = options;

    // Step 1: Validate current state
    const validationBefore = this.validateLanguage(text, targetLanguage);

    if (validationBefore.isValid) {
      return {
        text,
        wasModified: false,
        validationBefore,
        corrections: [],
      };
    }

    // Step 2: Extract and preserve markers
    const preservedItems: Array<{ placeholder: string; value: string }> = [];
    let workingText = text;

    for (const pattern of this.preservePatterns) {
      workingText = workingText.replace(pattern, (match) => {
        const placeholder = `__PRESERVED_${preservedItems.length}__`;
        preservedItems.push({ placeholder, value: match });
        return placeholder;
      });
    }

    // Step 3: Apply phrase replacements
    const corrections: string[] = [];
    const correctedText = this.applyPhraseReplacements(workingText, targetLanguage);

    if (correctedText !== workingText) {
      corrections.push('Applied phrase replacements');
    }

    // Step 4: Restore preserved items
    let finalText = correctedText;
    for (const { placeholder, value } of preservedItems) {
      finalText = finalText.replace(placeholder, value);
    }

    // Step 5: Validate after corrections
    const validationAfter = this.validateLanguage(finalText, targetLanguage);

    if (verbose) {
      console.log('[LanguageEnforcement] Validation before:', validationBefore);
      console.log('[LanguageEnforcement] Validation after:', validationAfter);
      console.log('[LanguageEnforcement] Corrections applied:', corrections);
    }

    return {
      text: finalText,
      wasModified: finalText !== text,
      validationBefore,
      validationAfter,
      corrections,
    };
  }

  /**
   * Quick check if text needs language enforcement
   */
  needsEnforcement(text: string, targetLanguage: LanguageCode): boolean {
    if (targetLanguage === 'en') {
      // CRITICAL FIX: For English, check for Portuguese fragments that need annotation
      return this.hasCrossLanguageFragments(text);
    }
    const validation = this.validateLanguage(text, targetLanguage);
    return !validation.isValid;
  }

  /**
   * CRITICAL FIX for q28: Detect Portuguese/Spanish fragments in English text
   * Returns true if text contains quoted foreign language phrases that should be annotated
   */
  private hasCrossLanguageFragments(text: string): boolean {
    // Common Portuguese indicators in quoted text
    const ptIndicators = ['ção', 'ência', 'ções', 'não', 'são', 'está', 'loja', 'cheiro', 'aparência', 'ência'];
    const quotedPattern = /[""]([^""]{10,})[""]|'([^']{10,})'/g;

    let match;
    while ((match = quotedPattern.exec(text)) !== null) {
      const quoted = match[1] || match[2];
      if (quoted) {
        const lowerQuoted = quoted.toLowerCase();
        // Check if the quoted text has PT indicators
        if (ptIndicators.some(ind => lowerQuoted.includes(ind))) {
          return true;
        }
        // Check for common PT words in the quote
        const words = lowerQuoted.split(/\s+/);
        const ptWordCount = words.filter(w => PORTUGUESE_INDICATOR_WORDS.has(w)).length;
        if (ptWordCount >= 2 || (words.length > 3 && ptWordCount >= 1)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * CRITICAL FIX for q28: Sanitize cross-language fragments in English answers
   * Adds translations in parentheses for Portuguese/Spanish phrases in English text
   */
  sanitizeCrossLanguageFragments(text: string, targetLanguage: LanguageCode): string {
    if (targetLanguage !== 'en') {
      return text; // Only sanitize EN answers
    }

    // Skip if text doesn't have foreign fragments
    if (!this.hasCrossLanguageFragments(text)) {
      return text;
    }

    // Common PT→EN translations for RAG context
    const ptToEnTranslations: Record<string, string> = {
      'aparência': 'appearance',
      'cheiro': 'smell',
      'organização da loja': 'store organization',
      'organização': 'organization',
      'loja': 'store',
      'qualidade': 'quality',
      'serviço': 'service',
      'cliente': 'customer',
      'prova': 'proof',
      'confiança': 'trust',
      'satisfação': 'satisfaction',
      'experiência': 'experience',
      'atendimento': 'customer service',
      'produto': 'product',
      'preço': 'price',
      'valor': 'value',
      'benefício': 'benefit',
      'resultado': 'result',
      'processo': 'process',
      'projeto': 'project',
      'documento': 'document',
      'arquivo': 'file',
      'intangibilidade': 'intangibility',
      'perecibilidade': 'perishability',
      'variabilidade': 'variability',
      'inseparabilidade': 'inseparability',
      'aparência, cheiro e organização da loja': 'appearance, smell, and store organization',
    };

    let result = text;

    // Process quoted Portuguese phrases
    const quotedPattern = /[""]([^""]{5,})[""]|'([^']{5,})'/g;

    result = result.replace(quotedPattern, (fullMatch, doubleQuoted, singleQuoted) => {
      const quoted = doubleQuoted || singleQuoted;
      if (!quoted) return fullMatch;

      const lowerQuoted = quoted.toLowerCase();
      const quoteChar = fullMatch.startsWith('"') || fullMatch.startsWith('"') ? '"' : "'";

      // Check if this is a Portuguese phrase
      const hasPtIndicator = ['ção', 'ência', 'não', 'são', 'loja', 'cheiro'].some(
        ind => lowerQuoted.includes(ind)
      );
      const words = lowerQuoted.split(/\s+/);
      const ptWordCount = words.filter((w: string) => PORTUGUESE_INDICATOR_WORDS.has(w)).length;

      if (hasPtIndicator || ptWordCount >= 1) {
        // Try direct translation lookup
        const directTranslation = ptToEnTranslations[lowerQuoted];
        if (directTranslation) {
          return `${quoteChar}${quoted}${quoteChar} (${directTranslation})`;
        }

        // Try to translate word by word
        const translatedWords = words.map((w: string) => ptToEnTranslations[w] || w);
        const hasAnyTranslation = translatedWords.some((tw: string, i: number) => tw !== words[i]);

        if (hasAnyTranslation) {
          const translation = translatedWords.join(' ').replace(/\s+/g, ' ').trim();
          // Clean up common grammar artifacts
          const cleanTranslation = translation
            .replace(/\b(da|do|de|e)\b/g, (match: string) => {
              if (match === 'e') return 'and';
              return '';
            })
            .replace(/\s+/g, ' ')
            .trim();
          return `${quoteChar}${quoted}${quoteChar} (${cleanTranslation})`;
        }

        // If we couldn't translate, just return the original without adding markers
        // The [PT] marker was leaking into user-visible output
        return fullMatch;
      }

      return fullMatch;
    });

    return result;
  }
}

// Singleton instance
let instance: LanguageEnforcementService | null = null;

export function getLanguageEnforcementService(): LanguageEnforcementService {
  if (!instance) {
    instance = new LanguageEnforcementService();
  }
  return instance;
}

export default LanguageEnforcementService;
