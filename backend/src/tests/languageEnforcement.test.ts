/**
 * Language Enforcement Service Tests
 *
 * Tests for validating language consistency and enforcing language lock
 * on RAG answers to prevent mid-answer language switching.
 */

import { describe, it, expect } from '@jest/globals';
import {
  LanguageEnforcementService,
  getLanguageEnforcementService,
} from '../services/core/languageEnforcement.service';

describe('LanguageEnforcementService', () => {
  const service = getLanguageEnforcementService();

  describe('validateLanguage', () => {
    it('should validate correct Portuguese text as valid', () => {
      const ptText = 'O documento mostra que o faturamento total é de R$ 200.750,00 por mês.';
      const result = service.validateLanguage(ptText, 'pt');

      expect(result.isValid).toBe(true);
      expect(result.targetLanguage).toBe('pt');
      expect(result.driftScore).toBeLessThan(0.15);
    });

    it('should detect English drift in Portuguese-targeted text', () => {
      const mixedText = 'The document shows that o faturamento é de R$ 200.000. According to the data, the revenue increased.';
      const result = service.validateLanguage(mixedText, 'pt');

      expect(result.isValid).toBe(false);
      expect(result.driftScore).toBeGreaterThan(0.15);
      expect(result.driftDetails.wrongLanguageExamples.length).toBeGreaterThan(0);
    });

    it('should validate correct English text as valid for English target', () => {
      const enText = 'The document shows the total revenue is $200,750 per month.';
      const result = service.validateLanguage(enText, 'en');

      expect(result.isValid).toBe(true);
      expect(result.targetLanguage).toBe('en');
    });

    it('should handle empty text gracefully', () => {
      const result = service.validateLanguage('', 'pt');

      expect(result.isValid).toBe(true);
      expect(result.driftScore).toBe(0);
      expect(result.driftDetails.totalWords).toBe(0);
    });

    it('should preserve {{DOC::...}} markers during validation', () => {
      const textWithMarkers = 'O documento {{DOC::id=123::name="file.pdf"::ctx=text}} mostra os dados.';
      const result = service.validateLanguage(textWithMarkers, 'pt');

      expect(result.isValid).toBe(true);
      // Markers should not affect drift calculation
    });

    it('should detect Spanish drift in Portuguese-targeted text', () => {
      const mixedText = 'El documento muestra que os dados são importantes. Según el análisis.';
      const result = service.validateLanguage(mixedText, 'pt');

      // Spanish and Portuguese are similar but distinct
      expect(result.detectedLanguage).not.toBe('en');
    });
  });

  describe('enforceLanguage', () => {
    it('should replace common English phrases with Portuguese equivalents', () => {
      const textWithEnglish = 'The document shows that o faturamento é de R$ 200.000. According to the data, isso é correto.';
      const result = service.enforceLanguage(textWithEnglish, 'pt');

      expect(result.wasModified).toBe(true);
      expect(result.text).toContain('O documento');
      expect(result.text).toContain('De acordo com');
      expect(result.text).not.toMatch(/\bThe document\b/i);
      expect(result.text).not.toMatch(/\bAccording to\b/i);
    });

    it('should not modify already correct Portuguese text', () => {
      const correctPT = 'O documento mostra que o faturamento total é de R$ 200.750,00 por mês.';
      const result = service.enforceLanguage(correctPT, 'pt');

      expect(result.wasModified).toBe(false);
      expect(result.text).toBe(correctPT);
    });

    it('should preserve {{DOC::...}} markers during enforcement', () => {
      const textWithMarkers = 'The document shows data. {{DOC::id=abc-123::name="file.pdf"::ctx=text}} According to the file.';
      const result = service.enforceLanguage(textWithMarkers, 'pt');

      expect(result.text).toContain('{{DOC::id=abc-123::name="file.pdf"::ctx=text}}');
      expect(result.text).toContain('O documento');
      expect(result.text).toContain('De acordo com');
    });

    it('should preserve code blocks during enforcement', () => {
      const textWithCode = 'The document shows:\n```json\n{"key": "value"}\n```\nAccording to the data.';
      const result = service.enforceLanguage(textWithCode, 'pt');

      expect(result.text).toContain('```json\n{"key": "value"}\n```');
    });

    it('should handle multiple marker types', () => {
      const complexText = `The document {{DOC::id=1::name="a.pdf"::ctx=text}} shows data.
According to {{DOC::id=2::name="b.xlsx"::ctx=text}} the revenue is $100.`;

      const result = service.enforceLanguage(complexText, 'pt');

      expect(result.text).toContain('{{DOC::id=1::name="a.pdf"::ctx=text}}');
      expect(result.text).toContain('{{DOC::id=2::name="b.xlsx"::ctx=text}}');
    });

    it('should replace month names in Portuguese context', () => {
      const textWithMonths = 'The data from January shows revenue. In February it increased.';
      const result = service.enforceLanguage(textWithMonths, 'pt');

      expect(result.text).toContain('Janeiro');
      expect(result.text).toContain('Fevereiro');
      expect(result.text).not.toMatch(/\bJanuary\b/i);
      expect(result.text).not.toMatch(/\bFebruary\b/i);
    });

    it('should replace connectors like However and Therefore', () => {
      // Use more English to trigger drift detection (>15% threshold)
      const textWithConnectors = 'The document shows growth. However, the data indicates risks. Therefore, the analysis recommends caution.';
      const result = service.enforceLanguage(textWithConnectors, 'pt');

      expect(result.text).toContain('No entanto,');
      expect(result.text).toContain('Portanto,');
      expect(result.text).not.toMatch(/\bHowever,\b/i);
      expect(result.text).not.toMatch(/\bTherefore,\b/i);
    });

    it('should handle Spanish enforcement', () => {
      const textWithEnglish = 'The document shows that los datos son importantes.';
      const result = service.enforceLanguage(textWithEnglish, 'es');

      expect(result.wasModified).toBe(true);
      expect(result.text).toContain('El documento');
    });

    it('should not modify English-targeted text', () => {
      const englishText = 'The document shows the total revenue is $200,750.';
      const result = service.enforceLanguage(englishText, 'en');

      // English doesn't need enforcement
      expect(result.wasModified).toBe(false);
    });
  });

  describe('needsEnforcement', () => {
    it('should return false for English target', () => {
      const text = 'Any text here with The document and According to.';
      const result = service.needsEnforcement(text, 'en');

      expect(result).toBe(false);
    });

    it('should return true for Portuguese text with English drift', () => {
      const mixedText = 'The document shows that os dados são importantes.';
      const result = service.needsEnforcement(mixedText, 'pt');

      expect(result).toBe(true);
    });

    it('should return false for correct Portuguese text', () => {
      const ptText = 'O documento mostra que os dados são importantes.';
      const result = service.needsEnforcement(ptText, 'pt');

      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only markers', () => {
      const markersOnly = '{{DOC::id=1::name="test.pdf"::ctx=text}}';
      const result = service.enforceLanguage(markersOnly, 'pt');

      expect(result.text).toBe(markersOnly);
    });

    it('should handle very long text', () => {
      const longText = 'O documento mostra dados. '.repeat(500) + 'The document shows that some data is important.';
      const result = service.enforceLanguage(longText, 'pt');

      expect(result.text).toContain('O documento mostra');
    });

    it('should preserve case of replaced phrases', () => {
      const textWithCases = 'the document shows data. THE DOCUMENT shows more.';
      const result = service.enforceLanguage(textWithCases, 'pt');

      // Should preserve original case pattern
      expect(result.text).not.toMatch(/\bthe document\b/i);
    });

    it('should handle text with financial terms', () => {
      const financialText = 'Total Revenue is $1M. Net Income was $500K. Operating Expenses are $200K.';
      const result = service.enforceLanguage(financialText, 'pt');

      expect(result.text).toContain('Receita Total');
      expect(result.text).toContain('Lucro Líquido');
      expect(result.text).toContain('Despesas Operacionais');
    });
  });
});
