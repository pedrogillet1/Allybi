/**
 * Decision Tree Service Tests
 *
 * Tests for the family/sub-intent based routing decision tree.
 */

import {
  decide,
  DecisionSignals,
  DecisionResult,
  requiresRetrieval,
  isErrorDecision,
  getFallbackScenario,
} from '../services/core/decisionTree.service';
import { PredictedIntent } from '../types/intentV3.types';

// Helper to create a mock PredictedIntent
function createMockIntent(
  primaryIntent: string,
  confidence: number = 0.8,
  matchedKeywords: string[] = [],
  metadata?: Record<string, any>
): PredictedIntent {
  return {
    primaryIntent: primaryIntent as any,
    confidence,
    language: 'en',
    matchedKeywords,
    metadata: {
      rawQuery: matchedKeywords.join(' '),
      ...metadata,
    },
  };
}

// Helper to create DecisionSignals
function createSignals(
  intent: PredictedIntent,
  hasDocs: boolean = true,
  isRewrite: boolean = false,
  isFollowup: boolean = false
): DecisionSignals {
  return {
    predicted: intent,
    hasDocs,
    isRewrite,
    isFollowup,
  };
}

describe('Decision Tree Service', () => {
  describe('decide() - Family Classification', () => {
    describe('Documents Family', () => {
      it('routes summarize to documents/summary', () => {
        const intent = createMockIntent('documents', 0.8, ['summarize', 'document']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('summary');
      });

      it('routes "give me an overview" to documents/summary', () => {
        const intent = createMockIntent('documents', 0.8, ['overview', 'report']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('summary');
      });

      it('routes compare to documents/compare', () => {
        const intent = createMockIntent('documents', 0.8, ['compare', 'documents']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('compare');
      });

      it('routes "what is the difference" to documents/compare', () => {
        const intent = createMockIntent('documents', 0.8, ['difference', 'between']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('compare');
      });

      it('routes analytics queries to documents/analytics', () => {
        const intent = createMockIntent('documents', 0.8, ['how many', 'documents']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('analytics');
      });

      it('routes count queries to documents/analytics', () => {
        const intent = createMockIntent('documents', 0.8, ['count', 'items']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('analytics');
      });

      it('routes extract queries to documents/extract', () => {
        const intent = createMockIntent('documents', 0.8, ['extract', 'clause']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('extract');
      });

      it('routes section/quote queries to documents/extract', () => {
        const intent = createMockIntent('documents', 0.8, ['quote', 'section', 'about']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('extract');
      });

      it('routes "list my documents" to documents/manage', () => {
        const intent = createMockIntent('documents', 0.8, ['list', 'my', 'documents']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('manage');
      });

      it('routes search queries to documents/search', () => {
        const intent = createMockIntent('documents', 0.8, ['search', 'for', 'report']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('search');
      });

      it('routes find queries to documents/search', () => {
        const intent = createMockIntent('documents', 0.8, ['find', 'contract']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('search');
      });

      it('routes generic document questions to documents/factual', () => {
        const intent = createMockIntent('documents', 0.8, ['what', 'is', 'the', 'deadline']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('documents');
        expect(decision.subIntent).toBe('factual');
      });

      it('routes domain-specific intents to documents family', () => {
        const domains = ['excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'];

        for (const domain of domains) {
          const intent = createMockIntent(domain, 0.8, ['question']);
          const decision = decide(createSignals(intent, true));

          expect(decision.family).toBe('documents');
        }
      });
    });

    describe('Error Family - No Documents', () => {
      it('falls back to error/no_document when no docs and doc query', () => {
        const intent = createMockIntent('documents', 0.6, ['find', 'document']);
        const decision = decide(createSignals(intent, false));

        expect(decision.family).toBe('error');
        expect(decision.subIntent).toBe('no_document');
      });

      it('falls back to error when summarize requested but no docs', () => {
        const intent = createMockIntent('documents', 0.8, ['summarize', 'my', 'files']);
        const decision = decide(createSignals(intent, false));

        expect(decision.family).toBe('error');
        expect(decision.subIntent).toBe('no_document');
      });

      it('falls back to error when domain intent but no docs', () => {
        const intent = createMockIntent('excel', 0.8, ['spreadsheet', 'data']);
        const decision = decide(createSignals(intent, false));

        expect(decision.family).toBe('error');
        expect(decision.subIntent).toBe('no_document');
      });

      it('returns correct fallback scenario for no_document', () => {
        const intent = createMockIntent('documents', 0.8, ['find', 'file']);
        const decision = decide(createSignals(intent, false));

        expect(getFallbackScenario(decision)).toBe('NO_DOCUMENTS');
      });
    });

    describe('Edit Family', () => {
      it('routes rewrite to edit/rewrite', () => {
        const intent = createMockIntent('edit', 0.8, ['rewrite', 'this']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
        expect(decision.subIntent).toBe('rewrite');
      });

      it('routes simplify to edit/simplify', () => {
        const intent = createMockIntent('edit', 0.8, ['simplify', 'explanation']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
        expect(decision.subIntent).toBe('simplify');
      });

      it('routes "explain like I\'m 5" to edit/simplify', () => {
        const intent = createMockIntent('edit', 0.8, ['eli5', 'concept']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
        expect(decision.subIntent).toBe('simplify');
      });

      it('routes expand to edit/expand', () => {
        const intent = createMockIntent('edit', 0.8, ['expand', 'on', 'this']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
        expect(decision.subIntent).toBe('expand');
      });

      it('routes "more details" to edit/expand', () => {
        const intent = createMockIntent('edit', 0.8, ['more', 'details']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
        expect(decision.subIntent).toBe('expand');
      });

      it('routes translate to edit/translate', () => {
        const intent = createMockIntent('edit', 0.8, ['translate', 'to', 'spanish']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
        expect(decision.subIntent).toBe('translate');
      });

      it('routes format to edit/format', () => {
        const intent = createMockIntent('edit', 0.8, ['format', 'as', 'bullet']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
        expect(decision.subIntent).toBe('format');
      });

      it('detects edit family from patterns even with documents intent', () => {
        const intent = createMockIntent('documents', 0.8, ['rewrite', 'this', 'answer']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('edit');
      });

      it('handles isRewrite signal override', () => {
        const intent = createMockIntent('documents', 0.8, ['question']);
        const decision = decide(createSignals(intent, true, true)); // isRewrite = true

        expect(decision.family).toBe('edit');
      });
    });

    describe('Help Family', () => {
      it('routes product help queries to help family', () => {
        const intent = createMockIntent('help', 0.8, ['how', 'to', 'use']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('help');
      });

      it('routes upload questions to help/product', () => {
        const intent = createMockIntent('help', 0.8, ['how', 'to', 'upload']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('help');
        expect(decision.subIntent).toBe('product');
      });

      it('routes tutorial requests to help/tutorial', () => {
        const intent = createMockIntent('help', 0.8, ['tutorial', 'getting', 'started']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('help');
        expect(decision.subIntent).toBe('tutorial');
      });

      it('routes feature discovery to help/feature', () => {
        const intent = createMockIntent('help', 0.8, ['what', 'can', 'you', 'do']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('help');
        expect(decision.subIntent).toBe('feature');
      });

      it('detects help from patterns even without help intent', () => {
        const intent = createMockIntent('documents', 0.5, ['how', 'to', 'upload', 'file']);
        const decision = decide(createSignals(intent, false));

        expect(decision.family).toBe('help');
      });
    });

    describe('Conversation Family', () => {
      it('routes conversation intent to conversation family', () => {
        const intent = createMockIntent('conversation', 0.8, ['hello']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('conversation');
        expect(decision.subIntent).toBe('general');
      });
    });

    describe('Other Families', () => {
      it('routes reasoning intent to reasoning family', () => {
        const intent = createMockIntent('reasoning', 0.8, ['calculate']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('reasoning');
        expect(decision.subIntent).toBe('general');
      });

      it('routes memory intent to memory family', () => {
        const intent = createMockIntent('memory', 0.8, ['remember']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('memory');
        expect(decision.subIntent).toBe('general');
      });

      it('routes preferences intent to preferences family', () => {
        const intent = createMockIntent('preferences', 0.8, ['change', 'language']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('preferences');
        expect(decision.subIntent).toBe('general');
      });

      it('routes extraction intent to extraction family', () => {
        const intent = createMockIntent('extraction', 0.8, ['what', 'are', 'you']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('extraction');
        expect(decision.subIntent).toBe('general');
      });

      it('routes error intent to error family', () => {
        const intent = createMockIntent('error', 0.8, ['gibberish']);
        const decision = decide(createSignals(intent, true));

        expect(decision.family).toBe('error');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('requiresRetrieval()', () => {
      it('returns true for documents/factual', () => {
        const decision: DecisionResult = {
          family: 'documents',
          subIntent: 'factual',
          confidence: 0.8,
          reason: 'test',
        };
        expect(requiresRetrieval(decision)).toBe(true);
      });

      it('returns true for documents/summary', () => {
        const decision: DecisionResult = {
          family: 'documents',
          subIntent: 'summary',
          confidence: 0.8,
          reason: 'test',
        };
        expect(requiresRetrieval(decision)).toBe(true);
      });

      it('returns true for documents/compare', () => {
        const decision: DecisionResult = {
          family: 'documents',
          subIntent: 'compare',
          confidence: 0.8,
          reason: 'test',
        };
        expect(requiresRetrieval(decision)).toBe(true);
      });

      it('returns false for documents/manage', () => {
        const decision: DecisionResult = {
          family: 'documents',
          subIntent: 'manage',
          confidence: 0.8,
          reason: 'test',
        };
        expect(requiresRetrieval(decision)).toBe(false);
      });

      it('returns false for help family', () => {
        const decision: DecisionResult = {
          family: 'help',
          subIntent: 'product',
          confidence: 0.8,
          reason: 'test',
        };
        expect(requiresRetrieval(decision)).toBe(false);
      });

      it('returns false for edit family', () => {
        const decision: DecisionResult = {
          family: 'edit',
          subIntent: 'rewrite',
          confidence: 0.8,
          reason: 'test',
        };
        expect(requiresRetrieval(decision)).toBe(false);
      });
    });

    describe('isErrorDecision()', () => {
      it('returns true for error family', () => {
        const decision: DecisionResult = {
          family: 'error',
          subIntent: 'no_document',
          confidence: 0.5,
          reason: 'test',
        };
        expect(isErrorDecision(decision)).toBe(true);
      });

      it('returns false for documents family', () => {
        const decision: DecisionResult = {
          family: 'documents',
          subIntent: 'factual',
          confidence: 0.8,
          reason: 'test',
        };
        expect(isErrorDecision(decision)).toBe(false);
      });
    });

    describe('getFallbackScenario()', () => {
      it('returns NO_DOCUMENTS for no_document sub-intent', () => {
        const decision: DecisionResult = {
          family: 'error',
          subIntent: 'no_document',
          confidence: 0.5,
          reason: 'test',
        };
        expect(getFallbackScenario(decision)).toBe('NO_DOCUMENTS');
      });

      it('returns RETRIEVAL_ERROR for not_found sub-intent', () => {
        const decision: DecisionResult = {
          family: 'error',
          subIntent: 'not_found',
          confidence: 0.5,
          reason: 'test',
        };
        expect(getFallbackScenario(decision)).toBe('RETRIEVAL_ERROR');
      });

      it('returns AMBIGUOUS_QUESTION for ambiguous sub-intent', () => {
        const decision: DecisionResult = {
          family: 'error',
          subIntent: 'ambiguous',
          confidence: 0.5,
          reason: 'test',
        };
        expect(getFallbackScenario(decision)).toBe('AMBIGUOUS_QUESTION');
      });

      it('returns OUT_OF_SCOPE for out_of_scope sub-intent', () => {
        const decision: DecisionResult = {
          family: 'error',
          subIntent: 'out_of_scope',
          confidence: 0.5,
          reason: 'test',
        };
        expect(getFallbackScenario(decision)).toBe('OUT_OF_SCOPE');
      });

      it('returns undefined for non-error family', () => {
        const decision: DecisionResult = {
          family: 'documents',
          subIntent: 'factual',
          confidence: 0.8,
          reason: 'test',
        };
        expect(getFallbackScenario(decision)).toBeUndefined();
      });
    });
  });

  describe('Decision Reason String', () => {
    it('includes family, sub-intent, and confidence in reason', () => {
      const intent = createMockIntent('documents', 0.85, ['summarize']);
      const decision = decide(createSignals(intent, true));

      expect(decision.reason).toContain('family=documents');
      expect(decision.reason).toContain('sub=summary');
      expect(decision.reason).toContain('conf=0.85');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty keywords gracefully', () => {
      const intent = createMockIntent('documents', 0.8, []);
      const decision = decide(createSignals(intent, true));

      expect(decision.family).toBe('documents');
      expect(decision.subIntent).toBe('factual');
    });

    it('handles missing metadata gracefully', () => {
      const intent: PredictedIntent = {
        primaryIntent: 'documents',
        confidence: 0.8,
        language: 'en',
      };
      const decision = decide(createSignals(intent, true));

      expect(decision.family).toBe('documents');
    });

    it('handles unknown intent gracefully', () => {
      const intent = createMockIntent('unknown_intent' as any, 0.8, ['test']);
      const decision = decide(createSignals(intent, true));

      // Should default to documents if hasDocs, or conversation if not
      expect(['documents', 'conversation']).toContain(decision.family);
    });
  });
});
