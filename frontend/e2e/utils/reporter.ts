/**
 * Reporter Utility - Generates test reports and artifacts
 */

import * as fs from 'fs';
import * as path from 'path';
import { SendResult } from './sendAndAssert';
import { QualityReport, getQualitySummary } from '../assertions/quality';
import { Shard, TestQuestion } from './shard';

// ============================================================================
// Types
// ============================================================================

export interface ShardReport {
  shardName: string;
  shardIndex: number;
  startTime: Date;
  endTime: Date;
  totalTimeMs: number;
  questionsTotal: number;
  questionsPassed: number;
  questionsFailed: number;
  passRate: number;
  avgTtft: number;
  avgTotal: number;
  results: Array<{
    questionId: string;
    question: string;
    answer: string;
    ttftMs: number;
    totalMs: number;
    passed: boolean;
    failureReason: string | null;
    assertions: Array<{
      rule: string;
      passed: boolean;
      message: string;
    }>;
  }>;
  failures: Array<{
    questionId: string;
    question: string;
    reason: string;
    screenshotPath: string | null;
  }>;
}

export interface FinalReport {
  suiteName: string;
  runDate: Date;
  totalTimeMs: number;
  totalQuestions: number;
  totalPassed: number;
  totalFailed: number;
  overallPassRate: number;
  avgTtft: number;
  avgTotal: number;
  shards: ShardReport[];
  failedByRule: Record<string, number>;
  goNoGo: 'GO' | 'NO-GO';
  goNoGoReason: string;
}

// ============================================================================
// File System Helpers
// ============================================================================

function ensureDir(dirPath: string): void {
  const fullPath = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

function writeJSON(filePath: string, data: any): void {
  const fullPath = path.resolve(process.cwd(), filePath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

function writeMarkdown(filePath: string, content: string): void {
  const fullPath = path.resolve(process.cwd(), filePath);
  fs.writeFileSync(fullPath, content);
}

function writeCSV(filePath: string, headers: string[], rows: string[][]): void {
  const fullPath = path.resolve(process.cwd(), filePath);
  const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(fullPath, content);
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Create a shard report from results
 */
export function createShardReport(
  shard: Shard,
  results: SendResult[],
  qualityReports: QualityReport[],
  startTime: Date,
  endTime: Date
): ShardReport {
  const summary = getQualitySummary(qualityReports);

  return {
    shardName: shard.shardName,
    shardIndex: shard.shardIndex,
    startTime,
    endTime,
    totalTimeMs: endTime.getTime() - startTime.getTime(),
    questionsTotal: results.length,
    questionsPassed: summary.passed,
    questionsFailed: summary.failed,
    passRate: summary.passRate,
    avgTtft: summary.avgTtft,
    avgTotal: summary.avgTotal,
    results: results.map((r, i) => ({
      questionId: r.questionId,
      question: r.question,
      answer: r.answer.substring(0, 500) + (r.answer.length > 500 ? '...' : ''),
      ttftMs: r.ttftMs,
      totalMs: r.totalMs,
      passed: qualityReports[i]?.passed ?? r.passed,
      failureReason: r.failureReason,
      assertions: qualityReports[i]?.assertions.map(a => ({
        rule: a.rule,
        passed: a.passed,
        message: a.message
      })) || []
    })),
    failures: results
      .filter((r, i) => !qualityReports[i]?.passed)
      .map(r => ({
        questionId: r.questionId,
        question: r.question,
        reason: r.failureReason || 'Quality gate failed',
        screenshotPath: r.screenshotPath
      }))
  };
}

/**
 * Save shard report to disk
 */
export function saveShardReport(report: ShardReport, baseDir: string): void {
  const shardDir = path.join(baseDir, report.shardName);
  ensureDir(shardDir);
  ensureDir(path.join(shardDir, 'screenshots'));
  ensureDir(path.join(shardDir, 'dom_snapshots'));

  // Save JSON
  writeJSON(path.join(shardDir, `${report.shardName}.json`), report);

  // Save failures markdown
  if (report.failures.length > 0) {
    const md = generateFailuresMarkdown(report);
    writeMarkdown(path.join(shardDir, `${report.shardName}_failures.md`), md);
  }
}

/**
 * Generate failures markdown
 */
function generateFailuresMarkdown(report: ShardReport): string {
  let md = `# ${report.shardName} - Failures\n\n`;
  md += `**Pass Rate:** ${report.passRate.toFixed(1)}% (${report.questionsPassed}/${report.questionsTotal})\n\n`;

  for (const failure of report.failures) {
    md += `## ${failure.questionId}\n\n`;
    md += `**Question:** ${failure.question}\n\n`;
    md += `**Reason:** ${failure.reason}\n\n`;
    if (failure.screenshotPath) {
      md += `**Screenshot:** ${failure.screenshotPath}\n\n`;
    }
    md += `---\n\n`;
  }

  return md;
}

/**
 * Create final report from all shard reports
 */
export function createFinalReport(
  suiteName: string,
  shardReports: ShardReport[],
  startTime: Date,
  endTime: Date
): FinalReport {
  const totalQuestions = shardReports.reduce((sum, s) => sum + s.questionsTotal, 0);
  const totalPassed = shardReports.reduce((sum, s) => sum + s.questionsPassed, 0);
  const totalFailed = shardReports.reduce((sum, s) => sum + s.questionsFailed, 0);

  // Aggregate TTFT and total times
  const allTtfts = shardReports.flatMap(s => s.results.map(r => r.ttftMs));
  const allTotals = shardReports.flatMap(s => s.results.map(r => r.totalMs));
  const avgTtft = allTtfts.reduce((a, b) => a + b, 0) / allTtfts.length;
  const avgTotal = allTotals.reduce((a, b) => a + b, 0) / allTotals.length;

  // Aggregate failures by rule
  const failedByRule: Record<string, number> = {};
  for (const shard of shardReports) {
    for (const result of shard.results) {
      if (!result.passed) {
        for (const assertion of result.assertions) {
          if (!assertion.passed) {
            failedByRule[assertion.rule] = (failedByRule[assertion.rule] || 0) + 1;
          }
        }
      }
    }
  }

  const passRate = (totalPassed / totalQuestions) * 100;

  // Determine GO/NO-GO
  let goNoGo: 'GO' | 'NO-GO' = 'NO-GO';
  let goNoGoReason = '';

  if (passRate === 100) {
    goNoGo = 'GO';
    goNoGoReason = 'All tests passed with no fallbacks, correct formatting, and acceptable latency.';
  } else if (passRate >= 95) {
    goNoGo = 'NO-GO';
    goNoGoReason = `Pass rate ${passRate.toFixed(1)}% - close but not 100%. Fix ${totalFailed} failing tests.`;
  } else {
    goNoGo = 'NO-GO';
    goNoGoReason = `Pass rate ${passRate.toFixed(1)}% - significant failures. Review failed rules: ${Object.keys(failedByRule).join(', ')}`;
  }

  return {
    suiteName,
    runDate: endTime,
    totalTimeMs: endTime.getTime() - startTime.getTime(),
    totalQuestions,
    totalPassed,
    totalFailed,
    overallPassRate: passRate,
    avgTtft: Math.round(avgTtft),
    avgTotal: Math.round(avgTotal),
    shards: shardReports,
    failedByRule,
    goNoGo,
    goNoGoReason
  };
}

/**
 * Save final report
 */
export function saveFinalReport(report: FinalReport, baseDir: string): void {
  ensureDir(baseDir);

  // Save JSON
  writeJSON(path.join(baseDir, 'FINAL_REPORT.json'), report);

  // Save markdown
  const md = generateFinalReportMarkdown(report);
  writeMarkdown(path.join(baseDir, 'FINAL_REPORT.md'), md);

  // Save metrics CSV
  const headers = ['shard', 'qid', 'question', 'ttft', 'total_ms', 'pass_fail', 'failure_reason'];
  const rows: string[][] = [];

  for (const shard of report.shards) {
    for (const result of shard.results) {
      rows.push([
        shard.shardName,
        result.questionId,
        `"${result.question.replace(/"/g, '""')}"`,
        String(result.ttftMs),
        String(result.totalMs),
        result.passed ? 'PASS' : 'FAIL',
        `"${(result.failureReason || '').replace(/"/g, '""')}"`
      ]);
    }
  }

  writeCSV(path.join(baseDir, 'metrics.csv'), headers, rows);
}

/**
 * Generate final report markdown
 */
function generateFinalReportMarkdown(report: FinalReport): string {
  let md = `# ${report.suiteName} - Final Report\n\n`;

  // GO/NO-GO banner
  const banner = report.goNoGo === 'GO'
    ? '## ✅ GO - Ready for Launch\n'
    : '## ❌ NO-GO - Not Ready\n';
  md += banner;
  md += `\n**Reason:** ${report.goNoGoReason}\n\n`;

  // Summary stats
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Run Date | ${report.runDate.toISOString()} |\n`;
  md += `| Total Time | ${(report.totalTimeMs / 1000).toFixed(1)}s |\n`;
  md += `| Total Questions | ${report.totalQuestions} |\n`;
  md += `| Passed | ${report.totalPassed} |\n`;
  md += `| Failed | ${report.totalFailed} |\n`;
  md += `| Pass Rate | ${report.overallPassRate.toFixed(1)}% |\n`;
  md += `| Avg TTFT | ${report.avgTtft}ms |\n`;
  md += `| Avg Total | ${report.avgTotal}ms |\n\n`;

  // Shard breakdown
  md += `## Shard Results\n\n`;
  md += `| Shard | Passed | Failed | Rate | Avg TTFT |\n`;
  md += `|-------|--------|--------|------|----------|\n`;

  for (const shard of report.shards) {
    md += `| ${shard.shardName} | ${shard.questionsPassed} | ${shard.questionsFailed} | ${shard.passRate.toFixed(0)}% | ${shard.avgTtft}ms |\n`;
  }

  md += `\n`;

  // Failed by rule
  if (Object.keys(report.failedByRule).length > 0) {
    md += `## Failures by Rule\n\n`;
    md += `| Rule | Count |\n`;
    md += `|------|-------|\n`;

    for (const [rule, count] of Object.entries(report.failedByRule)) {
      md += `| ${rule} | ${count} |\n`;
    }

    md += `\n`;
  }

  // Detailed failures
  const allFailures = report.shards.flatMap(s => s.failures);
  if (allFailures.length > 0) {
    md += `## All Failures\n\n`;

    for (const failure of allFailures) {
      md += `### ${failure.questionId}\n\n`;
      md += `**Question:** ${failure.question}\n\n`;
      md += `**Reason:** ${failure.reason}\n\n`;
      md += `---\n\n`;
    }
  }

  return md;
}
