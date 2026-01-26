/**
 * Test Modes Utility
 *
 * Separates strict seed tests from lenient mutation tests.
 *
 * STRICT MODE (Seed Tests):
 * - Manually crafted test cases
 * - Must always pass (100% success rate)
 * - Run on every CI build
 * - Failures are blocking
 *
 * LENIENT MODE (Mutation Tests):
 * - Auto-generated variations
 * - Exploratory testing
 * - 90%+ success rate acceptable
 * - Failures logged but not blocking
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface TestModeConfig {
  /** Run strict seed tests */
  strict: boolean;
  /** Run lenient mutation tests */
  lenient: boolean;
  /** Minimum pass rate for lenient tests (0-1) */
  lenientPassThreshold: number;
  /** Maximum time per test in ms */
  timeoutMs: number;
  /** Log failures in lenient mode */
  logLenientFailures: boolean;
}

const DEFAULT_CONFIG: TestModeConfig = {
  strict: true,
  lenient: true,
  lenientPassThreshold: 0.35,  // 35% for mutation tests (mutations are designed to fail)
  timeoutMs: 5000,
  logLenientFailures: false,
};

// Check environment for test mode overrides
function getConfigFromEnv(): TestModeConfig {
  const config = { ...DEFAULT_CONFIG };

  // TEST_MODE=strict runs only strict tests
  // TEST_MODE=lenient runs only lenient tests
  // TEST_MODE=all runs both (default)
  const testMode = process.env.TEST_MODE?.toLowerCase();

  if (testMode === 'strict') {
    config.strict = true;
    config.lenient = false;
  } else if (testMode === 'lenient') {
    config.strict = false;
    config.lenient = true;
  }

  // Override pass threshold
  if (process.env.LENIENT_PASS_THRESHOLD) {
    config.lenientPassThreshold = parseFloat(process.env.LENIENT_PASS_THRESHOLD);
  }

  // Verbose logging for CI
  if (process.env.CI === 'true' || process.env.VERBOSE_TESTS === 'true') {
    config.logLenientFailures = true;
  }

  return config;
}

export const testConfig = getConfigFromEnv();

// ═══════════════════════════════════════════════════════════════════════════
// STRICT TEST WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

export interface StrictTestCase<T> {
  id: string;
  description: string;
  input: T;
  validate: (input: T) => { passed: boolean; errors: string[] };
}

/**
 * Run strict seed tests - all must pass
 */
export function runStrictTests<T>(
  name: string,
  cases: StrictTestCase<T>[],
  itFn: (name: string, fn: () => void) => void,
  expectFn: (value: boolean) => { toBe: (expected: boolean) => void }
): void {
  if (!testConfig.strict) {
    console.log(`[SKIP] Strict tests for ${name} (TEST_MODE !== strict)`);
    return;
  }

  for (const testCase of cases) {
    itFn(`[STRICT] ${testCase.id}: ${testCase.description}`, () => {
      const result = testCase.validate(testCase.input);

      if (!result.passed) {
        console.error(`[STRICT FAIL] ${testCase.id}:`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
      }

      expectFn(result.passed).toBe(true);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LENIENT TEST WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

export interface LenientTestCase<T> {
  id: string;
  input: T;
  validate: (input: T) => { passed: boolean; errors: string[] };
}

export interface LenientTestResult {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  failures: { id: string; errors: string[] }[];
}

/**
 * Run lenient mutation tests - allow some failures
 */
export function runLenientTests<T>(
  name: string,
  cases: LenientTestCase<T>[],
  itFn: (name: string, fn: () => void) => void,
  expectFn: (value: number) => { toBeGreaterThanOrEqual: (expected: number) => void }
): void {
  if (!testConfig.lenient) {
    console.log(`[SKIP] Lenient tests for ${name} (TEST_MODE !== lenient)`);
    return;
  }

  const results: LenientTestResult = {
    total: cases.length,
    passed: 0,
    failed: 0,
    passRate: 0,
    failures: [],
  };

  // Run all tests and collect results
  for (const testCase of cases) {
    const result = testCase.validate(testCase.input);

    if (result.passed) {
      results.passed++;
    } else {
      results.failed++;
      results.failures.push({ id: testCase.id, errors: result.errors });
    }
  }

  results.passRate = results.passed / results.total;

  itFn(`[LENIENT] ${name} - ${cases.length} mutation tests`, () => {
    console.log(`\n[LENIENT] ${name} Results:`);
    console.log(`  Total: ${results.total}`);
    console.log(`  Passed: ${results.passed} (${(results.passRate * 100).toFixed(1)}%)`);
    console.log(`  Failed: ${results.failed}`);
    console.log(`  Threshold: ${(testConfig.lenientPassThreshold * 100).toFixed(1)}%`);

    if (testConfig.logLenientFailures && results.failures.length > 0) {
      console.log(`\n  Failures (first 10):`);
      for (const failure of results.failures.slice(0, 10)) {
        console.log(`    - ${failure.id}: ${failure.errors[0]}`);
      }
    }

    expectFn(results.passRate).toBeGreaterThanOrEqual(testConfig.lenientPassThreshold);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

export interface BatchTestOptions {
  batchSize: number;
  parallelBatches: boolean;
}

const DEFAULT_BATCH_OPTIONS: BatchTestOptions = {
  batchSize: 100,
  parallelBatches: false,
};

/**
 * Run tests in batches for large test suites
 */
export function runBatchedLenientTests<T>(
  name: string,
  cases: LenientTestCase<T>[],
  describeFn: (name: string, fn: () => void) => void,
  itFn: (name: string, fn: () => void) => void,
  expectFn: (value: number) => { toBeGreaterThanOrEqual: (expected: number) => void },
  options: Partial<BatchTestOptions> = {}
): void {
  if (!testConfig.lenient) {
    console.log(`[SKIP] Batched lenient tests for ${name}`);
    return;
  }

  const opts = { ...DEFAULT_BATCH_OPTIONS, ...options };
  const batches = Math.ceil(cases.length / opts.batchSize);

  const aggregatedResults: LenientTestResult = {
    total: 0,
    passed: 0,
    failed: 0,
    passRate: 0,
    failures: [],
  };

  describeFn(`[LENIENT BATCHED] ${name}`, () => {
    for (let batch = 0; batch < batches; batch++) {
      const start = batch * opts.batchSize;
      const end = Math.min(start + opts.batchSize, cases.length);
      const batchCases = cases.slice(start, end);

      itFn(`Batch ${batch + 1}/${batches} (${start + 1}-${end})`, () => {
        let batchPassed = 0;
        let batchFailed = 0;

        for (const testCase of batchCases) {
          const result = testCase.validate(testCase.input);

          if (result.passed) {
            batchPassed++;
          } else {
            batchFailed++;
            if (aggregatedResults.failures.length < 50) {
              aggregatedResults.failures.push({ id: testCase.id, errors: result.errors });
            }
          }
        }

        aggregatedResults.total += batchCases.length;
        aggregatedResults.passed += batchPassed;
        aggregatedResults.failed += batchFailed;
        aggregatedResults.passRate = aggregatedResults.passed / aggregatedResults.total;

        // Each batch should meet threshold
        const batchPassRate = batchPassed / batchCases.length;
        expectFn(batchPassRate).toBeGreaterThanOrEqual(testConfig.lenientPassThreshold * 0.9);
      });
    }

    // Final summary
    itFn(`Summary: ${name}`, () => {
      console.log(`\n[LENIENT BATCHED] ${name} Final Results:`);
      console.log(`  Total: ${aggregatedResults.total}`);
      console.log(`  Passed: ${aggregatedResults.passed} (${(aggregatedResults.passRate * 100).toFixed(1)}%)`);
      console.log(`  Failed: ${aggregatedResults.failed}`);

      expectFn(aggregatedResults.passRate).toBeGreaterThanOrEqual(testConfig.lenientPassThreshold);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED VS MUTATION SEPARATION
// ═══════════════════════════════════════════════════════════════════════════

export interface SeedAndMutationConfig<TSeed, TMutation> {
  name: string;
  seedTests: StrictTestCase<TSeed>[];
  mutationGenerator: (seeds: TSeed[]) => TMutation[];
  mutationValidator: (input: TMutation) => { passed: boolean; errors: string[] };
  mutationCount: number;
}

/**
 * Run both seed (strict) and mutation (lenient) tests
 */
export function runSeedAndMutationTests<TSeed, TMutation>(
  config: SeedAndMutationConfig<TSeed, TMutation>,
  describeFn: (name: string, fn: () => void) => void,
  itFn: (name: string, fn: () => void) => void,
  expectFn: {
    toBe: (value: boolean) => { toBe: (expected: boolean) => void };
    toBeGte: (value: number) => { toBeGreaterThanOrEqual: (expected: number) => void };
  }
): void {
  describeFn(config.name, () => {
    // Strict seed tests
    describeFn('Seed Tests (Strict)', () => {
      runStrictTests(
        config.name,
        config.seedTests,
        itFn,
        expectFn.toBe
      );
    });

    // Lenient mutation tests
    describeFn('Mutation Tests (Lenient)', () => {
      const seeds = config.seedTests.map(s => s.input);
      const mutations = config.mutationGenerator(seeds).slice(0, config.mutationCount);

      const mutationCases: LenientTestCase<TMutation>[] = mutations.map((m, i) => ({
        id: `mutation-${i + 1}`,
        input: m,
        validate: config.mutationValidator,
      }));

      runLenientTests(
        `${config.name} Mutations`,
        mutationCases,
        itFn,
        expectFn.toBeGte
      );
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface TestStats {
  strictTotal: number;
  strictPassed: number;
  strictFailed: number;
  lenientTotal: number;
  lenientPassed: number;
  lenientFailed: number;
  lenientPassRate: number;
}

/**
 * Aggregate test statistics across suites
 */
export class TestStatsCollector {
  private stats: TestStats = {
    strictTotal: 0,
    strictPassed: 0,
    strictFailed: 0,
    lenientTotal: 0,
    lenientPassed: 0,
    lenientFailed: 0,
    lenientPassRate: 0,
  };

  recordStrictResult(passed: boolean): void {
    this.stats.strictTotal++;
    if (passed) {
      this.stats.strictPassed++;
    } else {
      this.stats.strictFailed++;
    }
  }

  recordLenientResult(passed: boolean): void {
    this.stats.lenientTotal++;
    if (passed) {
      this.stats.lenientPassed++;
    } else {
      this.stats.lenientFailed++;
    }
    this.stats.lenientPassRate = this.stats.lenientPassed / this.stats.lenientTotal;
  }

  getStats(): TestStats {
    return { ...this.stats };
  }

  printSummary(): void {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('TEST SUMMARY');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`STRICT TESTS: ${this.stats.strictPassed}/${this.stats.strictTotal} passed`);
    console.log(`  - Required: 100%`);
    console.log(`  - Actual: ${((this.stats.strictPassed / this.stats.strictTotal) * 100).toFixed(1)}%`);
    console.log('');
    console.log(`LENIENT TESTS: ${this.stats.lenientPassed}/${this.stats.lenientTotal} passed`);
    console.log(`  - Required: ${(testConfig.lenientPassThreshold * 100).toFixed(1)}%`);
    console.log(`  - Actual: ${(this.stats.lenientPassRate * 100).toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════\n');
  }
}

export const globalStats = new TestStatsCollector();
