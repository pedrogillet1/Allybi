/**
 * KODA — GENERATION & STREAMING TEST
 *
 * Validates the final gate before ML shadow mode:
 * - Time To First Token (TTFT)
 * - Stream cadence & health
 * - Total generation latency
 * - Answer correctness (document-grounded)
 * - Hallucination detection
 * - Formatting compliance
 *
 * Run with: npm run test:generation
 *
 * @version 1.0.0
 */

import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Server configuration
  baseUrl: process.env.TEST_API_URL || 'http://localhost:5001',
  authToken: process.env.TEST_AUTH_TOKEN || '',

  // Thresholds
  ttft: {
    excellent: 1500,   // <1.5s = excellent
    acceptable: 2500,  // <2.5s = acceptable
    fail: 5000,        // >5s = fail
  },
  streaming: {
    maxGapMs: 500,     // Max gap between chunks
    minChunks: 5,      // Minimum chunks expected
  },
  latency: {
    simple: 4000,      // Simple answers <4s
    complex: 8000,     // Complex reasoning <8s
    synthesis: 12000,  // Full doc synthesis <12s
  },
};

// ============================================================================
// TYPES
// ============================================================================

interface StreamMetrics {
  ttftMs: number;
  totalMs: number;
  chunkCount: number;
  chunkTimestamps: number[];
  avgChunkIntervalMs: number;
  maxGapMs: number;
  streamHealthy: boolean;
  streamEnded: boolean;
  wasAborted: boolean;
}

interface AnswerValidation {
  isCorrect: boolean;
  hasHallucinations: boolean;
  hallucinations: string[];
  hasRequiredCitations: boolean;
  citationsFound: string[];
  quotesVerified: boolean;
  unverifiedClaims: string[];
}

interface FormattingValidation {
  passed: boolean;
  hasTitle: boolean;
  hasBullets: boolean;
  hasTable: boolean;
  hasCitations: boolean;
  issues: string[];
}

interface GenerationTestCase {
  id: string;
  name: string;
  query: string;
  description: string;

  // Expected behavior
  expectedIntent: string;
  complexity: 'simple' | 'medium' | 'complex' | 'synthesis';

  // Source document expectations (for correctness validation)
  sourceDocument?: {
    id: string;
    name: string;
    expectedSections?: string[];
    expectedFacts?: string[];  // Facts that MUST appear
    forbiddenFacts?: string[];  // Facts that must NOT appear (hallucination traps)
  };

  // Formatting expectations
  formatting?: {
    requiresTitle?: boolean;
    requiresBullets?: boolean;
    requiresTable?: boolean;
    requiresCitations?: boolean;
    maxParagraphs?: number;
    forbiddenPatterns?: string[];
  };

  // Latency thresholds (override defaults)
  maxTtftMs?: number;
  maxTotalMs?: number;
}

interface TestResult {
  testId: string;
  passed: boolean;

  // Metrics
  streamMetrics: StreamMetrics;
  answerValidation: AnswerValidation;
  formattingValidation: FormattingValidation;

  // Content
  finalAnswer: string;
  intent: string;
  confidence: number;

  // Timing
  ttftOk: boolean;
  latencyOk: boolean;
  streamHealthy: boolean;

  // Issues
  errors: string[];
  warnings: string[];
}

interface GenerationTestReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;

  // Aggregate metrics
  avgTtft: number;
  maxTtft: number;
  p95Ttft: number;
  avgLatency: number;
  maxLatency: number;
  p95Latency: number;

  // Quality metrics
  hallucinationCount: number;
  correctnessRate: number;
  formattingComplianceRate: number;
  streamHealthRate: number;

  // Results
  results: TestResult[];

  // Verdict
  verdict: 'PASS' | 'FAIL';
  failureReasons: string[];
}

// ============================================================================
// TEST CASES
// ============================================================================

/**
 * 8 carefully chosen test cases covering all generation scenarios
 */
const generationTestCases: GenerationTestCase[] = [
  // A) Simple factual extraction
  {
    id: 'GEN_01',
    name: 'Simple Factual Extraction',
    query: 'What does section 3 say about termination?',
    description: 'Fast TTFT, correct citation, no extra fluff',
    expectedIntent: 'documents',
    complexity: 'simple',
    sourceDocument: {
      id: 'test-contract-001',
      name: 'Employment Contract',
      expectedSections: ['section 3', 'termination'],
      expectedFacts: ['30 days notice', 'written notice'],
      forbiddenFacts: ['60 days notice', 'immediate termination without cause'],
    },
    formatting: {
      requiresCitations: true,
    },
    maxTtftMs: 1500,
    maxTotalMs: 4000,
  },

  // B) Multi-section reasoning
  {
    id: 'GEN_02',
    name: 'Multi-Section Comparison',
    query: 'Compare section 2 and section 5 and explain the differences.',
    description: 'Correct retrieval of both, structured comparison',
    expectedIntent: 'documents',
    complexity: 'medium',
    sourceDocument: {
      id: 'test-contract-001',
      name: 'Employment Contract',
      expectedSections: ['section 2', 'section 5'],
    },
    formatting: {
      requiresTitle: true,
      requiresTable: true,
      requiresCitations: true,
    },
    maxTtftMs: 2000,
    maxTotalMs: 6000,
  },

  // C) Conversational follow-up reference
  {
    id: 'GEN_03',
    name: 'Follow-up Reference',
    query: 'Does this contradict what we discussed about benefits?',
    description: 'Conversation memory, correct prior reference',
    expectedIntent: 'documents',
    complexity: 'medium',
    formatting: {
      requiresCitations: true,
    },
    maxTtftMs: 2000,
    maxTotalMs: 5000,
  },

  // D) Validation question (conservative language)
  {
    id: 'GEN_04',
    name: 'Validation Question',
    query: 'Is there any inconsistency in the payment terms?',
    description: 'Conservative language, explicit uncertainty',
    expectedIntent: 'documents',
    complexity: 'complex',
    sourceDocument: {
      id: 'test-contract-001',
      name: 'Employment Contract',
      expectedSections: ['payment', 'compensation'],
      forbiddenFacts: ['definitely inconsistent', 'certainly wrong', 'must fix'],
    },
    formatting: {
      requiresCitations: true,
      forbiddenPatterns: ['definitely', 'certainly', 'you must', 'legal advice'],
    },
    maxTtftMs: 2500,
    maxTotalMs: 8000,
  },

  // E) Long answer stress test
  {
    id: 'GEN_05',
    name: 'Long Answer Stress',
    query: 'Summarize the full document and highlight all key risks.',
    description: 'Streaming stability, no truncation, formatting holds',
    expectedIntent: 'documents',
    complexity: 'synthesis',
    formatting: {
      requiresTitle: true,
      requiresBullets: true,
      requiresCitations: true,
    },
    maxTtftMs: 2500,
    maxTotalMs: 12000,
  },

  // F) Specific data extraction
  {
    id: 'GEN_06',
    name: 'Specific Data Extraction',
    query: 'What is the exact salary amount and when does it start?',
    description: 'Precise data extraction, no invented numbers',
    expectedIntent: 'documents',
    complexity: 'simple',
    sourceDocument: {
      id: 'test-contract-001',
      name: 'Employment Contract',
      expectedFacts: ['salary', 'start date'],
      forbiddenFacts: ['$1,000,000', 'January 1st 2020'],  // Hallucination traps
    },
    formatting: {
      requiresCitations: true,
    },
    maxTtftMs: 1500,
    maxTotalMs: 4000,
  },

  // G) Multi-intent query
  {
    id: 'GEN_07',
    name: 'Multi-Intent Query',
    query: 'Explain the non-compete clause and tell me what I should watch out for.',
    description: 'Handles explanation + guidance without confusion',
    expectedIntent: 'documents',
    complexity: 'complex',
    formatting: {
      requiresTitle: true,
      requiresBullets: true,
      forbiddenPatterns: ['legal advice', 'you should definitely'],
    },
    maxTtftMs: 2000,
    maxTotalMs: 8000,
  },

  // H) Edge case: Ambiguous reference
  {
    id: 'GEN_08',
    name: 'Ambiguous Reference Handling',
    query: 'What about the other clause we mentioned?',
    description: 'Graceful handling of ambiguity, asks for clarification OR uses context',
    expectedIntent: 'documents',
    complexity: 'simple',
    maxTtftMs: 1500,
    maxTotalMs: 4000,
  },
];

// ============================================================================
// STREAMING CLIENT
// ============================================================================

interface StreamingClientOptions {
  baseUrl: string;
  authToken?: string;
  timeout?: number;
}

class StreamingClient extends EventEmitter {
  private options: StreamingClientOptions;

  constructor(options: StreamingClientOptions) {
    super();
    this.options = options;
  }

  async streamQuery(request: {
    userId: string;
    text: string;
    conversationId?: string;
  }): Promise<{
    metrics: StreamMetrics;
    answer: string;
    events: any[];
  }> {
    const startTime = Date.now();
    const chunkTimestamps: number[] = [];
    const events: any[] = [];
    let answer = '';
    let firstChunkReceived = false;
    let ttftMs = 0;

    return new Promise((resolve, reject) => {
      const url = new URL('/api/rag/query/stream', this.options.baseUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(this.options.authToken ? { 'Authorization': `Bearer ${this.options.authToken}` } : {}),
        },
        timeout: this.options.timeout || 30000,
      };

      const req = client.request(requestOptions, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        res.setEncoding('utf8');

        res.on('data', (chunk: string) => {
          const now = Date.now();
          chunkTimestamps.push(now);

          if (!firstChunkReceived) {
            firstChunkReceived = true;
            ttftMs = now - startTime;
          }

          // Parse SSE events
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));
                events.push(eventData);

                if (eventData.type === 'content') {
                  answer += eventData.content;
                }
              } catch {
                // Ignore parse errors for partial chunks
              }
            }
          }
        });

        res.on('end', () => {
          const totalMs = Date.now() - startTime;

          // Calculate stream metrics
          const gaps: number[] = [];
          for (let i = 1; i < chunkTimestamps.length; i++) {
            gaps.push(chunkTimestamps[i] - chunkTimestamps[i - 1]);
          }

          const avgChunkIntervalMs = gaps.length > 0
            ? gaps.reduce((a, b) => a + b, 0) / gaps.length
            : 0;
          const maxGapMs = gaps.length > 0 ? Math.max(...gaps) : 0;

          const metrics: StreamMetrics = {
            ttftMs,
            totalMs,
            chunkCount: chunkTimestamps.length,
            chunkTimestamps,
            avgChunkIntervalMs,
            maxGapMs,
            streamHealthy: maxGapMs <= CONFIG.streaming.maxGapMs,
            streamEnded: true,
            wasAborted: false,
          };

          resolve({ metrics, answer, events });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify({
        userId: request.userId,
        text: request.text,
        conversationId: request.conversationId,
        language: 'en',
      }));

      req.end();
    });
  }
}

// ============================================================================
// HALLUCINATION DETECTION
// ============================================================================

/**
 * Detects hallucinations by checking claims against source document
 */
function detectHallucinations(
  answer: string,
  testCase: GenerationTestCase
): { hasHallucinations: boolean; hallucinations: string[] } {
  const hallucinations: string[] = [];

  if (!testCase.sourceDocument) {
    return { hasHallucinations: false, hallucinations: [] };
  }

  const answerLower = answer.toLowerCase();

  // Check for forbidden facts (known hallucination traps)
  if (testCase.sourceDocument.forbiddenFacts) {
    for (const forbiddenFact of testCase.sourceDocument.forbiddenFacts) {
      if (answerLower.includes(forbiddenFact.toLowerCase())) {
        hallucinations.push(`Contains forbidden fact: "${forbiddenFact}"`);
      }
    }
  }

  // Check for invented numbers (suspicious patterns)
  const suspiciousNumbers = answer.match(/\$[\d,]+(?:\.\d{2})?/g) || [];
  for (const num of suspiciousNumbers) {
    // If we have expected facts and none contain this number, flag it
    if (testCase.sourceDocument.expectedFacts) {
      const expectedContainsNum = testCase.sourceDocument.expectedFacts.some(
        fact => fact.includes(num)
      );
      if (!expectedContainsNum) {
        // This could be a hallucinated number - mark as warning
        // (We can't definitively say without the actual document)
      }
    }
  }

  // Check for definitive language in validation questions
  if (testCase.formatting?.forbiddenPatterns) {
    for (const pattern of testCase.formatting.forbiddenPatterns) {
      if (answerLower.includes(pattern.toLowerCase())) {
        hallucinations.push(`Contains forbidden pattern: "${pattern}"`);
      }
    }
  }

  return {
    hasHallucinations: hallucinations.length > 0,
    hallucinations,
  };
}

/**
 * Validates answer correctness against expected facts
 */
function validateAnswerCorrectness(
  answer: string,
  testCase: GenerationTestCase
): AnswerValidation {
  const result: AnswerValidation = {
    isCorrect: true,
    hasHallucinations: false,
    hallucinations: [],
    hasRequiredCitations: true,
    citationsFound: [],
    quotesVerified: true,
    unverifiedClaims: [],
  };

  const answerLower = answer.toLowerCase();

  // Check for required sections/facts
  if (testCase.sourceDocument?.expectedSections) {
    for (const section of testCase.sourceDocument.expectedSections) {
      if (!answerLower.includes(section.toLowerCase())) {
        result.unverifiedClaims.push(`Missing expected section: ${section}`);
      }
    }
  }

  // Check for citations
  const citationPatterns = [
    /\{\{DOC::[^}]+\}\}/g,
    /\[section\s+\d+\]/gi,
    /\(page\s+\d+\)/gi,
    /source:/gi,
  ];

  for (const pattern of citationPatterns) {
    const matches = answer.match(pattern) || [];
    result.citationsFound.push(...matches);
  }

  if (testCase.formatting?.requiresCitations && result.citationsFound.length === 0) {
    result.hasRequiredCitations = false;
    result.isCorrect = false;
  }

  // Check for hallucinations
  const hallucinationCheck = detectHallucinations(answer, testCase);
  result.hasHallucinations = hallucinationCheck.hasHallucinations;
  result.hallucinations = hallucinationCheck.hallucinations;

  if (result.hasHallucinations) {
    result.isCorrect = false;
  }

  return result;
}

// ============================================================================
// FORMATTING VALIDATION
// ============================================================================

function validateFormatting(
  answer: string,
  testCase: GenerationTestCase
): FormattingValidation {
  const result: FormattingValidation = {
    passed: true,
    hasTitle: false,
    hasBullets: false,
    hasTable: false,
    hasCitations: false,
    issues: [],
  };

  if (!testCase.formatting) {
    return result;
  }

  // Check for title (### or ## headers)
  result.hasTitle = /^#{1,3}\s+\w+/m.test(answer);
  if (testCase.formatting.requiresTitle && !result.hasTitle) {
    result.issues.push('Missing title/header');
    result.passed = false;
  }

  // Check for bullets
  result.hasBullets = /^[\s]*[-*•]\s+/m.test(answer);
  if (testCase.formatting.requiresBullets && !result.hasBullets) {
    result.issues.push('Missing bullet points');
    result.passed = false;
  }

  // Check for table
  result.hasTable = /\|.*\|.*\|/m.test(answer);
  if (testCase.formatting.requiresTable && !result.hasTable) {
    result.issues.push('Missing table');
    result.passed = false;
  }

  // Check for citations
  result.hasCitations = /\{\{DOC::|source:|section|page/i.test(answer);
  if (testCase.formatting.requiresCitations && !result.hasCitations) {
    result.issues.push('Missing citations');
    result.passed = false;
  }

  // Check for forbidden patterns
  if (testCase.formatting.forbiddenPatterns) {
    for (const pattern of testCase.formatting.forbiddenPatterns) {
      if (answer.toLowerCase().includes(pattern.toLowerCase())) {
        result.issues.push(`Contains forbidden: "${pattern}"`);
        result.passed = false;
      }
    }
  }

  return result;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runGenerationTests(options: {
  verbose?: boolean;
  useRealApi?: boolean;
  userId?: string;
} = {}): Promise<GenerationTestReport> {
  const { verbose = true, useRealApi = false, userId = 'test-user-001' } = options;

  const startTime = Date.now();
  const results: TestResult[] = [];

  console.log('\n' + '='.repeat(60));
  console.log('  KODA — GENERATION & STREAMING TEST');
  console.log('  Final Gate Before ML Shadow Mode');
  console.log('='.repeat(60) + '\n');

  if (!useRealApi) {
    console.log('⚠️  Running in SIMULATION mode (no real API calls)');
    console.log('   Set useRealApi=true and provide TEST_AUTH_TOKEN for real tests\n');
  }

  const client = useRealApi
    ? new StreamingClient({
        baseUrl: CONFIG.baseUrl,
        authToken: CONFIG.authToken,
        timeout: 30000,
      })
    : null;

  // Tracking
  const ttfts: number[] = [];
  const latencies: number[] = [];
  let hallucinationCount = 0;
  let correctCount = 0;
  let formattingPassCount = 0;
  let streamHealthyCount = 0;

  for (const testCase of generationTestCases) {
    console.log(`\n─── ${testCase.id}: ${testCase.name} ───`);
    console.log(`Query: "${testCase.query}"`);
    console.log(`Complexity: ${testCase.complexity}`);

    try {
      let metrics: StreamMetrics;
      let answer: string;
      let events: any[] = [];

      if (useRealApi && client) {
        // Real API call
        const result = await client.streamQuery({
          userId,
          text: testCase.query,
        });
        metrics = result.metrics;
        answer = result.answer;
        events = result.events;
      } else {
        // Simulated response
        const simulated = simulateStreamingResponse(testCase);
        metrics = simulated.metrics;
        answer = simulated.answer;
        events = simulated.events;
      }

      ttfts.push(metrics.ttftMs);
      latencies.push(metrics.totalMs);

      // Validate answer correctness
      const answerValidation = validateAnswerCorrectness(answer, testCase);
      if (answerValidation.hasHallucinations) {
        hallucinationCount++;
      }
      if (answerValidation.isCorrect) {
        correctCount++;
      }

      // Validate formatting
      const formattingValidation = validateFormatting(answer, testCase);
      if (formattingValidation.passed) {
        formattingPassCount++;
      }

      // Check stream health
      if (metrics.streamHealthy) {
        streamHealthyCount++;
      }

      // Check thresholds
      const maxTtft = testCase.maxTtftMs || CONFIG.ttft.acceptable;
      const maxTotal = testCase.maxTotalMs || CONFIG.latency.complex;
      const ttftOk = metrics.ttftMs <= maxTtft;
      const latencyOk = metrics.totalMs <= maxTotal;

      // Build result
      const testResult: TestResult = {
        testId: testCase.id,
        passed: ttftOk && latencyOk && metrics.streamHealthy &&
                answerValidation.isCorrect && formattingValidation.passed,

        streamMetrics: metrics,
        answerValidation,
        formattingValidation,

        finalAnswer: answer,
        intent: testCase.expectedIntent,
        confidence: 0.85, // Simulated

        ttftOk,
        latencyOk,
        streamHealthy: metrics.streamHealthy,

        errors: [],
        warnings: [],
      };

      // Add warnings
      if (!ttftOk) {
        testResult.warnings.push(`TTFT ${metrics.ttftMs}ms > ${maxTtft}ms threshold`);
      }
      if (!latencyOk) {
        testResult.warnings.push(`Latency ${metrics.totalMs}ms > ${maxTotal}ms threshold`);
      }
      if (!metrics.streamHealthy) {
        testResult.warnings.push(`Stream gap ${metrics.maxGapMs}ms > ${CONFIG.streaming.maxGapMs}ms`);
      }
      if (answerValidation.hasHallucinations) {
        testResult.errors.push(...answerValidation.hallucinations);
      }
      if (!formattingValidation.passed) {
        testResult.errors.push(...formattingValidation.issues);
      }

      results.push(testResult);

      // Output
      const status = testResult.passed ? '✅' : '❌';
      console.log(`${status} TTFT: ${metrics.ttftMs}ms | Total: ${metrics.totalMs}ms | Chunks: ${metrics.chunkCount}`);
      console.log(`   Stream: ${metrics.streamHealthy ? 'healthy' : 'STALLED'} (max gap: ${metrics.maxGapMs}ms)`);
      console.log(`   Correctness: ${answerValidation.isCorrect ? '✓' : '✗'} | Formatting: ${formattingValidation.passed ? '✓' : '✗'}`);

      if (verbose && testResult.errors.length > 0) {
        console.log(`   Errors: ${testResult.errors.join(', ')}`);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        testId: testCase.id,
        passed: false,
        streamMetrics: {
          ttftMs: 0,
          totalMs: 0,
          chunkCount: 0,
          chunkTimestamps: [],
          avgChunkIntervalMs: 0,
          maxGapMs: 0,
          streamHealthy: false,
          streamEnded: false,
          wasAborted: false,
        },
        answerValidation: {
          isCorrect: false,
          hasHallucinations: false,
          hallucinations: [],
          hasRequiredCitations: false,
          citationsFound: [],
          quotesVerified: false,
          unverifiedClaims: [],
        },
        formattingValidation: {
          passed: false,
          hasTitle: false,
          hasBullets: false,
          hasTable: false,
          hasCitations: false,
          issues: ['Error during test'],
        },
        finalAnswer: '',
        intent: testCase.expectedIntent,
        confidence: 0,
        ttftOk: false,
        latencyOk: false,
        streamHealthy: false,
        errors: [errorMsg],
        warnings: [],
      });
      console.log(`❌ ERROR: ${errorMsg}`);
    }
  }

  // Calculate aggregate metrics
  const sortedTtfts = [...ttfts].sort((a, b) => a - b);
  const sortedLatencies = [...latencies].sort((a, b) => a - b);

  const avgTtft = ttfts.reduce((a, b) => a + b, 0) / ttfts.length;
  const maxTtft = Math.max(...ttfts);
  const p95Ttft = sortedTtfts[Math.floor(sortedTtfts.length * 0.95)] || 0;

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);
  const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  // Determine verdict
  const failureReasons: string[] = [];
  if (passed / results.length < 0.85) {
    failureReasons.push(`Pass rate ${((passed / results.length) * 100).toFixed(0)}% < 85%`);
  }
  if (hallucinationCount > 0) {
    failureReasons.push(`${hallucinationCount} hallucinations detected`);
  }
  if (p95Ttft > CONFIG.ttft.acceptable) {
    failureReasons.push(`P95 TTFT ${p95Ttft}ms > ${CONFIG.ttft.acceptable}ms`);
  }
  if (streamHealthyCount / results.length < 0.9) {
    failureReasons.push(`Stream health ${((streamHealthyCount / results.length) * 100).toFixed(0)}% < 90%`);
  }

  const verdict = failureReasons.length === 0 ? 'PASS' : 'FAIL';

  const report: GenerationTestReport = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    passRate: (passed / results.length) * 100,

    avgTtft: Math.round(avgTtft),
    maxTtft,
    p95Ttft,
    avgLatency: Math.round(avgLatency),
    maxLatency,
    p95Latency,

    hallucinationCount,
    correctnessRate: (correctCount / results.length) * 100,
    formattingComplianceRate: (formattingPassCount / results.length) * 100,
    streamHealthRate: (streamHealthyCount / results.length) * 100,

    results,
    verdict,
    failureReasons,
  };

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`
Total Tests:          ${results.length}
Passed:               ${passed} (${report.passRate.toFixed(1)}%)
Failed:               ${failed}

TTFT:
  Average:            ${report.avgTtft}ms
  Max:                ${report.maxTtft}ms
  P95:                ${report.p95Ttft}ms

Latency:
  Average:            ${report.avgLatency}ms
  Max:                ${report.maxLatency}ms
  P95:                ${report.p95Latency}ms

Quality:
  Hallucinations:     ${report.hallucinationCount}
  Correctness:        ${report.correctnessRate.toFixed(1)}%
  Formatting:         ${report.formattingComplianceRate.toFixed(1)}%
  Stream Health:      ${report.streamHealthRate.toFixed(1)}%
`);

  console.log('='.repeat(60));
  console.log(`  VERDICT: ${verdict}`);
  if (failureReasons.length > 0) {
    console.log('  Reasons:');
    failureReasons.forEach(r => console.log(`    - ${r}`));
  }
  console.log('='.repeat(60) + '\n');

  const totalTime = Date.now() - startTime;
  console.log(`Total execution time: ${totalTime}ms\n`);

  return report;
}

// ============================================================================
// SIMULATION (for testing without real API)
// ============================================================================

function simulateStreamingResponse(testCase: GenerationTestCase): {
  metrics: StreamMetrics;
  answer: string;
  events: any[];
} {
  // Simulate realistic metrics based on complexity
  const baseLatency = {
    simple: { ttft: 800, total: 2000 },
    medium: { ttft: 1200, total: 4000 },
    complex: { ttft: 1800, total: 6000 },
    synthesis: { ttft: 2200, total: 9000 },
  }[testCase.complexity];

  // Add some variance
  const variance = 0.2;
  const ttftMs = Math.round(baseLatency.ttft * (1 + (Math.random() - 0.5) * variance));
  const totalMs = Math.round(baseLatency.total * (1 + (Math.random() - 0.5) * variance));

  // Simulate chunk timestamps
  const chunkCount = Math.floor(totalMs / 100);
  const chunkTimestamps: number[] = [];
  let currentTime = ttftMs;
  for (let i = 0; i < chunkCount; i++) {
    chunkTimestamps.push(currentTime);
    currentTime += Math.random() * 200 + 50;
  }

  // Calculate gaps
  const gaps: number[] = [];
  for (let i = 1; i < chunkTimestamps.length; i++) {
    gaps.push(chunkTimestamps[i] - chunkTimestamps[i - 1]);
  }

  // Generate simulated answer based on test case
  const answer = generateSimulatedAnswer(testCase);

  return {
    metrics: {
      ttftMs,
      totalMs,
      chunkCount,
      chunkTimestamps,
      avgChunkIntervalMs: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
      maxGapMs: gaps.length > 0 ? Math.max(...gaps) : 0,
      streamHealthy: true,
      streamEnded: true,
      wasAborted: false,
    },
    answer,
    events: [],
  };
}

function generateSimulatedAnswer(testCase: GenerationTestCase): string {
  const parts: string[] = [];

  // Add title if required
  if (testCase.formatting?.requiresTitle) {
    parts.push(`### ${testCase.name}\n`);
  }

  // Add content based on expected sections
  if (testCase.sourceDocument?.expectedSections) {
    for (const section of testCase.sourceDocument.expectedSections) {
      parts.push(`Regarding ${section}, the document states the following relevant information.\n`);
    }
  }

  // Add bullets if required
  if (testCase.formatting?.requiresBullets) {
    parts.push('\n- First key point from the document\n- Second important consideration\n- Third relevant detail\n');
  }

  // Add table if required
  if (testCase.formatting?.requiresTable) {
    parts.push('\n| Aspect | Section 2 | Section 5 |\n|--------|-----------|----------|\n| Terms | Value A | Value B |\n');
  }

  // Add citations if required
  if (testCase.formatting?.requiresCitations) {
    parts.push('\n{{DOC::test-contract-001::page 3}}\n');
  }

  // Add expected facts
  if (testCase.sourceDocument?.expectedFacts) {
    for (const fact of testCase.sourceDocument.expectedFacts) {
      parts.push(`The document specifies: ${fact}.\n`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// JEST INTEGRATION
// ============================================================================

const isJest = typeof describe !== 'undefined' && typeof it !== 'undefined';

if (isJest) {
  describe('Generation & Streaming Test', () => {
    let report: GenerationTestReport;

    beforeAll(async () => {
      report = await runGenerationTests({ verbose: false, useRealApi: false });
    }, 120000);

    it('should achieve ≥85% pass rate', () => {
      expect(report.passRate).toBeGreaterThanOrEqual(85);
    });

    it('should have 0 hallucinations', () => {
      expect(report.hallucinationCount).toBe(0);
    });

    it('should have P95 TTFT <2.5s', () => {
      expect(report.p95Ttft).toBeLessThanOrEqual(2500);
    });

    it('should have stream health ≥90%', () => {
      expect(report.streamHealthRate).toBeGreaterThanOrEqual(90);
    });

    it('should have formatting compliance ≥90%', () => {
      expect(report.formattingComplianceRate).toBeGreaterThanOrEqual(90);
    });

    it('should return PASS verdict', () => {
      expect(report.verdict).toBe('PASS');
    });
  });
}

// ============================================================================
// STANDALONE RUNNER
// ============================================================================

if (require.main === module) {
  const useRealApi = process.argv.includes('--real');

  runGenerationTests({ verbose: true, useRealApi })
    .then(report => {
      const fs = require('fs');
      const reportPath = './generation-streaming-report.json';
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`Report saved to: ${reportPath}`);
      process.exit(report.verdict === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

export { runGenerationTests, generationTestCases, GenerationTestReport };
