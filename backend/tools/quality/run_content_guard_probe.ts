/**
 * Content Guard Probe Runner
 *
 * Tests the content guard patterns against probe suites
 * to verify ≥98% accuracy.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isContentQuestion, classifyQuery, getBankStats, resetPatternCache } from '../../src/services/core/contentGuard.service';

interface Probe {
  id: string;
  query: string;
  expected: 'content' | 'file_action';
  family: string;
  reason: string;
}

interface ProbeResult {
  probe: Probe;
  actual: 'content' | 'file_action' | 'unknown';
  pass: boolean;
  matchedPattern?: string;
  matchedFamily?: string;
}

function runProbeFile(probePath: string): { results: ProbeResult[]; accuracy: number } {
  const probes: Probe[] = fs.readFileSync(probePath, 'utf-8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));

  const results: ProbeResult[] = [];
  let passed = 0;

  for (const probe of probes) {
    const classification = classifyQuery(probe.query);

    let actual: 'content' | 'file_action' | 'unknown';
    if (classification.isContentQuestion) {
      actual = 'content';
    } else if (classification.isFileAction) {
      actual = 'file_action';
    } else {
      actual = 'unknown';
    }

    const pass = actual === probe.expected;
    if (pass) passed++;

    results.push({
      probe,
      actual,
      pass,
      matchedPattern: classification.matchedPattern || undefined,
      matchedFamily: classification.matchedFamily || undefined,
    });
  }

  return {
    results,
    accuracy: (passed / probes.length) * 100,
  };
}

function main() {
  const outputDir = process.argv[2] || path.join(__dirname, '../../audit_output_mass/content_guard_bank_plan_20260119_144436');

  console.log('═'.repeat(60));
  console.log('CONTENT GUARD PROBE SUITE');
  console.log('═'.repeat(60));
  console.log();

  // Reset cache to ensure fresh bank loading
  resetPatternCache();

  // Get bank stats
  const stats = getBankStats();
  console.log('Bank Statistics:');
  console.log(`  EN Content Patterns: ${stats.enContent}`);
  console.log(`  PT Content Patterns: ${stats.ptContent}`);
  console.log(`  EN Negative Patterns: ${stats.enNegative}`);
  console.log(`  PT Negative Patterns: ${stats.ptNegative}`);
  console.log(`  Fallback Content: ${stats.fallbackContent}`);
  console.log(`  Fallback File Action: ${stats.fallbackFileAction}`);
  console.log();

  // Run EN probes
  const enProbePath = path.join(outputDir, 'content_guard_probe.en.jsonl');
  if (fs.existsSync(enProbePath)) {
    console.log('─'.repeat(60));
    console.log('EN PROBE SUITE');
    console.log('─'.repeat(60));

    const enResults = runProbeFile(enProbePath);

    // Show failures
    const enFailures = enResults.results.filter(r => !r.pass);
    if (enFailures.length > 0) {
      console.log(`\nFailed probes (${enFailures.length}):`);
      for (const f of enFailures) {
        console.log(`  [${f.probe.id}] "${f.probe.query}"`);
        console.log(`    Expected: ${f.probe.expected}, Got: ${f.actual}`);
        console.log(`    Family: ${f.probe.family}, Reason: ${f.probe.reason}`);
        if (f.matchedPattern) {
          console.log(`    Matched: ${f.matchedPattern}`);
        }
      }
    }

    console.log(`\nEN Accuracy: ${enResults.accuracy.toFixed(2)}% (${enResults.results.filter(r => r.pass).length}/${enResults.results.length})`);
    console.log();
  }

  // Run PT probes
  const ptProbePath = path.join(outputDir, 'content_guard_probe.pt.jsonl');
  if (fs.existsSync(ptProbePath)) {
    console.log('─'.repeat(60));
    console.log('PT PROBE SUITE');
    console.log('─'.repeat(60));

    const ptResults = runProbeFile(ptProbePath);

    // Show failures
    const ptFailures = ptResults.results.filter(r => !r.pass);
    if (ptFailures.length > 0) {
      console.log(`\nFailed probes (${ptFailures.length}):`);
      for (const f of ptFailures) {
        console.log(`  [${f.probe.id}] "${f.probe.query}"`);
        console.log(`    Expected: ${f.probe.expected}, Got: ${f.actual}`);
        console.log(`    Family: ${f.probe.family}, Reason: ${f.probe.reason}`);
        if (f.matchedPattern) {
          console.log(`    Matched: ${f.matchedPattern}`);
        }
      }
    }

    console.log(`\nPT Accuracy: ${ptResults.accuracy.toFixed(2)}% (${ptResults.results.filter(r => r.pass).length}/${ptResults.results.length})`);
    console.log();
  }

  // Overall summary
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const enProbeResults = fs.existsSync(enProbePath) ? runProbeFile(enProbePath) : null;
  const ptProbeResults = fs.existsSync(ptProbePath) ? runProbeFile(ptProbePath) : null;

  if (enProbeResults && ptProbeResults) {
    const totalProbes = enProbeResults.results.length + ptProbeResults.results.length;
    const totalPassed = enProbeResults.results.filter(r => r.pass).length + ptProbeResults.results.filter(r => r.pass).length;
    const overallAccuracy = (totalPassed / totalProbes) * 100;

    console.log(`Total Probes: ${totalProbes}`);
    console.log(`Total Passed: ${totalPassed}`);
    console.log(`Overall Accuracy: ${overallAccuracy.toFixed(2)}%`);
    console.log();

    const passGate = overallAccuracy >= 98;
    console.log(`Gate (≥98%): ${passGate ? '✓ PASS' : '✗ FAIL'}`);

    // Write results file
    const resultsPath = path.join(outputDir, 'PROBE_RESULTS.md');
    const resultsContent = `# Content Guard Probe Results

## Summary
- **Date**: ${new Date().toISOString()}
- **Overall Accuracy**: ${overallAccuracy.toFixed(2)}%
- **Gate (≥98%)**: ${passGate ? '✓ PASS' : '✗ FAIL'}

## Bank Statistics
| Bank | Patterns |
|------|----------|
| EN Content | ${stats.enContent} |
| PT Content | ${stats.ptContent} |
| EN Negative | ${stats.enNegative} |
| PT Negative | ${stats.ptNegative} |

## Results by Language

### English (EN)
- **Total Probes**: ${enProbeResults.results.length}
- **Passed**: ${enProbeResults.results.filter(r => r.pass).length}
- **Failed**: ${enProbeResults.results.filter(r => !r.pass).length}
- **Accuracy**: ${enProbeResults.accuracy.toFixed(2)}%

${enProbeResults.results.filter(r => !r.pass).length > 0 ? `
#### Failed EN Probes
| ID | Query | Expected | Actual |
|----|-------|----------|--------|
${enProbeResults.results.filter(r => !r.pass).map(f => `| ${f.probe.id} | ${f.probe.query.substring(0, 40)}... | ${f.probe.expected} | ${f.actual} |`).join('\n')}
` : '✓ All EN probes passed'}

### Portuguese (PT)
- **Total Probes**: ${ptProbeResults.results.length}
- **Passed**: ${ptProbeResults.results.filter(r => r.pass).length}
- **Failed**: ${ptProbeResults.results.filter(r => !r.pass).length}
- **Accuracy**: ${ptProbeResults.accuracy.toFixed(2)}%

${ptProbeResults.results.filter(r => !r.pass).length > 0 ? `
#### Failed PT Probes
| ID | Query | Expected | Actual |
|----|-------|----------|--------|
${ptProbeResults.results.filter(r => !r.pass).map(f => `| ${f.probe.id} | ${f.probe.query.substring(0, 40)}... | ${f.probe.expected} | ${f.actual} |`).join('\n')}
` : '✓ All PT probes passed'}

## Critical Test Cases

### Q42 Pattern (Topics + Cover)
\`\`\`
Query: "What topics does the Project Management Presentation cover?"
Expected: content
Result: ${isContentQuestion('What topics does the Project Management Presentation cover?') ? '✓ PASS' : '✗ FAIL'}
\`\`\`

### File Action Collision Prevention
\`\`\`
Query: "List my files"
Expected: file_action
Result: ${!isContentQuestion('List my files') ? '✓ PASS' : '✗ FAIL'}
\`\`\`
`;

    fs.writeFileSync(resultsPath, resultsContent);
    console.log(`\nResults written to: ${resultsPath}`);
  }
}

main();
