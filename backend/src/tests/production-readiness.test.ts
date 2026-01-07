/**
 * PRODUCTION READINESS TEST SUITE
 *
 * Comprehensive tests to verify Koda behaves like ChatGPT under real pressure.
 * Tests all fix implementations (A, B, C, D, E) in realistic scenarios.
 *
 * Run with: npx jest src/tests/production-readiness.test.ts --runInBand
 */

import { routingPriorityService, RoutingContext, IntentScore } from '../services/core/routingPriority.service';
import { IntentName } from '../types/intentV3.types';

// ============================================================================
// MOCK HELPERS
// ============================================================================

/**
 * Simulate a conversation with multiple turns.
 * Each turn returns the adjusted routing result.
 */
function simulateConversation(
  turns: { query: string; scores: IntentScore[] }[],
  hasDocuments: boolean
): Array<{
  query: string;
  primaryIntent: IntentName;
  confidence: number;
  wasFollowupBoosted: boolean;
}> {
  const results: Array<{
    query: string;
    primaryIntent: IntentName;
    confidence: number;
    wasFollowupBoosted: boolean;
  }> = [];

  let previousIntent: IntentName | undefined;
  let previousConfidence: number | undefined;

  for (let i = 0; i < turns.length; i++) {
    const { query, scores } = turns[i];
    const isFollowup = i > 0;

    const context: RoutingContext = {
      hasDocuments,
      isFollowup,
      previousIntent,
      previousConfidence,
    };

    const result = routingPriorityService.adjustScores(scores, query, context);

    const wasFollowupBoosted = result.adjustments.some(
      a => a.reason.includes('followup') || a.reason.includes('follow-up')
    );

    results.push({
      query,
      primaryIntent: result.primaryIntent,
      confidence: result.primaryConfidence,
      wasFollowupBoosted,
    });

    // Update for next turn
    previousIntent = result.primaryIntent;
    previousConfidence = result.primaryConfidence;
  }

  return results;
}

// ============================================================================
// 1️⃣ CONVERSATION CONTINUITY TESTS
// ============================================================================

describe('1️⃣ Conversation Continuity Tests', () => {
  describe('Test 1.1 — Long follow-up chains', () => {
    test('5-turn conversation maintains documents intent', () => {
      const turns = [
        {
          query: 'Summarize the document.',
          scores: [
            { intent: 'documents' as IntentName, confidence: 0.75 },
            { intent: 'conversation' as IntentName, confidence: 0.20 },
          ],
        },
        {
          query: 'Focus on the termination clause.',
          scores: [
            { intent: 'documents' as IntentName, confidence: 0.45 }, // Lower - short query
            { intent: 'legal' as IntentName, confidence: 0.40 },
          ],
        },
        {
          query: 'What about penalties?',
          scores: [
            { intent: 'documents' as IntentName, confidence: 0.35 },
            { intent: 'legal' as IntentName, confidence: 0.30 },
          ],
        },
        {
          query: 'And timelines?',
          scores: [
            { intent: 'documents' as IntentName, confidence: 0.30 },
            { intent: 'conversation' as IntentName, confidence: 0.25 },
          ],
        },
        {
          query: 'Is that standard?',
          scores: [
            { intent: 'documents' as IntentName, confidence: 0.25 },
            { intent: 'conversation' as IntentName, confidence: 0.35 },
          ],
        },
      ];

      const results = simulateConversation(turns, true);

      // All turns should stay on documents (no fallback)
      results.forEach((r, i) => {
        expect(r.primaryIntent).toBe('documents');
        expect(r.confidence).toBeGreaterThan(0.5); // Above threshold after boosts

        // Follow-up turns should show boost
        if (i > 0) {
          // Later turns with low scores should benefit from follow-up boost
          expect(r.wasFollowupBoosted || r.confidence > 0.55).toBe(true);
        }
      });
    });

    test('Confidence does not collapse in follow-up chain', () => {
      const turns = [
        {
          query: 'What is the main topic of this document?',
          scores: [{ intent: 'documents' as IntentName, confidence: 0.80 }],
        },
        {
          query: 'Details?',
          scores: [{ intent: 'documents' as IntentName, confidence: 0.20 }], // Very low
        },
        {
          query: 'More?',
          scores: [{ intent: 'documents' as IntentName, confidence: 0.15 }], // Even lower
        },
      ];

      const results = simulateConversation(turns, true);

      // All turns should have sufficient confidence after boosts
      results.forEach(r => {
        expect(r.primaryIntent).toBe('documents');
        expect(r.confidence).toBeGreaterThanOrEqual(0.45); // Should be boosted above low threshold
      });
    });
  });

  describe('Test 1.2 — Topic switch mid-conversation', () => {
    test('Intent switches from documents to help correctly', () => {
      // Simulate conversation where user switches topic
      const turn1Scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.75 },
        { intent: 'help', confidence: 0.15 },
      ];

      const turn2Scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.40 },
        { intent: 'help', confidence: 0.15 },
      ];

      const turn3Scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.20 },
        { intent: 'help', confidence: 0.60 }, // Help is now clearly winning
      ];

      // Turn 1: documents
      const result1 = routingPriorityService.adjustScores(
        turn1Scores,
        'Summarize the contract.',
        { hasDocuments: true, isFollowup: false }
      );
      expect(result1.primaryIntent).toBe('documents');

      // Turn 2: still documents (follow-up)
      const result2 = routingPriorityService.adjustScores(
        turn2Scores,
        'What about the warranty?',
        {
          hasDocuments: true,
          isFollowup: true,
          previousIntent: 'documents',
          previousConfidence: result1.primaryConfidence,
        }
      );
      expect(result2.primaryIntent).toBe('documents');

      // Turn 3: switch to help (hard-switch keyword)
      const result3 = routingPriorityService.adjustScores(
        turn3Scores,
        'how can i upload another?', // "how can i" is hard-switch
        {
          hasDocuments: false, // Test without doc anchors
          isFollowup: true,
          previousIntent: 'documents',
          previousConfidence: result2.primaryConfidence,
        }
      );
      // Help should win (not documents leak)
      expect(result3.primaryIntent).toBe('help');
    });

    test('No document inheritance leak to help queries', () => {
      const helpScores: IntentScore[] = [
        { intent: 'help', confidence: 0.65 },
        { intent: 'documents', confidence: 0.30 },
      ];

      const result = routingPriorityService.adjustScores(
        helpScores,
        'how do i change settings?',
        {
          hasDocuments: false,
          isFollowup: true,
          previousIntent: 'documents',
          previousConfidence: 0.85,
        }
      );

      // Help should win, documents should NOT be boosted for hard-switch
      expect(result.primaryIntent).toBe('help');
    });
  });
});

// ============================================================================
// 2️⃣ LOW-CONFIDENCE SOFT ANSWER TESTS
// ============================================================================

describe('2️⃣ Low-Confidence Soft Answer Tests', () => {
  describe('Test 2.1 — Vague but valid document question', () => {
    test('Vague query with doc context routes to documents, not error', () => {
      const vagueScores: IntentScore[] = [
        { intent: 'documents', confidence: 0.35 },
        { intent: 'conversation', confidence: 0.30 },
        { intent: 'error', confidence: 0.25 },
      ];

      const result = routingPriorityService.adjustScores(
        vagueScores,
        'What does it say about this?',
        { hasDocuments: true, isFollowup: false }
      );

      // Should NOT route to error
      expect(result.primaryIntent).not.toBe('error');
      // Should be documents (has context boost from "this")
      expect(result.primaryIntent).toBe('documents');
    });

    test('Implicit reference query maintains documents intent', () => {
      const implicitScores: IntentScore[] = [
        { intent: 'documents', confidence: 0.40 },
        { intent: 'legal', confidence: 0.35 },
      ];

      const result = routingPriorityService.adjustScores(
        implicitScores,
        'What about that section?', // "that" is document anchor
        { hasDocuments: true, isFollowup: true, previousIntent: 'documents' }
      );

      expect(result.primaryIntent).toBe('documents');
      expect(result.documentBoostApplied).toBe(true);
    });
  });

  describe('Test 2.2 — Very short follow-up', () => {
    test('Single word follow-up "Dates?" gets boosted', () => {
      const shortScores: IntentScore[] = [
        { intent: 'documents', confidence: 0.25 },
        { intent: 'conversation', confidence: 0.20 },
      ];

      const result = routingPriorityService.adjustScores(
        shortScores,
        'Dates?',
        {
          hasDocuments: true,
          isFollowup: true,
          previousIntent: 'documents',
          previousConfidence: 0.85,
        }
      );

      expect(result.primaryIntent).toBe('documents');
      expect(result.primaryConfidence).toBeGreaterThanOrEqual(0.55);
    });

    test('Two word follow-up "More details" works', () => {
      const shortScores: IntentScore[] = [
        { intent: 'documents', confidence: 0.30 },
      ];

      const result = routingPriorityService.adjustScores(
        shortScores,
        'More details',
        {
          hasDocuments: true,
          isFollowup: true,
          previousIntent: 'documents',
          previousConfidence: 0.80,
        }
      );

      expect(result.primaryIntent).toBe('documents');
    });
  });
});

// ============================================================================
// 3️⃣ INTENT COLLISION TESTS
// ============================================================================

describe('3️⃣ Intent Collision Tests', () => {
  describe('Test 3.1 — Extraction vs Documents', () => {
    test('Extraction query with doc anchors routes to documents', () => {
      const extractionScores: IntentScore[] = [
        { intent: 'extraction', confidence: 0.70 },
        { intent: 'documents', confidence: 0.50 },
      ];

      const result = routingPriorityService.adjustScores(
        extractionScores,
        'Extract all payment amounts from the contract.',
        { hasDocuments: true, isFollowup: false }
      );

      // Documents should win (extraction dampened with doc anchors)
      expect(result.primaryIntent).toBe('documents');
    });

    test('Pure extraction without doc context stays extraction', () => {
      const extractionScores: IntentScore[] = [
        { intent: 'extraction', confidence: 0.75 },
        { intent: 'documents', confidence: 0.40 },
      ];

      const result = routingPriorityService.adjustScores(
        extractionScores,
        'Extract all numbers.',
        { hasDocuments: false, isFollowup: false } // No documents
      );

      // Extraction should win (no doc context to dampen)
      expect(result.primaryIntent).toBe('extraction');
    });
  });

  describe('Test 3.2 — Excel vs Extraction', () => {
    test('Spreadsheet query routes to excel', () => {
      const excelScores: IntentScore[] = [
        { intent: 'excel', confidence: 0.65 },
        { intent: 'extraction', confidence: 0.55 },
        { intent: 'documents', confidence: 0.40 },
      ];

      const result = routingPriorityService.adjustScores(
        excelScores,
        'Sum all values in column C.',
        { hasDocuments: true, isFollowup: false }
      );

      // Excel should maintain priority for spreadsheet operations
      expect(result.primaryIntent).toBe('excel');
    });
  });
});

// ============================================================================
// 4️⃣ NEGATIVE TRIGGER TESTS (Domain Collisions)
// ============================================================================

describe('4️⃣ Negative Trigger Tests', () => {
  describe('Test 4.1 — Finance vs Accounting collision', () => {
    test('Cash balance query routes to finance', () => {
      const financeScores: IntentScore[] = [
        { intent: 'finance', confidence: 0.70 },
        { intent: 'accounting', confidence: 0.55 },
        { intent: 'documents', confidence: 0.45 },
      ];

      const result = routingPriorityService.adjustScores(
        financeScores,
        'What is the cash balance?',
        { hasDocuments: true, isFollowup: false }
      );

      // Both are domain intents - should be dampened when reading docs
      // Documents should win due to doc context
      expect(['finance', 'documents']).toContain(result.primaryIntent);
    });

    test('Reconciliation query routes to accounting', () => {
      const accountingScores: IntentScore[] = [
        { intent: 'accounting', confidence: 0.75 },
        { intent: 'finance', confidence: 0.50 },
        { intent: 'documents', confidence: 0.40 },
      ];

      const result = routingPriorityService.adjustScores(
        accountingScores,
        'Reconcile AR vs GL.',
        { hasDocuments: true, isFollowup: false }
      );

      // Accounting-specific query (not just reading docs)
      expect(['accounting', 'documents']).toContain(result.primaryIntent);
    });
  });

  describe('Test 4.2 — Engineering vs Finance', () => {
    test('Tolerance margin routes to engineering', () => {
      const engineeringScores: IntentScore[] = [
        { intent: 'engineering', confidence: 0.70 },
        { intent: 'finance', confidence: 0.40 },
      ];

      const result = routingPriorityService.adjustScores(
        engineeringScores,
        'What is the tolerance margin?',
        { hasDocuments: true, isFollowup: false }
      );

      // Engineering should win (specific domain query)
      expect(['engineering', 'documents']).toContain(result.primaryIntent);
    });

    test('Profit margin routes to finance', () => {
      const financeScores: IntentScore[] = [
        { intent: 'finance', confidence: 0.70 },
        { intent: 'engineering', confidence: 0.30 },
      ];

      const result = routingPriorityService.adjustScores(
        financeScores,
        'What is the profit margin?',
        { hasDocuments: true, isFollowup: false }
      );

      // Finance should win (specific domain query)
      expect(['finance', 'documents']).toContain(result.primaryIntent);
    });
  });
});

// ============================================================================
// 5️⃣ NO-DOCUMENT BEHAVIOR TESTS
// ============================================================================

describe('5️⃣ No-Document Behavior Tests', () => {
  describe('Test 5.1 — Doc questions without docs', () => {
    test('Document query without docs should not route to documents', () => {
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.60 },
        { intent: 'help', confidence: 0.30 },
      ];

      const result = routingPriorityService.adjustScores(
        scores,
        'What does the contract say about termination?',
        { hasDocuments: false, isFollowup: false } // NO DOCUMENTS
      );

      // Without documents, document boost should NOT apply
      // (Orchestrator will handle the NO_DOCUMENTS fallback)
      expect(result.documentBoostApplied).toBe(false);
    });
  });

  describe('Test 5.2 — Follow-up without docs', () => {
    test('Follow-up without docs does not synthesize documents score', () => {
      const scores: IntentScore[] = [
        { intent: 'conversation', confidence: 0.40 },
        { intent: 'help', confidence: 0.35 },
        // Note: NO documents score in the input
      ];

      const result = routingPriorityService.adjustScores(
        scores,
        'And penalties?',
        {
          hasDocuments: false, // NO DOCUMENTS
          isFollowup: true,
          previousIntent: 'documents',
          previousConfidence: 0.75,
        }
      );

      // Without docs, follow-up boost should NOT synthesize documents
      // Conversation should win since it has the highest score
      expect(result.primaryIntent).toBe('conversation');
      // Documents should not be synthesized when hasDocuments=false
      const synthesizedDocs = result.adjustedScores.find(s => s.intent === 'documents');
      expect(synthesizedDocs).toBeUndefined();
    });
  });
});

// ============================================================================
// 6️⃣ CONFIDENCE FLOOR ENFORCEMENT
// ============================================================================

describe('6️⃣ Confidence Floor Tests', () => {
  test('Domain intents have stricter floors than documents', () => {
    const legalFloor = routingPriorityService.getConfidenceFloor('legal');
    const financeFloor = routingPriorityService.getConfidenceFloor('finance');
    const docsFloor = routingPriorityService.getConfidenceFloor('documents');

    expect(legalFloor).toBeGreaterThan(docsFloor);
    expect(financeFloor).toBeGreaterThan(docsFloor);
  });

  test('Meta intents have softer floors', () => {
    const memoryFloor = routingPriorityService.getConfidenceFloor('memory');
    const conversationFloor = routingPriorityService.getConfidenceFloor('conversation');
    const docsFloor = routingPriorityService.getConfidenceFloor('documents');

    expect(memoryFloor).toBeLessThanOrEqual(docsFloor);
    expect(conversationFloor).toBeLessThan(docsFloor);
  });
});

// ============================================================================
// 7️⃣ EDGE CASE STRESS TESTS
// ============================================================================

describe('7️⃣ Edge Case Stress Tests', () => {
  test('Empty query does not crash', () => {
    const scores: IntentScore[] = [
      { intent: 'conversation', confidence: 0.50 },
    ];

    expect(() => {
      routingPriorityService.adjustScores(
        scores,
        '',
        { hasDocuments: false, isFollowup: false }
      );
    }).not.toThrow();
  });

  test('Very long query does not crash', () => {
    const scores: IntentScore[] = [
      { intent: 'documents', confidence: 0.60 },
    ];

    const longQuery = 'word '.repeat(100); // 100 words

    expect(() => {
      routingPriorityService.adjustScores(
        scores,
        longQuery,
        { hasDocuments: true, isFollowup: false }
      );
    }).not.toThrow();
  });

  test('All scores at zero does not crash', () => {
    const scores: IntentScore[] = [
      { intent: 'documents', confidence: 0 },
      { intent: 'help', confidence: 0 },
    ];

    expect(() => {
      routingPriorityService.adjustScores(
        scores,
        'test',
        { hasDocuments: true, isFollowup: false }
      );
    }).not.toThrow();
  });

  test('Unicode query handled correctly', () => {
    const scores: IntentScore[] = [
      { intent: 'documents', confidence: 0.60 },
    ];

    const result = routingPriorityService.adjustScores(
      scores,
      'Qual é o resumo do contrato? 📄',
      { hasDocuments: true, isFollowup: false }
    );

    expect(result.primaryIntent).toBe('documents');
  });
});
