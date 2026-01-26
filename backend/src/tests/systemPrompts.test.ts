/**
 * SystemPrompts Service Test Suite
 * Tests the unified prompt system with comparison rules, greeting logic, and context handling
 */

import { systemPromptsService, PromptOptions, AnswerLength } from '../systemPrompts.service';

describe('SystemPromptsService - getSystemPrompt', () => {
  describe('Basic Functionality', () => {
    test('should return a system prompt with base ADAPTIVE_SYSTEM_PROMPT', () => {
      const result = systemPromptsService.getSystemPrompt('What is in the document?');

      expect(result).toContain('You are KODA');
      expect(result).toContain('professional document AI assistant');
      expect(result).toContain('User Query');
    });

    test('should include query in the prompt', () => {
      const query = 'What are the key findings?';
      const result = systemPromptsService.getSystemPrompt(query);

      expect(result).toContain('**User Query**: What are the key findings?');
    });
  });

  describe('Answer Length Configuration', () => {
    test('should include short answer length instructions', () => {
      const result = systemPromptsService.getSystemPrompt('Test query', 'short');

      expect(result).toContain('**Query Complexity**: SIMPLE');
      expect(result).toContain('1-2 sentences');
    });

    test('should include medium answer length instructions (default)', () => {
      const result = systemPromptsService.getSystemPrompt('Test query');

      expect(result).toContain('**Query Complexity**: MEDIUM');
      expect(result).toContain('2-3 sentences');
    });

    test('should include summary answer length instructions', () => {
      const result = systemPromptsService.getSystemPrompt('Test query', 'summary');

      expect(result).toContain('**Query Complexity**: COMPLEX');
      expect(result).toContain('Multiple paragraphs');
    });

    test('should include long answer length instructions', () => {
      const result = systemPromptsService.getSystemPrompt('Test query', 'long');

      expect(result).toContain('**Query Complexity**: COMPLEX');
      expect(result).toContain('Multiple paragraphs');
    });
  });

  describe('Greeting Logic', () => {
    test('should require greeting for first message', () => {
      const options: PromptOptions = {
        isFirstMessage: true
      };
      const result = systemPromptsService.getSystemPrompt('Hello', 'medium', options);

      expect(result).toContain('**GREETING REQUIRED**');
      expect(result).toContain('FIRST message');
      expect(result).toContain('Hey!');
    });

    test('should prohibit greeting for follow-up message with conversation history', () => {
      const options: PromptOptions = {
        conversationHistory: 'User: Previous message\nAssistant: Previous response'
      };
      const result = systemPromptsService.getSystemPrompt('Follow-up question', 'medium', options);

      expect(result).toContain('**NO GREETING**');
      expect(result).toContain('follow-up message');
      expect(result).toContain('Jump straight to answering');
    });

    test('should not add greeting instruction if neither first message nor history', () => {
      const result = systemPromptsService.getSystemPrompt('Test query');

      expect(result).not.toContain('**GREETING REQUIRED**');
      expect(result).not.toContain('**NO GREETING**');
    });
  });

  describe('Comparison Rules', () => {
    test('should append comparison rules when isComparison is true', () => {
      const options: PromptOptions = {
        isComparison: true
      };
      const result = systemPromptsService.getSystemPrompt('Compare A and B', 'medium', options);

      expect(result).toContain('DETAILED COMPARISON RULES');
      expect(result).toContain('Mandatory Table Format');
      expect(result).toContain('ALWAYS use a comparison table');
      expect(result).toContain('| Aspect | Item 1 | Item 2 |');
    });

    test('should include comparison analysis requirements', () => {
      const options: PromptOptions = {
        isComparison: true
      };
      const result = systemPromptsService.getSystemPrompt('Compare documents', 'medium', options);

      expect(result).toContain('Add 1-2 paragraphs of analysis');
      expect(result).toContain('NO separate "Key Differences:" heading');
      expect(result).toContain('NO "Next step:" section');
    });

    test('should not append comparison rules when isComparison is false', () => {
      const result = systemPromptsService.getSystemPrompt('What is in the document?');

      // Note: The base ADAPTIVE_SYSTEM_PROMPT contains embedded comparison rules
      // The COMPARISON_RULES constant is only appended when isComparison is true
      // So we just verify the additional COMPARISON_RULES section is not duplicated
      const comparisonRuleMatches = (result.match(/DETAILED COMPARISON RULES/g) || []).length;
      expect(comparisonRuleMatches).toBeLessThanOrEqual(1); // Should only appear once (from base prompt)
    });
  });

  describe('Context Sections', () => {
    test('should append document context when provided', () => {
      const options: PromptOptions = {
        documentContext: 'This is the document content about project planning.'
      };
      const result = systemPromptsService.getSystemPrompt('Summarize', 'medium', options);

      expect(result).toContain('**Retrieved Document Content**:');
      expect(result).toContain('This is the document content about project planning.');
    });

    test('should append document locations when provided', () => {
      const options: PromptOptions = {
        documentLocations: 'Document A (page 5), Document B (slide 3)'
      };
      const result = systemPromptsService.getSystemPrompt('Where is this info?', 'medium', options);

      expect(result).toContain('**Document Sources**:');
      expect(result).toContain('Document A (page 5), Document B (slide 3)');
    });

    test('should append memory context when provided', () => {
      const options: PromptOptions = {
        memoryContext: 'User previously asked about sales data'
      };
      const result = systemPromptsService.getSystemPrompt('What about Q2?', 'medium', options);

      expect(result).toContain('**Relevant Memory Context**:');
      expect(result).toContain('User previously asked about sales data');
    });

    test('should append folder tree context when provided', () => {
      const options: PromptOptions = {
        folderTreeContext: '- Marketing/\n  - Q1_Report.pdf\n  - Q2_Report.pdf'
      };
      const result = systemPromptsService.getSystemPrompt('Show me the structure', 'medium', options);

      expect(result).toContain('**Folder Structure**:');
      expect(result).toContain('Marketing/');
      expect(result).toContain('Q1_Report.pdf');
    });

    test('should append conversation history when provided', () => {
      const options: PromptOptions = {
        conversationHistory: 'User: What is KODA?\nAssistant: KODA is a document AI assistant.'
      };
      const result = systemPromptsService.getSystemPrompt('Tell me more', 'medium', options);

      expect(result).toContain('**Conversation History**:');
      expect(result).toContain('What is KODA?');
      expect(result).toContain('KODA is a document AI assistant.');
    });
  });

  describe('Combined Options', () => {
    test('should handle multiple options together', () => {
      const options: PromptOptions = {
        isFirstMessage: true,
        isComparison: true,
        documentContext: 'Document A: Sales report\nDocument B: Marketing report',
        conversationHistory: undefined // First message shouldn't have history
      };
      const result = systemPromptsService.getSystemPrompt('Compare A and B', 'medium', options);

      // Should have greeting
      expect(result).toContain('**GREETING REQUIRED**');

      // Should have comparison rules
      expect(result).toContain('DETAILED COMPARISON RULES');

      // Should have document context
      expect(result).toContain('**Retrieved Document Content**:');
      expect(result).toContain('Sales report');

      // Should have query
      expect(result).toContain('Compare A and B');
    });

    test('should handle follow-up comparison with history', () => {
      const options: PromptOptions = {
        isComparison: true,
        conversationHistory: 'User: What are the documents about?\nAssistant: They are about sales and marketing.',
        documentContext: 'Document content here'
      };
      const result = systemPromptsService.getSystemPrompt('Now compare them', 'medium', options);

      // Should NOT have greeting
      expect(result).toContain('**NO GREETING**');

      // Should have comparison rules
      expect(result).toContain('DETAILED COMPARISON RULES');

      // Should have conversation history
      expect(result).toContain('**Conversation History**:');
    });
  });

  describe('Prompt Order and Structure', () => {
    test('should maintain proper section ordering', () => {
      const options: PromptOptions = {
        isFirstMessage: true,
        isComparison: true,
        documentContext: 'Doc content',
        documentLocations: 'Doc A, Doc B',
        memoryContext: 'Memory',
        folderTreeContext: 'Folders',
        conversationHistory: undefined
      };
      const result = systemPromptsService.getSystemPrompt('Test query', 'medium', options);

      // Base prompt should come first
      const baseIndex = result.indexOf('You are KODA');
      expect(baseIndex).toBeGreaterThan(-1);

      // Length config should come after base
      const lengthIndex = result.indexOf('**Query Complexity**');
      expect(lengthIndex).toBeGreaterThan(baseIndex);

      // Greeting should come after length config
      const greetingIndex = result.indexOf('**GREETING REQUIRED**');
      expect(greetingIndex).toBeGreaterThan(lengthIndex);

      // Document context should come after greeting/comparison rules
      const docContextIndex = result.indexOf('**Retrieved Document Content**');
      expect(docContextIndex).toBeGreaterThan(greetingIndex);

      // Query should come last
      const queryIndex = result.indexOf('**User Query**: Test query');
      expect(queryIndex).toBeGreaterThan(docContextIndex);
    });
  });
});

describe('SystemPromptsService - Legacy Methods', () => {
  describe('getPromptConfigForGoal', () => {
    test('should return config with psychological goal', () => {
      const config = systemPromptsService.getPromptConfigForGoal('fast_answer', 'short');

      expect(config.systemPrompt).toContain('You are KODA');
      expect(config.temperature).toBe(0.1); // fast_answer uses low temperature
      expect(config.maxTokens).toBeGreaterThan(0);
    });

    test('should use different temperatures for different goals', () => {
      const fastConfig = systemPromptsService.getPromptConfigForGoal('fast_answer');
      const insightConfig = systemPromptsService.getPromptConfigForGoal('insight');

      expect(fastConfig.temperature).toBeLessThan(insightConfig.temperature);
    });
  });

  describe('buildPromptForGoal', () => {
    test('should build complete prompt with context', () => {
      const result = systemPromptsService.buildPromptForGoal(
        'clarity',
        'Compare these documents',
        'Document content here',
        'medium'
      );

      expect(result).toContain('You are KODA');
      expect(result).toContain('**User Query**: Compare these documents');
      expect(result).toContain('**Retrieved Document Content**:');
      expect(result).toContain('Document content here');
    });

    test('should handle first message greeting in buildPromptForGoal', () => {
      const result = systemPromptsService.buildPromptForGoal(
        'fast_answer',
        'Hello',
        'Context',
        'short',
        [] // Empty conversation history = first message
      );

      expect(result).toContain('**GREETING**');
      expect(result).toContain('FIRST message');
    });
  });
});
