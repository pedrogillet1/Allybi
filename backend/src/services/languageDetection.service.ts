/**
 * Language Detection Service
 *
 * Detects the language of text content.
 * Uses heuristic patterns for fast detection.
 */

export type SupportedLanguage = 'en' | 'pt' | 'es' | 'unknown';

/**
 * Detect language from text content.
 *
 * @param text - Text to analyze
 * @returns Detected language code
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (!text || text.trim().length === 0) {
    return 'unknown';
  }

  const normalized = text.toLowerCase();

  // Portuguese indicators
  const ptWords = ['você', 'não', 'como', 'para', 'documento', 'arquivo', 'obrigado', 'olá', 'está', 'são', 'foram', 'é', 'ão', 'ção', 'ões'];
  const ptScore = ptWords.reduce((score, word) => score + (normalized.includes(word) ? 1 : 0), 0);

  // Spanish indicators
  const esWords = ['usted', 'cómo', 'para', 'documento', 'archivo', 'gracias', 'hola', 'qué', 'está', 'son', 'fueron', 'ñ', 'ción', 'iones'];
  const esScore = esWords.reduce((score, word) => score + (normalized.includes(word) ? 1 : 0), 0);

  // English indicators
  const enWords = ['the', 'and', 'for', 'that', 'this', 'with', 'are', 'have', 'from', 'what', 'document', 'file'];
  const enScore = enWords.reduce((score, word) => score + (normalized.includes(word) ? 1 : 0), 0);

  // Return highest scoring language
  if (ptScore > esScore && ptScore > enScore && ptScore > 0) {
    return 'pt';
  }
  if (esScore > ptScore && esScore > enScore && esScore > 0) {
    return 'es';
  }
  if (enScore > 0) {
    return 'en';
  }

  return 'unknown';
}

/**
 * Get language name from code.
 */
export function getLanguageName(code: SupportedLanguage): string {
  const names: Record<SupportedLanguage, string> = {
    en: 'English',
    pt: 'Portuguese',
    es: 'Spanish',
    unknown: 'Unknown',
  };
  return names[code] || 'Unknown';
}

/**
 * Create a language instruction string for LLM prompts.
 *
 * @param language - Language code
 * @returns Language instruction string
 */
export function createLanguageInstruction(language: SupportedLanguage | string): string {
  const lang = (language || 'en').toLowerCase();

  switch (lang) {
    case 'pt':
    case 'portuguese':
      return '\n\nIMPORTANT: Please respond in Portuguese (Português).';
    case 'es':
    case 'spanish':
      return '\n\nIMPORTANT: Please respond in Spanish (Español).';
    case 'en':
    case 'english':
    default:
      return '\n\nIMPORTANT: Please respond in English.';
  }
}

export default {
  detectLanguage,
  getLanguageName,
  createLanguageInstruction,
};
