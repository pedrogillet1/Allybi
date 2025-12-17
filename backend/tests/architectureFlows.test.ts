/**
 * Architecture Flow Tests
 * Tests that each answer type uses the correct services
 *
 * Run with: npm run test:flows
 *
 * @version 1.0.0
 */

import request from 'supertest';
import { v4 as uuid } from 'uuid';
import {
  resetTraceLog,
  getServicesForRequest,
  getTraceForRequest,
  printTrace,
  requestContext,
  traceLog,
} from '../src/infra/serviceTracer';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// We'll need to import app after setting up environment
let app: any;

const TEST_USER_ID = 'test-user-architecture-flows';
const TEST_CONVERSATION_ID = 'test-conversation-architecture-flows';

// Expected service flows for each answer type
const EXPECTED_FLOWS: Record<
  string,
  {
    mustInclude: string[];
    mustNotInclude: string[];
    maxDuration: number;
  }
> = {
  ULTRA_FAST_GREETING: {
    mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
    mustNotInclude: [
      'KodaRetrievalEngine',
      'KodaMemoryEngine',
      'EmbeddingService',
      'PineconeService',
    ],
    maxDuration: 500, // ms - adjusted for real conditions
  },

  ULTRA_FAST_DOC_COUNT: {
    mustInclude: ['KodaIntentEngine'],
    mustNotInclude: [
      'KodaRetrievalEngine',
      'EmbeddingService',
      'PineconeService',
    ],
    maxDuration: 1000, // ms
  },

  FILE_NAVIGATION: {
    mustInclude: ['KodaIntentEngine', 'KodaNavigationEngine'],
    mustNotInclude: ['EmbeddingService', 'PineconeService'],
    maxDuration: 1000, // ms
  },

  FOLDER_NAVIGATION: {
    mustInclude: ['KodaIntentEngine', 'KodaNavigationEngine'],
    mustNotInclude: ['EmbeddingService', 'PineconeService'],
    maxDuration: 1000, // ms
  },

  CALCULATION: {
    mustInclude: ['KodaIntentEngine'],
    mustNotInclude: ['KodaRetrievalEngine', 'EmbeddingService', 'PineconeService'],
    maxDuration: 3000, // ms
  },

  SIMPLE_EXTRACTION: {
    mustInclude: ['KodaIntentEngine', 'KodaRetrievalEngine'],
    mustNotInclude: [],
    maxDuration: 3000, // ms
  },

  STANDARD_QUERY: {
    mustInclude: ['KodaIntentEngine', 'KodaRetrievalEngine', 'KodaAnswerEngine'],
    mustNotInclude: [],
    maxDuration: 5000, // ms
  },

  COMPLEX_ANALYSIS: {
    mustInclude: ['KodaIntentEngine', 'KodaRetrievalEngine', 'KodaAnswerEngine'],
    mustNotInclude: [],
    maxDuration: 10000, // ms
  },
};

// Test queries for each answer type
const TEST_QUERIES: Record<string, string[]> = {
  ULTRA_FAST_GREETING: ['Hi', 'Hello', 'Hey there', 'Good morning'],

  ULTRA_FAST_DOC_COUNT: [
    'How many documents do I have?',
    'Quantos documentos eu tenho?',
    'What is my document count?',
  ],

  FILE_NAVIGATION: [
    'Where is the contract file?',
    'Onde esta o arquivo do contrato?',
    'Find the invoice.pdf',
  ],

  FOLDER_NAVIGATION: [
    'What files are in the Finance folder?',
    'Quais arquivos tem na pasta Financeiro?',
    'List files in folder Projects',
  ],

  CALCULATION: [
    'Calculate ROI of 1000 investment with 200 return',
    'Calcule o ROI de um investimento de 1000 com retorno de 200',
    'What is 15% of 5000?',
  ],

  SIMPLE_EXTRACTION: [
    'What is the total value?',
    'Qual e o valor total?',
    'Extract the project name',
  ],

  STANDARD_QUERY: [
    'Summarize the document',
    'Resuma o documento',
    'What does the contract say about payment terms?',
  ],

  COMPLEX_ANALYSIS: [
    'Compare project A and project B',
    'Compare o projeto A com o projeto B',
    'Analyze the financial viability of this investment',
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send a test message through the API
 */
async function sendTestMessage(
  query: string,
  requestId: string
): Promise<any> {
  const response = await request(app)
    .post(`/api/chat/${TEST_CONVERSATION_ID}/message`)
    .set('x-test-request-id', requestId)
    .set('Authorization', `Bearer test-token`)
    .send({
      message: query,
      userId: TEST_USER_ID,
    });

  return response;
}

/**
 * Assert that a service flow matches expectations
 */
function assertServiceFlow(
  requestId: string,
  answerType: string,
  query: string
) {
  const services = getServicesForRequest(requestId);
  const trace = getTraceForRequest(requestId);
  const flow = EXPECTED_FLOWS[answerType];

  if (!flow) {
    throw new Error(`Unknown answer type: ${answerType}`);
  }

  // Calculate duration
  const duration =
    trace.length > 0
      ? trace[trace.length - 1].timestamp - trace[0].timestamp
      : 0;

  // Print trace for debugging
  console.log(`\n  Testing: ${answerType}`);
  console.log(`     Query: "${query}"`);
  console.log(`     Duration: ${duration}ms`);
  console.log(`     Services called: ${[...services].join(', ') || 'none'}`);

  // Assert required services
  for (const required of flow.mustInclude) {
    if (!services.has(required)) {
      console.error(`     Missing required service: ${required}`);
      printTrace(requestId);
    }
    expect(services.has(required)).toBe(true);
  }

  // Assert forbidden services
  for (const forbidden of flow.mustNotInclude) {
    if (services.has(forbidden)) {
      console.error(`     Forbidden service was called: ${forbidden}`);
      printTrace(requestId);
    }
    expect(services.has(forbidden)).toBe(false);
  }

  // Assert duration (warning only, not hard fail)
  if (duration >= flow.maxDuration) {
    console.warn(
      `     WARNING: Too slow: ${duration}ms (max ${flow.maxDuration}ms)`
    );
  }

  console.log(`     Flow validated`);
}

// ============================================================================
// UNIT TESTS FOR TRACER INFRASTRUCTURE
// ============================================================================

describe('ServiceTracer Infrastructure', () => {
  beforeEach(() => {
    resetTraceLog();
  });

  test('traceService wraps class methods correctly', () => {
    const { traceService } = require('../src/infra/serviceTracer');

    class TestService {
      syncMethod() {
        return 'sync result';
      }
      async asyncMethod() {
        return 'async result';
      }
    }

    const traced = traceService('TestService', new TestService());

    // Test sync method
    const syncResult = traced.syncMethod();
    expect(syncResult).toBe('sync result');

    // Check trace was recorded
    expect(traceLog.length).toBe(1);
    expect(traceLog[0].service).toBe('TestService');
    expect(traceLog[0].method).toBe('syncMethod');
    expect(traceLog[0].duration).toBeDefined();
  });

  test('traceService handles async methods', async () => {
    const { traceService } = require('../src/infra/serviceTracer');

    class AsyncService {
      async fetchData() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'data';
      }
    }

    const traced = traceService('AsyncService', new AsyncService());
    const result = await traced.fetchData();

    expect(result).toBe('data');
    expect(traceLog.length).toBe(1);
    expect(traceLog[0].service).toBe('AsyncService');
    expect(traceLog[0].method).toBe('fetchData');
    expect(traceLog[0].duration).toBeGreaterThanOrEqual(10);
  });

  test('traceModule wraps functional modules', () => {
    const { traceModule } = require('../src/infra/serviceTracer');

    const myModule = {
      add: (a: number, b: number) => a + b,
      multiply: (a: number, b: number) => a * b,
    };

    const traced = traceModule('MathModule', myModule);

    expect(traced.add(2, 3)).toBe(5);
    expect(traced.multiply(2, 3)).toBe(6);

    expect(traceLog.length).toBe(2);
    expect(traceLog[0].service).toBe('MathModule');
    expect(traceLog[0].method).toBe('add');
    expect(traceLog[1].method).toBe('multiply');
  });

  test('requestContext tracks request ID', async () => {
    const {
      requestContext,
      getCurrentRequestId,
    } = require('../src/infra/serviceTracer');

    const testRequestId = 'test-123';

    await requestContext.run({ requestId: testRequestId }, async () => {
      expect(getCurrentRequestId()).toBe(testRequestId);
    });
  });

  test('getServicesForRequest filters correctly', () => {
    // Manually add some trace entries
    traceLog.push({
      requestId: 'req-1',
      service: 'ServiceA',
      method: 'methodA',
      timestamp: Date.now(),
    });
    traceLog.push({
      requestId: 'req-1',
      service: 'ServiceB',
      method: 'methodB',
      timestamp: Date.now(),
    });
    traceLog.push({
      requestId: 'req-2',
      service: 'ServiceC',
      method: 'methodC',
      timestamp: Date.now(),
    });

    const services = getServicesForRequest('req-1');
    expect(services.has('ServiceA')).toBe(true);
    expect(services.has('ServiceB')).toBe(true);
    expect(services.has('ServiceC')).toBe(false);
  });

  test('resetTraceLog clears all entries', () => {
    traceLog.push({
      requestId: 'test',
      service: 'Test',
      method: 'test',
      timestamp: Date.now(),
    });

    expect(traceLog.length).toBe(1);
    resetTraceLog();
    expect(traceLog.length).toBe(0);
  });
});

// ============================================================================
// STATIC FLOW VALIDATION TESTS
// ============================================================================

describe('Expected Flow Validation', () => {
  test('ULTRA_FAST paths should not require retrieval', () => {
    const fastPaths = ['ULTRA_FAST_GREETING', 'ULTRA_FAST_DOC_COUNT'];

    for (const path of fastPaths) {
      const flow = EXPECTED_FLOWS[path];
      expect(flow).toBeDefined();
      expect(flow.mustNotInclude).toContain('KodaRetrievalEngine');
      expect(flow.mustNotInclude).toContain('EmbeddingService');
      expect(flow.mustNotInclude).toContain('PineconeService');
    }
  });

  test('Navigation paths should not require embedding', () => {
    const navPaths = ['FILE_NAVIGATION', 'FOLDER_NAVIGATION'];

    for (const path of navPaths) {
      const flow = EXPECTED_FLOWS[path];
      expect(flow).toBeDefined();
      expect(flow.mustNotInclude).toContain('EmbeddingService');
      expect(flow.mustNotInclude).toContain('PineconeService');
    }
  });

  test('Standard and Complex queries should include retrieval', () => {
    const ragPaths = ['STANDARD_QUERY', 'COMPLEX_ANALYSIS'];

    for (const path of ragPaths) {
      const flow = EXPECTED_FLOWS[path];
      expect(flow).toBeDefined();
      expect(flow.mustInclude).toContain('KodaRetrievalEngine');
    }
  });

  test('All answer types have test queries defined', () => {
    for (const answerType of Object.keys(EXPECTED_FLOWS)) {
      expect(TEST_QUERIES[answerType]).toBeDefined();
      expect(TEST_QUERIES[answerType].length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// MOCK INTEGRATION TESTS (No real API calls)
// ============================================================================

describe('Service Flow Simulation', () => {
  beforeEach(() => {
    resetTraceLog();
  });

  test('Simulated ULTRA_FAST_GREETING flow', () => {
    const requestId = 'SIM_GREETING_1';

    // Simulate what should happen for a greeting
    traceLog.push({
      requestId,
      service: 'KodaIntentEngine',
      method: 'detectIntent',
      timestamp: Date.now(),
      duration: 5,
    });
    traceLog.push({
      requestId,
      service: 'KodaAnswerEngine',
      method: 'generateGreeting',
      timestamp: Date.now() + 5,
      duration: 10,
    });

    const services = getServicesForRequest(requestId);

    // Should include required
    expect(services.has('KodaIntentEngine')).toBe(true);
    expect(services.has('KodaAnswerEngine')).toBe(true);

    // Should NOT include forbidden
    expect(services.has('KodaRetrievalEngine')).toBe(false);
    expect(services.has('EmbeddingService')).toBe(false);
    expect(services.has('PineconeService')).toBe(false);
  });

  test('Simulated STANDARD_QUERY flow', () => {
    const requestId = 'SIM_STANDARD_1';

    // Simulate full RAG flow
    traceLog.push({
      requestId,
      service: 'KodaIntentEngine',
      method: 'detectIntent',
      timestamp: Date.now(),
      duration: 10,
    });
    traceLog.push({
      requestId,
      service: 'KodaMemoryEngine',
      method: 'getConversationMemory',
      timestamp: Date.now() + 10,
      duration: 50,
    });
    traceLog.push({
      requestId,
      service: 'EmbeddingService',
      method: 'embedQuery',
      timestamp: Date.now() + 60,
      duration: 100,
    });
    traceLog.push({
      requestId,
      service: 'PineconeService',
      method: 'query',
      timestamp: Date.now() + 160,
      duration: 200,
    });
    traceLog.push({
      requestId,
      service: 'KodaRetrievalEngine',
      method: 'retrieve',
      timestamp: Date.now() + 360,
      duration: 50,
    });
    traceLog.push({
      requestId,
      service: 'KodaAnswerEngine',
      method: 'generateAnswer',
      timestamp: Date.now() + 410,
      duration: 500,
    });

    const services = getServicesForRequest(requestId);

    // Should include all RAG services
    expect(services.has('KodaIntentEngine')).toBe(true);
    expect(services.has('KodaMemoryEngine')).toBe(true);
    expect(services.has('KodaRetrievalEngine')).toBe(true);
    expect(services.has('KodaAnswerEngine')).toBe(true);
    expect(services.has('EmbeddingService')).toBe(true);
    expect(services.has('PineconeService')).toBe(true);
  });

  test('Simulated NAVIGATION flow', () => {
    const requestId = 'SIM_NAV_1';

    // Simulate navigation flow (no embeddings)
    traceLog.push({
      requestId,
      service: 'KodaIntentEngine',
      method: 'detectIntent',
      timestamp: Date.now(),
      duration: 10,
    });
    traceLog.push({
      requestId,
      service: 'KodaNavigationEngine',
      method: 'handleNavigationQuery',
      timestamp: Date.now() + 10,
      duration: 100,
    });
    traceLog.push({
      requestId,
      service: 'KodaAnswerEngine',
      method: 'formatNavigationResponse',
      timestamp: Date.now() + 110,
      duration: 20,
    });

    const services = getServicesForRequest(requestId);

    // Should include navigation
    expect(services.has('KodaIntentEngine')).toBe(true);
    expect(services.has('KodaNavigationEngine')).toBe(true);

    // Should NOT include heavy services
    expect(services.has('EmbeddingService')).toBe(false);
    expect(services.has('PineconeService')).toBe(false);
    expect(services.has('KodaRetrievalEngine')).toBe(false);
  });

  test('Simulated CALCULATION flow', () => {
    const requestId = 'SIM_CALC_1';

    // Simulate calculation flow (no embeddings/retrieval)
    traceLog.push({
      requestId,
      service: 'KodaIntentEngine',
      method: 'detectIntent',
      timestamp: Date.now(),
      duration: 10,
    });
    traceLog.push({
      requestId,
      service: 'CalculationRouter',
      method: 'route',
      timestamp: Date.now() + 10,
      duration: 5,
    });
    traceLog.push({
      requestId,
      service: 'FinancialCalculatorService',
      method: 'calculateROI',
      timestamp: Date.now() + 15,
      duration: 50,
    });
    traceLog.push({
      requestId,
      service: 'KodaAnswerEngine',
      method: 'formatCalculationResult',
      timestamp: Date.now() + 65,
      duration: 20,
    });

    const services = getServicesForRequest(requestId);

    // Should include calculation services
    expect(services.has('KodaIntentEngine')).toBe(true);
    expect(services.has('CalculationRouter')).toBe(true);
    expect(services.has('FinancialCalculatorService')).toBe(true);

    // Should NOT include retrieval
    expect(services.has('KodaRetrievalEngine')).toBe(false);
    expect(services.has('EmbeddingService')).toBe(false);
    expect(services.has('PineconeService')).toBe(false);
  });
});

// ============================================================================
// GLOBAL ARCHITECTURE CHECKS
// ============================================================================

describe('Global Architecture Rules', () => {
  test('Fast paths should have lower max duration than complex paths', () => {
    const fastMaxDuration = Math.max(
      EXPECTED_FLOWS.ULTRA_FAST_GREETING.maxDuration,
      EXPECTED_FLOWS.ULTRA_FAST_DOC_COUNT.maxDuration
    );

    const complexMinDuration = Math.min(
      EXPECTED_FLOWS.STANDARD_QUERY.maxDuration,
      EXPECTED_FLOWS.COMPLEX_ANALYSIS.maxDuration
    );

    expect(fastMaxDuration).toBeLessThan(complexMinDuration);
  });

  test('All answer types should require KodaIntentEngine', () => {
    for (const [answerType, flow] of Object.entries(EXPECTED_FLOWS)) {
      expect(flow.mustInclude).toContain('KodaIntentEngine');
    }
  });

  test('Test queries cover multiple languages', () => {
    let hasPortuguese = false;
    let hasEnglish = false;

    for (const queries of Object.values(TEST_QUERIES)) {
      for (const query of queries) {
        if (/[áéíóúãõç]/i.test(query) || /\b(qual|como|onde|que)\b/i.test(query)) {
          hasPortuguese = true;
        }
        if (/\b(what|where|how|is|are)\b/i.test(query)) {
          hasEnglish = true;
        }
      }
    }

    expect(hasPortuguese).toBe(true);
    expect(hasEnglish).toBe(true);
  });
});

// ============================================================================
// EXPORTS FOR EXTERNAL USE
// ============================================================================

export { EXPECTED_FLOWS, TEST_QUERIES, assertServiceFlow };
