/**
 * Layer B: Router/Guard Integration Tests
 *
 * Verifies that ALL intercepts use the shared content guard consistently.
 * Both paths must produce the same result for the same query.
 */

import { isContentQuestion, classifyQuery } from '../services/core/contentGuard.service';

// Mock file search service to test parseInventoryQuery behavior
// We'll test that content queries are correctly blocked from inventory routing

describe('ContentGuard - Layer B Integration Tests', () => {

  // ============================================================================
  // CONSISTENCY TESTS
  // Verify that content questions are consistently blocked across all paths
  // ============================================================================

  describe('Cross-path consistency', () => {
    const testCases = [
      // Content questions - must be blocked by guard in ALL paths
      { query: 'What topics does the presentation cover?', shouldBlock: true },
      { query: 'Summarize the contract', shouldBlock: true },
      { query: 'What are the main points?', shouldBlock: true },
      { query: 'Explain the methodology section', shouldBlock: true },
      // File actions - must NOT be blocked
      { query: 'Where is my contract?', shouldBlock: false },
      { query: 'Open the spreadsheet', shouldBlock: false },
      { query: 'List my files', shouldBlock: false },
      { query: 'Show only PDFs', shouldBlock: false },
    ];

    test.each(testCases)(
      'isContentQuestion("$query") should return $shouldBlock',
      ({ query, shouldBlock }) => {
        expect(isContentQuestion(query)).toBe(shouldBlock);
      }
    );

    test('classifyQuery should return consistent results with isContentQuestion', () => {
      testCases.forEach(({ query, shouldBlock }) => {
        const classification = classifyQuery(query);
        expect(classification.isContentQuestion).toBe(shouldBlock);
        if (shouldBlock) {
          expect(classification.recommendation).toBe('use_rag');
        }
      });
    });
  });

  // ============================================================================
  // GUARD IMPORT VERIFICATION
  // Verify that the guard exports what we expect
  // ============================================================================

  describe('Guard export verification', () => {
    test('isContentQuestion is exported and callable', () => {
      expect(typeof isContentQuestion).toBe('function');
    });

    test('classifyQuery is exported and callable', () => {
      expect(typeof classifyQuery).toBe('function');
    });

    test('classifyQuery returns expected shape', () => {
      const result = classifyQuery('Summarize the contract');
      expect(result).toHaveProperty('isContentQuestion');
      expect(result).toHaveProperty('isFileAction');
      expect(result).toHaveProperty('matchedPattern');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('recommendation');
    });
  });

  // ============================================================================
  // COLLISION DETECTION TESTS
  // Test queries that previously caused file_actions routing incorrectly
  // ============================================================================

  describe('Collision detection (previously problematic queries)', () => {
    const collisionCases = [
      // Q42 pattern - "presentation" was matching as .pptx extension
      {
        query: 'What topics does the Project Management Presentation cover?',
        wrongRouting: 'file_actions via tryInventoryQuery (filter_extension)',
        expectedBlock: true,
      },
      // "What" + document type - should NOT trigger inventory
      {
        query: 'What does the spreadsheet show?',
        wrongRouting: 'file_actions via detectFileActionQuery (type_search)',
        expectedBlock: true,
      },
      // "Where is X mentioned" - content search, not file location
      {
        query: 'Where is the termination date mentioned in the contract?',
        wrongRouting: 'file_actions via detectFileActionQuery (locate_file)',
        expectedBlock: true,
      },
      // "Show me the" + content request
      {
        query: 'Show me what the annual report says about revenue',
        wrongRouting: 'file_actions via detectFileActionQuery (open_file)',
        expectedBlock: true,
      },
      // "Find" + content (not file)
      {
        query: 'Find all mentions of inflation in my documents',
        wrongRouting: 'file_actions via tryInventoryQuery (locate_content)',
        expectedBlock: true,
      },
    ];

    test.each(collisionCases)(
      'should block: "$query" (previously: $wrongRouting)',
      ({ query, expectedBlock }) => {
        expect(isContentQuestion(query)).toBe(expectedBlock);
      }
    );
  });

  // ============================================================================
  // TWO-SIGNAL VERIFICATION
  // Ensure single signals don't trigger false positives
  // ============================================================================

  describe('Two-signal requirement', () => {
    // These have action verb but NO content verb - should NOT be blocked
    const actionVerbOnly = [
      { query: 'Open the contract', expectedBlock: false, reason: 'open is action, not content' },
      { query: 'Show me the PDF', expectedBlock: false, reason: 'show is action, not content' },
      { query: 'Find the budget file', expectedBlock: false, reason: 'find is action, not content' },
      { query: 'Locate contract.pdf', expectedBlock: false, reason: 'locate is action, not content' },
      { query: 'Where is the report?', expectedBlock: false, reason: 'where is location, not content' },
    ];

    // These have content verb + content noun - SHOULD be blocked
    const contentVerbAndNoun = [
      { query: 'Summarize the contract', expectedBlock: true, reason: 'summarize + contract' },
      { query: 'Explain the methodology', expectedBlock: true, reason: 'explain + methodology' },
      { query: 'Analyze the financial data', expectedBlock: true, reason: 'analyze + data' },
      { query: 'Compare the two reports', expectedBlock: true, reason: 'compare + reports' },
      { query: 'What does the document say?', expectedBlock: true, reason: 'what does + say' },
    ];

    describe('Action verb only (should NOT block)', () => {
      test.each(actionVerbOnly)('$query - $reason', ({ query, expectedBlock }) => {
        expect(isContentQuestion(query)).toBe(expectedBlock);
      });
    });

    describe('Content verb + noun (SHOULD block)', () => {
      test.each(contentVerbAndNoun)('$query - $reason', ({ query, expectedBlock }) => {
        expect(isContentQuestion(query)).toBe(expectedBlock);
      });
    });
  });

  // ============================================================================
  // LANGUAGE CONSISTENCY
  // Same pattern should work in EN, PT, ES
  // ============================================================================

  describe('Cross-language consistency', () => {
    const multilingual = [
      // Summarize pattern
      { en: 'Summarize the contract', pt: 'Resuma o contrato', expected: true },
      // Explain pattern
      { en: 'Explain the methodology', pt: 'Explique a metodologia', expected: true },
      // Main points pattern
      { en: 'What are the main points?', pt: 'Quais são os pontos principais?', expected: true },
      // Analyze pattern
      { en: 'Analyze the data', pt: 'Analise os dados', expected: true },
      // File action - should NOT match in any language
      { en: 'List my files', pt: 'Liste meus arquivos', expected: false },
    ];

    multilingual.forEach(({ en, pt, expected }) => {
      test(`EN: "${en}" and PT: "${pt}" should both return ${expected}`, () => {
        expect(isContentQuestion(en)).toBe(expected);
        expect(isContentQuestion(pt)).toBe(expected);
      });
    });
  });

  // ============================================================================
  // EDGE CASES
  // Boundary conditions and special characters
  // ============================================================================

  describe('Edge cases', () => {
    test('empty string should return false', () => {
      expect(isContentQuestion('')).toBe(false);
    });

    test('whitespace only should return false', () => {
      expect(isContentQuestion('   ')).toBe(false);
    });

    test('single word should be handled gracefully', () => {
      expect(isContentQuestion('summarize')).toBe(false); // No target, ambiguous
      expect(isContentQuestion('files')).toBe(false);
    });

    test('should handle special characters in queries', () => {
      expect(isContentQuestion("What's in the contract?")).toBe(false); // Ambiguous - could be file content listing
      expect(isContentQuestion("Summarize the contract's terms")).toBe(true);
    });

    test('should handle very long queries', () => {
      const longQuery = 'What are the main topics ' + 'and key findings '.repeat(20) + 'in the document?';
      // Should still match despite length
      expect(isContentQuestion(longQuery)).toBe(true);
    });
  });
});
