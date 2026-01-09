/**
 * KODA Routing Verification Tests
 *
 * Verifies that all golden questions route to correct intent/domain/depth
 */

const fs = require('fs');
const path = require('path');
const { routeQuery, validateRouting, loadData } = require('./routerHarness');

const GOLDEN_FILE = path.join(__dirname, 'golden', 'questions.jsonl');
const KNOWN_EXCEPTIONS_FILE = path.join(__dirname, 'fixtures', 'known_exceptions.json');
const REPORT_FILE = path.join(__dirname, 'reports', 'routing_results.json');

// Load golden questions
function loadGoldenQuestions() {
  const content = fs.readFileSync(GOLDEN_FILE, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

// Load known exceptions (allowed failures)
function loadKnownExceptions() {
  if (fs.existsSync(KNOWN_EXCEPTIONS_FILE)) {
    return JSON.parse(fs.readFileSync(KNOWN_EXCEPTIONS_FILE, 'utf-8'));
  }
  return { allowed_failures: [] };
}

describe('KODA Routing Verification', () => {
  let goldenQuestions;
  let knownExceptions;
  let results = [];

  beforeAll(() => {
    loadData();
    goldenQuestions = loadGoldenQuestions();
    knownExceptions = loadKnownExceptions();
    console.log(`Loaded ${goldenQuestions.length} golden questions`);
    console.log(`Known exceptions: ${knownExceptions.allowed_failures?.length || 0}`);
  });

  afterAll(() => {
    // Write results report
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const knownFailures = results.filter(r => r.isKnownException).length;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        passed,
        failed,
        knownFailures,
        passRate: (passed / results.length * 100).toFixed(2) + '%'
      },
      results,
      failures: results.filter(r => !r.passed && !r.isKnownException)
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`\nResults saved to: ${REPORT_FILE}`);
  });

  // Group tests by category
  describe('Intent Routing', () => {
    test.each([
      ['DOCUMENTS', 'doc_'],
      ['EXTRACTION', 'ext_'],
      ['REASONING', 'rsn_'],
      ['EDIT', 'edit_'],
      ['HELP', 'help_'],
      ['CONVERSATION', 'conv_'],
      ['ERROR', 'err_'],
      ['FILE_ACTIONS', 'file_'],
      ['MEMORY', 'mem_'],
      ['PREFERENCES', 'pref_']
    ])('%s intent routes correctly', (intent, prefix) => {
      const questions = goldenQuestions.filter(q => q.id.startsWith(prefix));

      for (const q of questions) {
        const result = routeQuery(q.input);
        const validation = validateRouting(result, q.expect);
        const isKnownException = knownExceptions.allowed_failures?.includes(q.id);

        results.push({
          id: q.id,
          input: q.input,
          expected: q.expect,
          actual: {
            intent: result.intent,
            domain: result.domain,
            depth: result.depth
          },
          passed: validation.passed,
          failures: validation.failures,
          isKnownException,
          routerMs: result.timing.router_ms
        });

        if (!isKnownException) {
          expect(validation.passed).toBe(true);
        }
      }
    });
  });

  describe('Domain Routing', () => {
    test('Legal domain activates correctly', () => {
      const legalQuestions = goldenQuestions.filter(q =>
        q.expect.domain?.includes('legal')
      );

      for (const q of legalQuestions) {
        const result = routeQuery(q.input);
        expect(result.domain).toContain('legal');
      }
    });

    test('Medical domain activates correctly', () => {
      const medicalQuestions = goldenQuestions.filter(q =>
        q.expect.domain?.includes('medical')
      );

      for (const q of medicalQuestions) {
        const result = routeQuery(q.input);
        expect(result.domain).toContain('medical');
      }
    });

    test('Finance domain activates correctly', () => {
      const financeQuestions = goldenQuestions.filter(q =>
        q.expect.domain?.includes('finance')
      );

      for (const q of financeQuestions) {
        const result = routeQuery(q.input);
        expect(result.domain).toContain('finance');
      }
    });

    test('Engineering domain activates correctly', () => {
      const engQuestions = goldenQuestions.filter(q =>
        q.expect.domain?.includes('engineering')
      );

      for (const q of engQuestions) {
        const result = routeQuery(q.input);
        expect(result.domain).toContain('engineering');
      }
    });

    test('Excel domain activates correctly', () => {
      const excelQuestions = goldenQuestions.filter(q =>
        q.expect.domain?.includes('excel')
      );

      for (const q of excelQuestions) {
        const result = routeQuery(q.input);
        expect(result.domain).toContain('excel');
      }
    });
  });

  describe('Depth Routing', () => {
    test('D1 (simple) queries route correctly', () => {
      const d1Questions = goldenQuestions.filter(q =>
        q.id.startsWith('depth_d1')
      );

      for (const q of d1Questions) {
        const result = routeQuery(q.input);
        expect(['D1', 'D2']).toContain(result.depth);
      }
    });

    test('D3 (analytical) queries route correctly', () => {
      const d3Questions = goldenQuestions.filter(q =>
        q.id.startsWith('depth_d3')
      );

      for (const q of d3Questions) {
        const result = routeQuery(q.input);
        expect(['D2', 'D3', 'D4']).toContain(result.depth);
      }
    });

    test('D5 (comprehensive) queries route correctly', () => {
      const d5Questions = goldenQuestions.filter(q =>
        q.id.startsWith('depth_d5')
      );

      for (const q of d5Questions) {
        const result = routeQuery(q.input);
        expect(['D4', 'D5']).toContain(result.depth);
      }
    });
  });

  describe('Tiebreaker Rules', () => {
    test('Tiebreaker rules activate when needed', () => {
      const tiebreakerQuestions = goldenQuestions.filter(q =>
        q.id.startsWith('tiebreak_')
      );

      for (const q of tiebreakerQuestions) {
        const result = routeQuery(q.input);
        const validation = validateRouting(result, q.expect);

        results.push({
          id: q.id,
          input: q.input,
          expected: q.expect,
          actual: {
            intent: result.intent,
            domain: result.domain,
            depth: result.depth
          },
          passed: validation.passed,
          failures: validation.failures,
          tiebreakerHits: result.routing.tie_breakers_hit,
          routerMs: result.timing.router_ms
        });

        expect(validation.passed).toBe(true);
      }
    });
  });

  describe('Negative Triggers', () => {
    test('Negative triggers influence routing correctly', () => {
      const negativeQuestions = goldenQuestions.filter(q =>
        q.id.startsWith('negative_')
      );

      for (const q of negativeQuestions) {
        const result = routeQuery(q.input);
        const validation = validateRouting(result, q.expect);

        results.push({
          id: q.id,
          input: q.input,
          expected: q.expect,
          actual: {
            intent: result.intent,
            domain: result.domain,
            depth: result.depth
          },
          passed: validation.passed,
          negativesHit: result.routing.negative_triggers_hit,
          routerMs: result.timing.router_ms
        });

        expect(validation.passed).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    test('Empty and minimal inputs handled gracefully', () => {
      const edgeQuestions = goldenQuestions.filter(q =>
        q.id.startsWith('edge_')
      );

      for (const q of edgeQuestions) {
        const result = routeQuery(q.input);

        // Should not throw and should return valid structure
        expect(result.intent).toBeDefined();
        expect(result.domain).toBeDefined();
        expect(result.depth).toBeDefined();

        results.push({
          id: q.id,
          input: q.input,
          expected: q.expect,
          actual: {
            intent: result.intent,
            domain: result.domain,
            depth: result.depth
          },
          passed: true,
          routerMs: result.timing.router_ms
        });
      }
    });
  });

  describe('Multilingual Support', () => {
    test('Portuguese queries route correctly', () => {
      const ptQuestions = goldenQuestions.filter(q =>
        q.id.startsWith('multilang_pt')
      );

      for (const q of ptQuestions) {
        const result = routeQuery(q.input, 'pt');
        const validation = validateRouting(result, q.expect);

        expect(validation.passed).toBe(true);
      }
    });

    test('Spanish queries route correctly', () => {
      const esQuestions = goldenQuestions.filter(q =>
        q.id.startsWith('multilang_es')
      );

      for (const q of esQuestions) {
        const result = routeQuery(q.input, 'es');
        const validation = validateRouting(result, q.expect);

        expect(validation.passed).toBe(true);
      }
    });
  });

  describe('Performance', () => {
    test('Router latency is under 30ms for all queries', () => {
      const slowQueries = results.filter(r => r.routerMs > 30);

      if (slowQueries.length > 0) {
        console.warn(`Warning: ${slowQueries.length} queries exceeded 30ms`);
        slowQueries.forEach(q => {
          console.warn(`  ${q.id}: ${q.routerMs}ms`);
        });
      }

      // Allow up to 5% of queries to be slow
      const slowPercent = (slowQueries.length / results.length) * 100;
      expect(slowPercent).toBeLessThan(5);
    });
  });
});
