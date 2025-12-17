/**
 * KODA V3 Language Detector Service
 * 
 * Injectable language detection for Intent Engine.
 * Implements ILanguageDetector interface for DI compliance.
 * 
 * Based on: Phase 3 Intent Engine Correctness requirements
 */

import { LanguageCode } from '../../types/intentV3.types';

/**
 * Interface for language detection
 * Allows swapping detection implementation (heuristic, ML-based, external API)
 */
export interface ILanguageDetector {
  detect(text: string): Promise<LanguageCode>;
}

/**
 * Default implementation using keyword heuristics
 * Fast and deterministic - no external dependencies
 */
export class DefaultLanguageDetector implements ILanguageDetector {
  // Portuguese indicators
  private readonly ptIndicators = ['você', 'está', 'não', 'são', 'também', 'quantos', 'quais', 'onde'];
  // Spanish indicators
  private readonly esIndicators = ['usted', 'está', 'cuántos', 'cuáles', 'dónde', 'también', 'qué'];
  // English indicators
  private readonly enIndicators = ['you', 'are', 'how', 'what', 'where', 'which', 'many'];

  /**
   * Create a language instruction for LLM prompts
   */
  createLanguageInstruction(lang: string): string {
    const instructions: Record<string, string> = {
      en: 'Respond in English.',
      pt: 'Responda em português.',
      es: 'Responde en español.',
    };
    return instructions[lang] || instructions.en;
  }

  async detect(text: string): Promise<LanguageCode> {
    const lowerText = text.toLowerCase();

    let ptScore = 0;
    let esScore = 0;
    let enScore = 0;

    for (const indicator of this.ptIndicators) {
      if (lowerText.includes(indicator)) ptScore++;
    }
    for (const indicator of this.esIndicators) {
      if (lowerText.includes(indicator)) esScore++;
    }
    for (const indicator of this.enIndicators) {
      if (lowerText.includes(indicator)) enScore++;
    }

    // Return language with highest score
    if (ptScore > esScore && ptScore > enScore) return 'pt';
    if (esScore > ptScore && esScore > enScore) return 'es';
    return 'en'; // Default to English
  }
}

// Use container.getLanguageDetector() instead of singleton
// Singleton removed - use DI container
export default DefaultLanguageDetector;

