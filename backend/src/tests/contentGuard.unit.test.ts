/**
 * Layer A: Pattern Unit Tests for Content Guard
 *
 * Tests the isContentQuestion() function with:
 * - 20 positive patterns (MUST match as content questions)
 * - 20 negative patterns (MUST NOT match as content questions)
 * - 10 adversarial/borderline patterns (edge cases)
 */

import { isContentQuestion, classifyQuery } from '../services/core/contentGuard.service';

describe('ContentGuard - Layer A Pattern Unit Tests', () => {

  // ============================================================================
  // POSITIVE PATTERNS (20) - Must match as content questions
  // These should return TRUE and prevent file_actions routing
  // ============================================================================

  describe('Positive Patterns (must match as content questions)', () => {
    const positivePatterns = [
      // Summarize patterns
      { query: 'Summarize the contract', reason: 'summarize + document' },
      { query: 'Give me a summary of the report', reason: 'summary + document' },
      { query: 'Can you summarize this document?', reason: 'summarize + document' },

      // Explain patterns
      { query: 'Explain the methodology section', reason: 'explain + section' },
      { query: 'What does this paragraph mean?', reason: 'what does X mean' },
      { query: 'Explain how the algorithm works', reason: 'explain how' },

      // Topics/cover patterns (Q42 pattern)
      { query: 'What topics does the presentation cover?', reason: 'topics + cover' },
      { query: 'What areas does the report discuss?', reason: 'areas + discuss' },
      { query: 'What points does the document make?', reason: 'points + document' },

      // Main points/key patterns
      { query: 'What are the main points?', reason: 'main points' },
      { query: 'What are the key findings?', reason: 'key findings' },
      { query: 'List the key takeaways', reason: 'key takeaways' },

      // Analysis patterns
      { query: 'Analyze the financial data', reason: 'analyze + data' },
      { query: 'What is your analysis of the results?', reason: 'analysis' },
      { query: 'Can you analyze this chart?', reason: 'analyze + chart' },

      // Compare patterns
      { query: 'Compare the two reports', reason: 'compare' },
      { query: 'What are the differences between these documents?', reason: 'differences' },

      // Extract patterns
      { query: 'Extract the main arguments from the paper', reason: 'extract + arguments' },
      { query: 'What information can you extract?', reason: 'extract + information' },

      // Content questions with file type mentions
      { query: 'What does the PDF say about revenue?', reason: 'what does X say' },
    ];

    test.each(positivePatterns)('should match: "$query" ($reason)', ({ query }) => {
      expect(isContentQuestion(query)).toBe(true);
    });

    test('all positive patterns must match', () => {
      const results = positivePatterns.map(p => ({
        query: p.query,
        matched: isContentQuestion(p.query)
      }));
      const failures = results.filter(r => !r.matched);

      if (failures.length > 0) {
        console.log('Failed patterns:', failures);
      }

      expect(failures.length).toBe(0);
    });
  });

  // ============================================================================
  // NEGATIVE PATTERNS (20) - Must NOT match as content questions
  // These should return FALSE and allow file_actions routing when appropriate
  // ============================================================================

  describe('Negative Patterns (must NOT match as content questions)', () => {
    const negativePatterns = [
      // Pure file location queries
      { query: 'Where is my contract?', reason: 'where is' },
      { query: 'Which folder has the budget?', reason: 'which folder' },
      { query: 'Locate the financial report', reason: 'locate' },

      // File open queries
      { query: 'Open the spreadsheet', reason: 'open' },
      { query: 'Show me the PDF', reason: 'show me' },
      { query: 'Open my contract', reason: 'open' },

      // File listing queries
      { query: 'List my files', reason: 'list files' },
      { query: 'Show all documents', reason: 'show all' },
      { query: 'What files do I have?', reason: 'what files' },

      // File count queries
      { query: 'How many documents do I have?', reason: 'how many' },
      { query: 'Count my PDFs', reason: 'count' },

      // File type filtering
      { query: 'Show only Excel files', reason: 'show only' },
      { query: 'List all PDFs', reason: 'list all' },
      { query: 'Find PNG images', reason: 'find images' },

      // Navigation queries
      { query: 'Go to the Legal folder', reason: 'go to folder' },
      { query: 'Navigate to Documents', reason: 'navigate' },

      // File management
      { query: 'Delete the draft document', reason: 'delete' },
      { query: 'Rename file.pdf to contract.pdf', reason: 'rename' },
      { query: 'Move the file to Archive', reason: 'move' },

      // Help queries
      { query: 'How do I upload a file?', reason: 'how do I' },
    ];

    test.each(negativePatterns)('should NOT match: "$query" ($reason)', ({ query }) => {
      expect(isContentQuestion(query)).toBe(false);
    });

    test('all negative patterns must NOT match', () => {
      const results = negativePatterns.map(p => ({
        query: p.query,
        matched: isContentQuestion(p.query)
      }));
      const failures = results.filter(r => r.matched);

      if (failures.length > 0) {
        console.log('Incorrectly matched patterns:', failures);
      }

      expect(failures.length).toBe(0);
    });
  });

  // ============================================================================
  // ADVERSARIAL PATTERNS (10) - Borderline/edge cases
  // These test the two-signal approach: must have BOTH content verb + document noun
  // ============================================================================

  describe('Adversarial Patterns (borderline edge cases)', () => {
    // These should be CONTENT questions (match)
    const shouldMatch = [
      // Has both content verb AND document reference
      { query: 'Summarize the presentation slides', expected: true, reason: 'summarize (verb) + slides (noun)' },
      { query: 'What does the spreadsheet contain?', expected: true, reason: 'what does (verb) + spreadsheet (noun)' },
      { query: 'Explain the contract terms', expected: true, reason: 'explain (verb) + terms (noun)' },
    ];

    // These should NOT be content questions (no match)
    const shouldNotMatch = [
      // Has file reference but no content verb
      { query: 'Where is the presentation?', expected: false, reason: 'where (location) not content verb' },
      { query: 'Open the contract', expected: false, reason: 'open (action) not content verb' },
      { query: 'Find the spreadsheet', expected: false, reason: 'find (action) not content verb' },

      // Ambiguous - slight towards file action
      { query: 'Show me the contract', expected: false, reason: 'show me (display file) not analyze content' },
    ];

    // True edge cases - implementation decision
    const edgeCases = [
      // "What" without clear content verb - should NOT match (conservative)
      { query: 'What is my latest file?', expected: false, reason: 'what (inventory query) no content verb' },
      { query: 'What file was uploaded today?', expected: false, reason: 'what file (inventory) no content verb' },
      { query: 'What is in my Documents folder?', expected: false, reason: 'what is in (folder contents) not analysis' },
    ];

    describe('should MATCH (content queries with proper signals)', () => {
      test.each(shouldMatch)('$query - $reason', ({ query, expected }) => {
        expect(isContentQuestion(query)).toBe(expected);
      });
    });

    describe('should NOT MATCH (file actions despite document reference)', () => {
      test.each(shouldNotMatch)('$query - $reason', ({ query, expected }) => {
        expect(isContentQuestion(query)).toBe(expected);
      });
    });

    describe('edge cases (implementation decisions)', () => {
      test.each(edgeCases)('$query - $reason', ({ query, expected }) => {
        expect(isContentQuestion(query)).toBe(expected);
      });
    });
  });

  // ============================================================================
  // CLASSIFY QUERY TESTS
  // Tests the detailed classification function
  // ============================================================================

  describe('classifyQuery detailed results', () => {
    test('should classify content question with details', () => {
      const result = classifyQuery('Summarize the contract document');
      expect(result.isContentQuestion).toBe(true);
      expect(result.recommendation).toBe('use_rag');
    });

    test('should classify file action with details', () => {
      const result = classifyQuery('Where is my contract.pdf?');
      expect(result.isContentQuestion).toBe(false);
      expect(result.recommendation).toBe('allow_file_action');
    });

    test('should include matched pattern for debugging', () => {
      const result = classifyQuery('What topics does the report cover?');
      expect(result.isContentQuestion).toBe(true);
      expect(result.matchedPattern).toBeDefined();
      expect(result.matchedPattern).not.toBeNull();
    });
  });

  // ============================================================================
  // PORTUGUESE PATTERNS
  // Tests multilingual support
  // ============================================================================

  describe('Portuguese content questions', () => {
    const portuguesePatterns = [
      { query: 'Resuma o contrato', expected: true, reason: 'resuma = summarize' },
      { query: 'Explique a metodologia', expected: true, reason: 'explique = explain' },
      { query: 'Quais são os pontos principais?', expected: true, reason: 'pontos principais = main points' },
      { query: 'Analise os dados financeiros', expected: true, reason: 'analise = analyze' },
      { query: 'O que o documento diz sobre?', expected: true, reason: 'o que diz = what does it say' },
      // File actions in Portuguese should NOT match
      { query: 'Onde está meu arquivo?', expected: false, reason: 'onde está = where is' },
      { query: 'Abra o contrato', expected: false, reason: 'abra = open' },
      { query: 'Liste meus arquivos', expected: false, reason: 'liste = list' },
    ];

    test.each(portuguesePatterns)('PT: "$query" should be $expected ($reason)', ({ query, expected }) => {
      expect(isContentQuestion(query)).toBe(expected);
    });
  });

  // ============================================================================
  // REGRESSION TESTS
  // Specific queries that have failed in the past
  // ============================================================================

  describe('Regression tests (previously failing queries)', () => {
    test('Q42: What topics does the Project Management Presentation cover?', () => {
      const query = 'What topics does the Project Management Presentation cover?';
      expect(isContentQuestion(query)).toBe(true);
    });

    test('What are the main topics in the Project Management Presentation?', () => {
      const query = 'What are the main topics in the Project Management Presentation?';
      expect(isContentQuestion(query)).toBe(true);
    });

    test('presentation should not trigger file action when asking about content', () => {
      // This was the bug: "presentation" was being matched as .pptx extension
      const query = 'What does the presentation discuss?';
      expect(isContentQuestion(query)).toBe(true);
    });
  });
});
