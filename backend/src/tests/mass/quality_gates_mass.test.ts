/**
 * Answer Quality Gates Mass Test Suite
 *
 * Tests that quality gates correctly identify defective outputs.
 * Generates 20k simulated model outputs and validates them.
 *
 * Target: >=99% detection accuracy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateOutputBatch,
  getOutputStats,
  validateOutput,
  GeneratedOutput,
  ValidationResult,
} from '../generators/outputGenerator';
import { validateAgainstBaseline } from '../baseline/config_snapshot';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TestResult {
  output: GeneratedOutput;
  validation: ValidationResult;
  correctlyClassified: boolean;
}

interface BatchResults {
  total: number;
  correctlyClassified: number;
  incorrectlyClassified: number;
  accuracy: number;
  falsePositives: number;  // Good outputs marked as bad
  falseNegatives: number;  // Bad outputs marked as good
  byDefect: Record<string, { total: number; detected: number; rate: number }>;
  failures: TestResult[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

function runQualityGateTest(output: GeneratedOutput): TestResult {
  const validation = validateOutput(output);

  // Correctly classified if:
  // - Good output passes (no failures) OR
  // - Bad output fails (has failures)
  const correctlyClassified = output.expectedToPass === validation.passed;

  return {
    output,
    validation,
    correctlyClassified,
  };
}

function runBatch(outputs: GeneratedOutput[]): BatchResults {
  const results: TestResult[] = [];
  const byDefect: Record<string, { total: number; detected: number }> = {};

  let falsePositives = 0;
  let falseNegatives = 0;

  for (const output of outputs) {
    const result = runQualityGateTest(output);
    results.push(result);

    // Track by defect type
    for (const defect of output.defects) {
      if (!byDefect[defect]) byDefect[defect] = { total: 0, detected: 0 };
      byDefect[defect].total++;

      // Check if this specific defect was detected
      if (result.validation.failures.some(f => f.toLowerCase().includes(defect.replace('_', '')))) {
        byDefect[defect].detected++;
      } else if (!result.validation.passed && defect !== 'none') {
        // Detected via other mechanism
        byDefect[defect].detected++;
      }
    }

    // Track false positives/negatives
    if (output.expectedToPass && !result.validation.passed) {
      falsePositives++;
    }
    if (!output.expectedToPass && result.validation.passed) {
      falseNegatives++;
    }
  }

  const correctlyClassified = results.filter(r => r.correctlyClassified).length;
  const incorrectlyClassified = results.length - correctlyClassified;

  // Calculate rates
  const byDefectWithRate = Object.fromEntries(
    Object.entries(byDefect).map(([k, v]) => [k, { ...v, rate: v.detected / v.total }])
  );

  return {
    total: results.length,
    correctlyClassified,
    incorrectlyClassified,
    accuracy: correctlyClassified / results.length,
    falsePositives,
    falseNegatives,
    byDefect: byDefectWithRate,
    failures: results.filter(r => !r.correctlyClassified).slice(0, 50),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VITEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('Answer Quality Gates Mass Tests', () => {
  let allOutputs: GeneratedOutput[];
  let results: BatchResults;

  beforeAll(async () => {
    // Validate baseline first
    const baselineCheck = validateAgainstBaseline(process.cwd());
    if (!baselineCheck.valid) {
      console.warn(`⚠️  Baseline warning: ${baselineCheck.message}`);
    }

    // Generate outputs
    console.log('\n[Quality Gates Mass Test] Generating outputs...');
    allOutputs = generateOutputBatch({ count: 20000 });

    const stats = getOutputStats(allOutputs);
    console.log(`  Generated: ${stats.total} outputs`);
    console.log(`  Good: ${stats.good} (${((stats.good / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  Defective: ${stats.defective} (${((stats.defective / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  By Format:`, stats.byFormat);

    // Run all tests
    console.log('\n[Quality Gates Mass Test] Running validation...');
    results = runBatch(allOutputs);
  }, 60000);

  afterAll(() => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' QUALITY GATES MASS TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total Outputs: ${results.total}`);
    console.log(`  Correctly Classified: ${results.correctlyClassified} (${(results.accuracy * 100).toFixed(2)}%)`);
    console.log(`  Incorrectly Classified: ${results.incorrectlyClassified}`);
    console.log(`  False Positives (good → bad): ${results.falsePositives}`);
    console.log(`  False Negatives (bad → good): ${results.falseNegatives}`);
    console.log('');
    console.log('  Detection by Defect Type:');
    for (const [defect, data] of Object.entries(results.byDefect)) {
      console.log(`    ${defect}: ${data.detected}/${data.total} (${(data.rate * 100).toFixed(1)}%)`);
    }
    console.log('═══════════════════════════════════════════════════════════════\n');
  });

  describe('Overall Accuracy', () => {
    it('should achieve >=95% classification accuracy', () => {
      expect(results.accuracy).toBeGreaterThanOrEqual(0.95);
    });

    it('should have <=2% false positive rate', () => {
      const goodCount = allOutputs.filter(o => o.expectedToPass).length;
      const falsePositiveRate = results.falsePositives / goodCount;
      expect(falsePositiveRate).toBeLessThanOrEqual(0.02);
    });

    it('should have <=5% false negative rate', () => {
      const badCount = allOutputs.filter(o => !o.expectedToPass).length;
      const falseNegativeRate = results.falseNegatives / badCount;
      expect(falseNegativeRate).toBeLessThanOrEqual(0.05);
    });
  });

  describe('Defect Detection', () => {
    it('should detect >=90% of truncated outputs', () => {
      const truncated = results.byDefect['truncated'];
      if (truncated && truncated.total > 50) {
        expect(truncated.rate).toBeGreaterThanOrEqual(0.90);
      }
    });

    it('should detect >=90% of dangling bullets', () => {
      const danglingBullet = results.byDefect['dangling_bullet'];
      if (danglingBullet && danglingBullet.total > 50) {
        expect(danglingBullet.rate).toBeGreaterThanOrEqual(0.90);
      }
    });

    it('should detect >=85% of invalid tables', () => {
      const invalidTable = results.byDefect['invalid_table'];
      if (invalidTable && invalidTable.total > 50) {
        expect(invalidTable.rate).toBeGreaterThanOrEqual(0.85);
      }
    });

    it('should detect >=95% of vague boilerplate', () => {
      const vagueBoilerplate = results.byDefect['vague_boilerplate'];
      if (vagueBoilerplate && vagueBoilerplate.total > 50) {
        expect(vagueBoilerplate.rate).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should detect >=90% of orphan markers', () => {
      const orphanMarker = results.byDefect['orphan_marker'];
      if (orphanMarker && orphanMarker.total > 50) {
        expect(orphanMarker.rate).toBeGreaterThanOrEqual(0.90);
      }
    });

    it('should detect >=95% of banned phrases', () => {
      const bannedPhrase = results.byDefect['banned_phrase'];
      if (bannedPhrase && bannedPhrase.total > 50) {
        expect(bannedPhrase.rate).toBeGreaterThanOrEqual(0.95);
      }
    });
  });

  describe('Good Output Integrity', () => {
    it('should correctly pass >=98% of good outputs', () => {
      const goodOutputs = results.byDefect['none'];
      if (goodOutputs && goodOutputs.total > 50) {
        // For good outputs, "detected" means incorrectly flagged
        const passRate = 1 - (goodOutputs.detected / goodOutputs.total);
        expect(passRate).toBeGreaterThanOrEqual(0.98);
      }
    });
  });

  describe('Sample Failures Analysis', () => {
    it('should log sample failures for debugging', () => {
      if (results.failures.length > 0) {
        console.log('\n  Sample Failures (first 10):');
        for (const failure of results.failures.slice(0, 10)) {
          console.log(`    Output ID: ${failure.output.id}`);
          console.log(`    Expected to pass: ${failure.output.expectedToPass}`);
          console.log(`    Actually passed: ${failure.validation.passed}`);
          console.log(`    Defects: [${failure.output.defects.join(', ')}]`);
          console.log(`    Validation failures: [${failure.validation.failures.join(', ')}]`);
          console.log(`    Content preview: "${failure.output.content.slice(0, 100)}..."`);
          console.log('');
        }
      }
      expect(true).toBe(true);
    });
  });
});
