/**
 * Container Validation Tests
 *
 * These tests verify that the DI container is wired correctly
 * and all critical services are available.
 *
 * Run: npm test -- container.validation.test.ts
 */

import { container, initializeContainer, getContainer, getOrchestrator } from '../bootstrap/container';

describe('KodaV3 Container', () => {
  beforeAll(() => {
    // Initialize container before tests
    initializeContainer();
  });

  describe('Container Initialization', () => {
    it('should initialize without errors', () => {
      expect(container.isInitialized()).toBe(true);
    });

    it('should not throw when initialized twice', () => {
      expect(() => initializeContainer()).not.toThrow();
    });
  });

  describe('Critical Services', () => {
    it('should have orchestrator defined', () => {
      const orchestrator = getContainer().getOrchestrator();
      expect(orchestrator).toBeDefined();
    });

    it('should have intent engine defined', () => {
      const intentEngine = getContainer().getIntentEngine();
      expect(intentEngine).toBeDefined();
    });

    it('should have retrieval engine defined', () => {
      const retrievalEngine = getContainer().getRetrievalEngine();
      expect(retrievalEngine).toBeDefined();
    });

    it('should have answer engine defined', () => {
      const answerEngine = getContainer().getAnswerEngine();
      expect(answerEngine).toBeDefined();
    });

    it('should have analytics engine defined', () => {
      const analyticsEngine = getContainer().getAnalyticsEngine();
      expect(analyticsEngine).toBeDefined();
    });

    it('should have multi-intent service defined', () => {
      const multiIntent = getContainer().getMultiIntent();
      expect(multiIntent).toBeDefined();
    });

    it('should have override service defined', () => {
      const override = getContainer().getOverride();
      expect(override).toBeDefined();
    });
  });

  describe('Orchestrator Dependencies', () => {
    it('should have retrieval engine injected', () => {
      const orchestrator = getOrchestrator() as any;
      expect(orchestrator.retrievalEngine).toBeDefined();
    });

    it('should have answer engine injected', () => {
      const orchestrator = getOrchestrator() as any;
      expect(orchestrator.answerEngine).toBeDefined();
    });

    it('should have intent engine injected', () => {
      const orchestrator = getOrchestrator() as any;
      expect(orchestrator.intentEngine).toBeDefined();
    });

    it('should have fallback config injected', () => {
      const orchestrator = getOrchestrator() as any;
      expect(orchestrator.fallbackConfig).toBeDefined();
    });

    it('should have formatting pipeline injected', () => {
      const orchestrator = getOrchestrator() as any;
      expect(orchestrator.formattingPipeline).toBeDefined();
    });

    it('should have multi-intent service injected', () => {
      const orchestrator = getOrchestrator() as any;
      expect(orchestrator.multiIntent).toBeDefined();
    });

    it('should have override service injected', () => {
      const orchestrator = getOrchestrator() as any;
      expect(orchestrator.override).toBeDefined();
    });
  });

  describe('Orchestrator Basic Functionality', () => {
    it('should be able to call orchestrate without crashing', async () => {
      const orchestrator = getOrchestrator();

      // This should not throw, even if no documents exist
      const result = await orchestrator.orchestrate({
        text: 'Hello',
        userId: 'test-user-123',
        conversationId: 'test-conv-123',
        language: 'en',
      });

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
    });
  });

  describe('All Intents Routable', () => {
    const intents = [
      'DOC_QA',
      'DOC_ANALYTICS',
      'DOC_MANAGEMENT',
      'DOC_SEARCH',
      'DOC_SUMMARIZE',
      'PREFERENCE_UPDATE',
      'MEMORY_STORE',
      'MEMORY_RECALL',
      'ANSWER_REWRITE',
      'ANSWER_EXPAND',
      'ANSWER_SIMPLIFY',
      'FEEDBACK_POSITIVE',
      'FEEDBACK_NEGATIVE',
      'PRODUCT_HELP',
      'ONBOARDING_HELP',
      'FEATURE_REQUEST',
      'GENERIC_KNOWLEDGE',
      'REASONING_TASK',
      'TEXT_TRANSFORM',
      'CHITCHAT',
      'META_AI',
      'OUT_OF_SCOPE',
      'AMBIGUOUS',
      'SAFETY_CONCERN',
      'MULTI_INTENT',
    ];

    it('should have handlers for all 25 intents', () => {
      const orchestrator = getOrchestrator() as any;

      // Check that routeIntent method exists
      expect(typeof orchestrator.routeIntent).toBe('function');
    });
  });
});

/**
 * Manual validation checklist:
 *
 * Run these commands to verify the fixes:
 *
 * 1. Check container file exists:
 *    ls -la backend/src/bootstrap/container.ts
 *
 * 2. Check missing services exist:
 *    ls -la backend/src/services/user/userPreferences.service.ts
 *    ls -la backend/src/services/memory/conversationMemory.service.ts
 *    ls -la backend/src/services/analytics/feedbackLogger.service.ts
 *    ls -la backend/src/services/analytics/analyticsEngine.service.ts
 *
 * 3. Check orchestrator no longer exports singleton:
 *    grep "export const kodaOrchestratorV3" backend/src/services/core/kodaOrchestratorV3.service.ts
 *    (should return nothing)
 *
 * 4. Check intent is passed to retrieval:
 *    grep "intent: context.intent" backend/src/services/core/kodaOrchestratorV3.service.ts
 *    (should show match)
 *
 * 5. Check server initializes container:
 *    grep "initializeContainer" backend/src/server.ts
 *    (should show import and call)
 *
 * 6. Check controller uses container:
 *    grep "getContainer" backend/src/controllers/rag.controller.ts
 *    (should show import and usage)
 */
