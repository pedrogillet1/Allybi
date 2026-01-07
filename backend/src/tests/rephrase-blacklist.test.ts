/**
 * REPHRASE BLACKLIST TEST
 *
 * 50+ realistic user queries that should NEVER trigger "rephrase" responses.
 * This is a regression test for the "rephrase" bug fix.
 *
 * Run with: npx jest src/tests/rephrase-blacklist.test.ts
 */

import { routingPriorityService, IntentScore } from '../services/core/routingPriority.service';
import { IntentName } from '../types/intentV3.types';

// ============================================================================
// TEST DATA: 50+ REALISTIC QUERIES
// ============================================================================

interface TestQuery {
  query: string;
  category: string;
  expectedIntent?: IntentName; // If specified, assert this intent
  hasDocuments: boolean;
  isFollowup: boolean;
  previousIntent?: IntentName;
}

const BLACKLIST_QUERIES: TestQuery[] = [
  // ============================================================================
  // CATEGORY: SHORT FOLLOW-UPS (High risk for "rephrase")
  // ============================================================================
  { query: 'and?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'more?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'details?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'dates?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'why?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'how?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'when?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'where?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'who?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'examples?', category: 'short_followup', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },

  // ============================================================================
  // CATEGORY: IMPLICIT REFERENCES
  // ============================================================================
  { query: 'what about that?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'and the other one?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'the warranty?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'expiration date?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'what about section 5?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'the penalties?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'and the fees?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'that last part?', category: 'implicit_ref', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },

  // ============================================================================
  // CATEGORY: VAGUE BUT VALID DOCUMENT QUESTIONS
  // ============================================================================
  { query: 'what does it say?', category: 'vague_doc', hasDocuments: true, isFollowup: false },
  { query: 'what is this about?', category: 'vague_doc', hasDocuments: true, isFollowup: false },
  { query: 'summarize this', category: 'vague_doc', hasDocuments: true, isFollowup: false },
  { query: 'explain it', category: 'vague_doc', hasDocuments: true, isFollowup: false },
  { query: 'what are the key points?', category: 'vague_doc', hasDocuments: true, isFollowup: false },
  { query: 'any important dates?', category: 'vague_doc', hasDocuments: true, isFollowup: false },
  { query: 'anything about payments?', category: 'vague_doc', hasDocuments: true, isFollowup: false },
  { query: 'tell me about the contract', category: 'vague_doc', hasDocuments: true, isFollowup: false },

  // ============================================================================
  // CATEGORY: MIXED LANGUAGE (EN/PT)
  // ============================================================================
  { query: 'resumo do documento', category: 'portuguese', hasDocuments: true, isFollowup: false },
  { query: 'qual é a data?', category: 'portuguese', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'e os valores?', category: 'portuguese', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'mais detalhes?', category: 'portuguese', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'resumen del contrato', category: 'spanish', hasDocuments: true, isFollowup: false },
  { query: 'y la garantía?', category: 'spanish', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },

  // ============================================================================
  // CATEGORY: DOCUMENT EXTRACTION QUERIES
  // ============================================================================
  { query: 'list all names', category: 'extraction', hasDocuments: true, isFollowup: false },
  { query: 'extract the amounts', category: 'extraction', hasDocuments: true, isFollowup: false },
  { query: 'find all dates', category: 'extraction', hasDocuments: true, isFollowup: false },
  { query: 'get the phone numbers', category: 'extraction', hasDocuments: true, isFollowup: false },
  { query: 'pull the addresses', category: 'extraction', hasDocuments: true, isFollowup: false },
  { query: 'show me the totals', category: 'extraction', hasDocuments: true, isFollowup: false },

  // ============================================================================
  // CATEGORY: COMPARISON QUERIES
  // ============================================================================
  { query: 'compare the two sections', category: 'comparison', hasDocuments: true, isFollowup: false },
  { query: 'what is the difference?', category: 'comparison', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'which is better?', category: 'comparison', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'compare these clauses', category: 'comparison', hasDocuments: true, isFollowup: false },

  // ============================================================================
  // CATEGORY: CLARIFICATION REQUESTS
  // ============================================================================
  { query: 'what do you mean?', category: 'clarification', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'can you explain that?', category: 'clarification', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'I dont understand', category: 'clarification', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'simplify please', category: 'clarification', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },

  // ============================================================================
  // CATEGORY: SPECIFIC BUT SHORT
  // ============================================================================
  { query: 'termination clause', category: 'specific_short', hasDocuments: true, isFollowup: false },
  { query: 'payment terms', category: 'specific_short', hasDocuments: true, isFollowup: false },
  { query: 'effective date', category: 'specific_short', hasDocuments: true, isFollowup: false },
  { query: 'warranty period', category: 'specific_short', hasDocuments: true, isFollowup: false },
  { query: 'renewal terms', category: 'specific_short', hasDocuments: true, isFollowup: false },

  // ============================================================================
  // CATEGORY: EDGE CASE FORMATTING
  // ============================================================================
  { query: '   what about this?   ', category: 'formatting', hasDocuments: true, isFollowup: true, previousIntent: 'documents' },
  { query: 'WHAT IS THE SUMMARY', category: 'formatting', hasDocuments: true, isFollowup: false },
  { query: 'summary???', category: 'formatting', hasDocuments: true, isFollowup: false },
  { query: 'whats in it', category: 'formatting', hasDocuments: true, isFollowup: false },
];

// ============================================================================
// HELPER: Generate scores for a query (simplified simulation)
// ============================================================================

function generateScoresForQuery(query: string, hasDocuments: boolean): IntentScore[] {
  const scores: IntentScore[] = [];
  const lowerQuery = query.toLowerCase();
  const wordCount = query.trim().split(/\s+/).length;

  // Documents score - higher if doc anchors present
  let docsScore = 0.30;
  if (/document|contract|file|report|this|that|the/.test(lowerQuery)) {
    docsScore += 0.20;
  }
  if (hasDocuments) {
    docsScore += 0.10;
  }
  scores.push({ intent: 'documents', confidence: Math.min(docsScore, 0.70) });

  // Extraction score
  if (/extract|list|find|get|pull|show/.test(lowerQuery)) {
    scores.push({ intent: 'extraction', confidence: 0.55 });
  }

  // Legal/Finance score (domain intents)
  if (/warranty|termination|clause|penalty|legal/.test(lowerQuery)) {
    scores.push({ intent: 'legal', confidence: 0.45 });
  }
  if (/payment|amount|price|cost|value|fee/.test(lowerQuery)) {
    scores.push({ intent: 'finance', confidence: 0.40 });
  }

  // Conversation score - higher for very short
  let convScore = 0.20;
  if (wordCount <= 2) {
    convScore += 0.15;
  }
  scores.push({ intent: 'conversation', confidence: convScore });

  // Error score - should be low
  scores.push({ intent: 'error', confidence: 0.15 });

  return scores;
}

// ============================================================================
// TESTS
// ============================================================================

describe('7️⃣ Rephrase Blacklist Test (50+ queries)', () => {
  describe('All queries should NOT route to error intent', () => {
    BLACKLIST_QUERIES.forEach((testCase, index) => {
      test(`[${index + 1}] "${testCase.query}" (${testCase.category})`, () => {
        const scores = generateScoresForQuery(testCase.query, testCase.hasDocuments);

        const result = routingPriorityService.adjustScores(
          scores,
          testCase.query,
          {
            hasDocuments: testCase.hasDocuments,
            isFollowup: testCase.isFollowup,
            previousIntent: testCase.previousIntent,
            previousConfidence: testCase.previousIntent ? 0.80 : undefined,
          }
        );

        // CRITICAL: Should NEVER route to error when documents exist
        if (testCase.hasDocuments) {
          expect(result.primaryIntent).not.toBe('error');
        }

        // Confidence should be above threshold after adjustments
        expect(result.primaryConfidence).toBeGreaterThan(0.3);

        // If expected intent specified, verify it
        if (testCase.expectedIntent) {
          expect(result.primaryIntent).toBe(testCase.expectedIntent);
        }
      });
    });
  });

  describe('Summary statistics', () => {
    test('All categories represented', () => {
      const categories = new Set(BLACKLIST_QUERIES.map(q => q.category));
      expect(categories.size).toBeGreaterThanOrEqual(10);
    });

    test('Total queries is 50+', () => {
      expect(BLACKLIST_QUERIES.length).toBeGreaterThanOrEqual(50);
    });

    test('Follow-up queries included', () => {
      const followups = BLACKLIST_QUERIES.filter(q => q.isFollowup);
      expect(followups.length).toBeGreaterThanOrEqual(20);
    });

    test('Non-English queries included', () => {
      const nonEnglish = BLACKLIST_QUERIES.filter(q =>
        q.category === 'portuguese' || q.category === 'spanish'
      );
      expect(nonEnglish.length).toBeGreaterThanOrEqual(5);
    });
  });
});

// ============================================================================
// ADDITIONAL: Specific "rephrase" pattern detection
// ============================================================================

describe('Specific Anti-Rephrase Checks', () => {
  const highRiskQueries = [
    'what about the warranty?',
    'and the expiration?',
    'more details please',
    'explain further',
    'what is this?',
  ];

  highRiskQueries.forEach(query => {
    test(`High-risk query "${query}" routes correctly`, () => {
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.35 },
        { intent: 'conversation', confidence: 0.25 },
        { intent: 'error', confidence: 0.20 },
      ];

      const result = routingPriorityService.adjustScores(
        scores,
        query,
        {
          hasDocuments: true,
          isFollowup: true,
          previousIntent: 'documents',
          previousConfidence: 0.85,
        }
      );

      // These should all route to documents, not error
      expect(result.primaryIntent).toBe('documents');
      expect(result.primaryConfidence).toBeGreaterThan(0.5);
    });
  });
});
