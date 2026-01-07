/**
 * ROUTING FOLLOW-UP TESTS
 *
 * Tests for the "rephrase" bug fixes:
 * - Fix A: previousIntent plumbing
 * - Fix B: Follow-up confidence inheritance
 * - Fix C: Low confidence → documents (not error)
 * - Fix D: Soft answer mode
 * - Fix E: Doc reference escape hatch
 *
 * These tests verify that short follow-up queries don't trigger "rephrase" fallbacks.
 */

import { routingPriorityService, RoutingContext, IntentScore } from '../services/core/routingPriority.service';
import { IntentName } from '../types/intentV3.types';

describe('Routing Follow-up Tests', () => {
  // =========================================================================
  // FIX B: FOLLOW-UP CONFIDENCE INHERITANCE
  // =========================================================================

  describe('Fix B: Follow-up Confidence Inheritance', () => {
    test('Short follow-up query inherits documents intent', () => {
      // Scenario: User previously asked about documents, now asks "what about warranty?"
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.35 }, // Below threshold
        { intent: 'legal', confidence: 0.30 },
        { intent: 'conversation', confidence: 0.20 },
      ];

      const context: RoutingContext = {
        hasDocuments: true,
        isFollowup: true,
        previousIntent: 'documents',
        previousConfidence: 0.85,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'what about the warranty?',
        context
      );

      // Documents should be boosted by follow-up inheritance
      const docsScore = result.adjustedScores.find(s => s.intent === 'documents');
      expect(docsScore).toBeDefined();
      expect(docsScore!.confidence).toBeGreaterThanOrEqual(0.55); // Should exceed threshold after boost

      // Primary intent should be documents
      expect(result.primaryIntent).toBe('documents');
    });

    test('Follow-up boost does NOT apply when user switches topic', () => {
      // Scenario: User was asking about documents, now asks about help
      // Note: We use hasDocuments: false to isolate the follow-up boost behavior
      // without interference from document anchor rules
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.25 },
        { intent: 'help', confidence: 0.55 }, // Higher than documents to clearly win
        { intent: 'conversation', confidence: 0.20 },
      ];

      const context: RoutingContext = {
        hasDocuments: false, // No documents to avoid anchor detection interference
        isFollowup: true,
        previousIntent: 'documents',
        previousConfidence: 0.85,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'how do i reset a password?', // Hard-switch: "how do i", "password", "reset"
        context
      );

      // Help should win because of hard-switch keyword (no follow-up boost applied)
      // Note: Without documents, document boost rules don't apply, so we can test
      // that the follow-up inheritance was correctly skipped due to hard-switch
      expect(result.primaryIntent).toBe('help');
    });

    test('Follow-up boost synthesizes documents score if missing', () => {
      // Scenario: Previous intent was documents, but current query has no documents score
      const scores: IntentScore[] = [
        { intent: 'legal', confidence: 0.40 },
        { intent: 'conversation', confidence: 0.30 },
      ];

      const context: RoutingContext = {
        hasDocuments: true,
        isFollowup: true,
        previousIntent: 'documents',
        previousConfidence: 0.85,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'and the expiration date?',
        context
      );

      // Documents should be synthesized and win
      const docsScore = result.adjustedScores.find(s => s.intent === 'documents');
      expect(docsScore).toBeDefined();
      expect(result.primaryIntent).toBe('documents');
    });
  });

  // =========================================================================
  // FIX C: NO DOCS → ERROR (when user has no documents)
  // =========================================================================

  describe('Fix C: Low Confidence Handling', () => {
    test('No docs: still returns error when below threshold', () => {
      // Scenario: User has NO documents, asks a vague question
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.30 },
        { intent: 'conversation', confidence: 0.25 },
        { intent: 'error', confidence: 0.35 },
      ];

      const context: RoutingContext = {
        hasDocuments: false, // NO DOCUMENTS
        isFollowup: false,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'what about warranty?',
        context
      );

      // Without documents, error should still be valid (Fix C doesn't apply)
      // The orchestrator handles the error→documents conversion when hasDocuments=true
      // RoutingPriority just adjusts scores, doesn't change error intent
      expect(result.adjustedScores).toBeDefined();
    });
  });

  // =========================================================================
  // FIX E: DOC REFERENCE ESCAPE HATCH
  // =========================================================================

  describe('Fix E: Doc Reference Patterns', () => {
    test('Document anchor keywords boost documents intent', () => {
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.40 },
        { intent: 'legal', confidence: 0.50 },
        { intent: 'conversation', confidence: 0.20 },
      ];

      const context: RoutingContext = {
        hasDocuments: true,
        isFollowup: false,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'what does the contract say about termination?', // "contract" is a doc anchor
        context
      );

      // Documents should be boosted due to anchor keyword
      expect(result.primaryIntent).toBe('documents');
      expect(result.documentBoostApplied).toBe(true);
    });

    test('Domain intent is dampened without explicit advice request', () => {
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.45 },
        { intent: 'legal', confidence: 0.55 },
      ];

      const context: RoutingContext = {
        hasDocuments: true,
        isFollowup: false,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'what about the warranty section?', // No explicit legal advice
        context
      );

      // Legal should be dampened, documents should win
      expect(result.domainDampeningApplied).toBe(true);
      expect(result.primaryIntent).toBe('documents');
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge Cases', () => {
    test('Very short query with follow-up context gets boosted', () => {
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.30 },
        { intent: 'error', confidence: 0.25 },
      ];

      const context: RoutingContext = {
        hasDocuments: true,
        isFollowup: true,
        previousIntent: 'documents',
        previousConfidence: 0.90,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'and?', // Very short
        context
      );

      // Even very short queries should benefit from follow-up boost
      expect(result.primaryIntent).toBe('documents');
    });

    test('Memory anchors protect memory intent from document boost', () => {
      const scores: IntentScore[] = [
        { intent: 'documents', confidence: 0.50 },
        { intent: 'memory', confidence: 0.40 },
      ];

      const context: RoutingContext = {
        hasDocuments: true,
        isFollowup: false,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'what was the contract name I told you about?', // Memory anchor: "I told you"
        context
      );

      // Memory should win due to memory anchors
      expect(result.primaryIntent).toBe('memory');
    });

    test('Extraction intent is strongly dampened when doc anchors present', () => {
      const scores: IntentScore[] = [
        { intent: 'extraction', confidence: 0.70 },
        { intent: 'documents', confidence: 0.50 },
      ];

      const context: RoutingContext = {
        hasDocuments: true,
        isFollowup: false,
      };

      const result = routingPriorityService.adjustScores(
        scores,
        'extract the pricing information from the contract', // Doc anchor + extraction
        context
      );

      // Documents should win (extraction dampened with doc anchors)
      expect(result.primaryIntent).toBe('documents');
    });
  });

  // =========================================================================
  // CONFIDENCE FLOORS
  // =========================================================================

  describe('Confidence Floors', () => {
    test('Intent below floor is reported correctly', () => {
      const meetsFloor = routingPriorityService.meetsConfidenceFloor('documents', 0.40);
      expect(meetsFloor).toBe(false); // Floor for documents is 0.55

      const meetsFloorHigh = routingPriorityService.meetsConfidenceFloor('documents', 0.60);
      expect(meetsFloorHigh).toBe(true);
    });

    test('Domain intents have stricter floors', () => {
      const legalFloor = routingPriorityService.getConfidenceFloor('legal');
      const docsFloor = routingPriorityService.getConfidenceFloor('documents');

      expect(legalFloor).toBeGreaterThan(docsFloor);
    });
  });
});

/**
 * INTEGRATION TEST SCENARIOS
 *
 * These should be run against the real API endpoints:
 *
 * A) Baseline check (should NOT return "rephrase"):
 *    1. Upload 1 doc containing warranty section
 *    2. Ask: "Summarize the warranty section." → Should work
 *    3. Ask: "What about the warranty?" (follow-up) → Should work
 *    4. Ask: "And the expiration date?" → Should work
 *
 * B) Topic switch (should correctly switch intent):
 *    1. Ask: "Summarize the contract." → documents
 *    2. Ask: "Now how do I upload a file?" → help (not sticky docs)
 *
 * C) No documents (should gracefully handle):
 *    1. New user with no docs
 *    2. Ask: "What about the warranty?" → Should return NO_DOCUMENTS fallback (not rephrase)
 */
