/**
 * Help Misroute Regression Tests
 *
 * Ensures the help intent is NOT triggered for document-content questions.
 * This is a critical regression suite to prevent "Help Response for Document Questions" bugs.
 *
 * Key scenarios tested:
 * 1. Follow-up queries in document context should NOT route to help
 * 2. Queries mentioning "guide" as a document name should NOT route to help
 * 3. Portuguese/Spanish queries about document content should NOT route to help
 * 4. Explicit help requests should still route to help
 */

import { decide, DecisionSignals } from '../services/core/decisionTree.service';
import { PredictedIntent, IntentName } from '../types/intentV3.types';

/**
 * Helper to create decision signals for testing
 */
function createSignals(
  intent: IntentName,
  hasDocs: boolean,
  rawQuery: string,
  previousIntent?: IntentName
): DecisionSignals {
  const predicted: PredictedIntent = {
    primaryIntent: intent,
    confidence: 0.80,
    language: 'en',
    matchedKeywords: rawQuery.toLowerCase().split(/\s+/),
    metadata: { rawQuery },
  };

  return {
    predicted,
    hasDocs,
    isRewrite: false,
    isFollowup: !!previousIntent,
    previousIntent,
  };
}

describe('Help Misroute Prevention', () => {
  describe('Document follow-up queries should NOT route to help', () => {
    const followupQueries = [
      { query: 'Com base nesses números, qual foi o mês de melhor performance?', lang: 'pt' },
      { query: 'E por quê?', lang: 'pt' },
      { query: 'Julho foi outlier?', lang: 'pt' },
      { query: 'Based on those numbers, what was the best month?', lang: 'en' },
      { query: 'And why?', lang: 'en' },
      { query: 'Was July an outlier?', lang: 'en' },
    ];

    test.each(followupQueries)(
      'should route "$query" to documents when previous intent was documents',
      ({ query }) => {
        // When previous turn was document-related, follow-up should NOT go to help
        const signals = createSignals('documents', true, query, 'documents');
        const decision = decide(signals);
        expect(decision.family).not.toBe('help');
      }
    );

    test.each(followupQueries)(
      'should route "$query" to documents even if help intent is predicted',
      ({ query }) => {
        // Even if intent engine predicts help, decision tree should block it
        const signals = createSignals('help', true, query, 'documents');
        const decision = decide(signals);
        expect(decision.family).not.toBe('help');
      }
    );
  });

  describe('Guide-reference queries should NOT route to help', () => {
    const guideQueries = [
      'What does the Integration Guide propose?',
      'O que o guia propõe em termos de arquitetura?',
      'Per the guide, what is the recommendation?',
      'According to the guide, what should I do?',
      'In the guide, what does it say about performance?',
    ];

    test.each(guideQueries)(
      'should route "%s" to documents, not help',
      (query) => {
        // "guide" as document name should NOT trigger help
        const signals = createSignals('help', true, query, 'documents');
        const decision = decide(signals);
        expect(decision.family).toBe('documents');
      }
    );
  });

  describe('Implicit document context queries should NOT route to help', () => {
    const implicitContextQueries = [
      'O que isso significa?',
      'Explique melhor',
      'Sobre esse aspecto...',
      'What does this mean?',
      'Explain more',
      'About this aspect...',
    ];

    test.each(implicitContextQueries)(
      'should route "%s" to documents when previous intent was documents',
      (query) => {
        const signals = createSignals('help', true, query, 'documents');
        const decision = decide(signals);
        expect(decision.family).not.toBe('help');
      }
    );
  });

  describe('Explicit help requests should STILL route to help', () => {
    const explicitHelpQueries = [
      'Help me understand how to use Koda',
      'Ajuda com upload de arquivos',
      'What is Koda?',
      'O que é Koda?',
      'How do I use Koda?',
      'Como usar Koda?',
    ];

    test.each(explicitHelpQueries)(
      'should route "%s" to help even when previous intent was documents',
      (query) => {
        const signals = createSignals('help', true, query, 'documents');
        const decision = decide(signals);
        expect(decision.family).toBe('help');
      }
    );

    test.each(explicitHelpQueries)(
      'should route "%s" to help with no previous context',
      (query) => {
        const signals = createSignals('help', true, query, undefined);
        const decision = decide(signals);
        expect(decision.family).toBe('help');
      }
    );
  });

  describe('First-turn document queries should NOT route to help', () => {
    const firstTurnDocQueries = [
      'What does the document say about revenue?',
      'O que o documento fala sobre vendas?',
      'Summarize the PDF for me',
      // Note: "Can you find..." is ambiguous - could be doc search or feature question
      // We test less ambiguous document queries here
    ];

    test.each(firstTurnDocQueries)(
      'should route "%s" to documents on first turn',
      (query) => {
        // These are document queries, should NOT go to help even on first turn
        const signals = createSignals('documents', true, query, undefined);
        const decision = decide(signals);
        expect(decision.family).toBe('documents');
      }
    );
  });

  describe('Product usage queries should route to help', () => {
    // These are explicit product usage questions that should always route to help
    const productUsageQueries = [
      'How do I upload a file?',
      'Where do I find my uploaded documents?',
      'How do I change my account settings?',
      'Help me understand how Koda works',
    ];

    test.each(productUsageQueries)(
      'should route "%s" to help (product usage)',
      (query) => {
        const signals = createSignals('help', false, query, undefined);
        const decision = decide(signals);
        expect(decision.family).toBe('help');
      }
    );
  });
});

describe('Intent Pattern Changes Verification', () => {
  describe('Removed conflicting keywords', () => {
    test('help keywords should not include "guide"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsEN = patterns.intents.help.keywords.en as string[];
      expect(helpKeywordsEN).not.toContain('guide');
    });

    test('help keywords should not include "guia"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsPT = patterns.intents.help.keywords.pt as string[];
      expect(helpKeywordsPT).not.toContain('guia');
    });

    test('help keywords should not include "guía"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsES = patterns.intents.help.keywords.es as string[];
      expect(helpKeywordsES).not.toContain('guía');
    });

    test('help keywords should not include generic "how to"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsEN = patterns.intents.help.keywords.en as string[];
      // Should not include bare "how to" but can include "how to use koda"
      expect(helpKeywordsEN).not.toContain('how to');
      expect(helpKeywordsEN).not.toContain('how do i');
      expect(helpKeywordsEN).not.toContain('how can i');
    });

    test('help keywords should not include generic "can you"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsEN = patterns.intents.help.keywords.en as string[];
      expect(helpKeywordsEN).not.toContain('can you');
      expect(helpKeywordsEN).not.toContain('can koda');
      expect(helpKeywordsEN).not.toContain('does koda');
    });
  });

  describe('Help keywords should still include product-specific terms', () => {
    test('help keywords should include "help"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsEN = patterns.intents.help.keywords.en as string[];
      expect(helpKeywordsEN).toContain('help');
    });

    test('help keywords should include "tutorial"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsEN = patterns.intents.help.keywords.en as string[];
      expect(helpKeywordsEN).toContain('tutorial');
    });

    test('help keywords should include "upload"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsEN = patterns.intents.help.keywords.en as string[];
      expect(helpKeywordsEN).toContain('upload');
    });

    test('help keywords should include "what is koda"', async () => {
      const patterns = await import('../data/intent_patterns.runtime.json');
      const helpKeywordsEN = patterns.intents.help.keywords.en as string[];
      expect(helpKeywordsEN).toContain('what is koda');
    });
  });
});
