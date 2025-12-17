/**
 * Unit tests for KodaIntentEngineV3
 */

import { KodaIntentEngineV3 } from '../services/core/kodaIntentEngineV3.service';
import { IntentConfigService } from '../services/core/intentConfig.service';
import { ILanguageDetector, DefaultLanguageDetector } from '../services/core/languageDetector.service';
import { LanguageCode } from '../types/intentV3.types';

class MockIntentConfigService {
  private patterns: Record<string, any> = {};

  setPatterns(patterns: Record<string, any>) {
    this.patterns = patterns;
  }

  getAllPatterns() {
    return this.patterns;
  }

  getKeywords(intentName: string, language: LanguageCode): string[] {
    const pattern = this.patterns[intentName];
    if (!pattern) return [];
    return pattern.keywordsByLang?.[language] || pattern.keywordsByLang?.['en'] || [];
  }

  getRegexPatterns(intentName: string, language: LanguageCode): RegExp[] {
    const pattern = this.patterns[intentName];
    if (!pattern) return [];
    return pattern.patternsByLang?.[language] || pattern.patternsByLang?.['en'] || [];
  }

  isReady() { return true; }
  getStatistics() { return { totalIntents: 0, totalKeywords: 0, totalPatterns: 0 }; }
}

class MockLanguageDetector implements ILanguageDetector {
  private language: LanguageCode = 'en';
  setLanguage(lang: LanguageCode) { this.language = lang; }
  async detect(): Promise<LanguageCode> { return this.language; }
}

describe('KodaIntentEngineV3', () => {
  let mockConfig: MockIntentConfigService;
  let mockLangDetector: MockLanguageDetector;
  let engine: KodaIntentEngineV3;

  beforeEach(() => {
    mockConfig = new MockIntentConfigService();
    mockLangDetector = new MockLanguageDetector();
    engine = new KodaIntentEngineV3(mockConfig as unknown as IntentConfigService, mockLangDetector);
  });

  describe('DI Compliance', () => {
    it('throws error when intentConfig is not provided', () => {
      expect(() => new KodaIntentEngineV3(null as any)).toThrow('[IntentEngine] intentConfig is REQUIRED');
    });

    it('uses DefaultLanguageDetector when none provided', () => {
      const e = new KodaIntentEngineV3(mockConfig as unknown as IntentConfigService);
      expect(e).toBeDefined();
    });
  });

  describe('Deterministic Scoring', () => {
    it('clamps priority and finalScore to valid range', async () => {
      mockConfig.setPatterns({
        TEST: { name: 'TEST', keywordsByLang: { en: ['test'] }, patternsByLang: { en: [] }, priority: 150 }
      });
      const result = await engine.predict({ text: 'test', language: 'en' });
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AMBIGUOUS Threshold', () => {
    it('returns AMBIGUOUS when score is below threshold', async () => {
      mockConfig.setPatterns({
        LOW: { name: 'LOW', keywordsByLang: { en: ['word1', 'word2', 'word3', 'word4', 'word5'] }, patternsByLang: { en: [] }, priority: 50 }
      });
      const result = await engine.predict({ text: 'word1 is here', language: 'en' });
      expect(result.primaryIntent).toBe('AMBIGUOUS');
      expect(result.confidence).toBe(0.3);
    });

    it('returns matched intent when score exceeds threshold', async () => {
      mockConfig.setPatterns({
        HIGH: { name: 'HIGH', keywordsByLang: { en: ['hello'] }, patternsByLang: { en: [] }, priority: 100 }
      });
      const result = await engine.predict({ text: 'hello world', language: 'en' });
      expect(result.primaryIntent).toBe('HIGH');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('Regex Pattern Matching', () => {
    it('regex match gives score of 1.0', async () => {
      mockConfig.setPatterns({
        REGEX: { name: 'REGEX', keywordsByLang: { en: [] }, patternsByLang: { en: [/^how many documents/i] }, priority: 100 }
      });
      const result = await engine.predict({ text: 'how many documents do I have?', language: 'en' });
      expect(result.primaryIntent).toBe('REGEX');
      expect(result.confidence).toBe(1.0);
    });
  });
});

describe('DefaultLanguageDetector', () => {
  let detector: DefaultLanguageDetector;
  beforeEach(() => { detector = new DefaultLanguageDetector(); });

  it('detects English text', async () => {
    expect(await detector.detect('how are you')).toBe('en');
  });

  it('defaults to English for unknown text', async () => {
    expect(await detector.detect('xyz 123')).toBe('en');
  });
});
