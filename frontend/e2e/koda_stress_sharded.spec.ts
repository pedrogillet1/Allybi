/**
 * KODA Frontend Stress Test - Sharded Parallel Execution
 *
 * This test suite validates ChatGPT-like UX by:
 * 1. Running 100 questions across separate conversations (shards)
 * 2. Validating real frontend rendering (not backend JSON)
 * 3. Measuring streaming & latency
 * 4. Detecting fallbacks and formatting defects
 * 5. Generating comprehensive reports
 *
 * Run with: npx playwright test e2e/koda_stress_sharded.spec.ts --workers=6
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loadManifest, createShards, Shard, TestQuestion } from './utils/shard';
import { login } from './utils/auth';
import { startNewConversation, waitForConversationReady, getLastAssistantMessage } from './utils/conversation';
import { sendMessage, SendResult } from './utils/sendAndAssert';
import { runQualityGate, QualityReport, getQualitySummary } from './assertions/quality';
import { createShardReport, saveShardReport, createFinalReport, saveFinalReport, ShardReport } from './utils/reporter';

// ============================================================================
// Configuration
// ============================================================================

const MANIFEST_PATH = 'manifests/questions_en.json';
const RESULTS_BASE_DIR = 'e2e/results';

// Load manifest and create shards
const manifest = loadManifest(MANIFEST_PATH);
const shards = createShards(manifest);

// ============================================================================
// Test Setup
// ============================================================================

test.describe.configure({ mode: 'parallel' });

// Storage for all shard reports (collected after all tests)
const allShardReports: ShardReport[] = [];

// ============================================================================
// Generate Dynamic Tests for Each Shard
// ============================================================================

for (const shard of shards) {
  test.describe(`Shard ${shard.shardIndex + 1}: ${shard.shardName}`, () => {

    test(`should complete ${shard.questions.length} questions with ChatGPT-like UX`, async ({ page }) => {
      const shardStartTime = new Date();
      const results: SendResult[] = [];
      const qualityReports: QualityReport[] = [];

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Starting ${shard.shardName} (${shard.questions.length} questions)`);
      console.log(`${'='.repeat(60)}\n`);

      // Step 1: Login
      console.log(`[${shard.shardName}] Logging in...`);
      await login(page);
      console.log(`[${shard.shardName}] Login successful`);

      // Step 2: Start a new conversation for this shard
      console.log(`[${shard.shardName}] Starting new conversation...`);
      const conversation = await startNewConversation(page, shard.shardName);
      console.log(`[${shard.shardName}] Conversation ready: ${conversation.id || 'new'}`);

      // Step 3: Send each question and validate
      for (let i = 0; i < shard.questions.length; i++) {
        const question = shard.questions[i];
        console.log(`[${shard.shardName}] [${i + 1}/${shard.questions.length}] ${question.id}: ${question.text.substring(0, 50)}...`);

        // Send message
        const result = await sendMessage(page, question, {
          timeout: 60000,
          screenshotOnFail: true,
          resultsDir: path.join(RESULTS_BASE_DIR, manifest.suiteName, shard.shardName)
        });

        results.push(result);

        // Run quality gate
        const qualityReport = runQualityGate(result, question);
        qualityReports.push(qualityReport);

        // Log result
        const status = qualityReport.passed ? '✓ PASS' : '✗ FAIL';
        console.log(`[${shard.shardName}] [${question.id}] ${status} (TTFT: ${result.ttftMs}ms, Total: ${result.totalMs}ms)`);

        if (!qualityReport.passed) {
          const failedAssertions = qualityReport.assertions.filter(a => !a.passed && a.severity === 'error');
          for (const assertion of failedAssertions) {
            console.log(`   └── ${assertion.rule}: ${assertion.message}`);
          }
        }

        // Small delay between messages to ensure DOM stabilizes
        await page.waitForTimeout(500);
      }

      // Step 4: Create and save shard report
      const shardEndTime = new Date();
      const shardReport = createShardReport(shard, results, qualityReports, shardStartTime, shardEndTime);

      // Ensure results directory exists
      const resultsDir = path.join(RESULTS_BASE_DIR, manifest.suiteName);
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      saveShardReport(shardReport, resultsDir);

      // Log summary
      const summary = getQualitySummary(qualityReports);
      console.log(`\n${'─'.repeat(40)}`);
      console.log(`${shard.shardName} Complete`);
      console.log(`Pass Rate: ${summary.passRate.toFixed(1)}% (${summary.passed}/${summary.totalQuestions})`);
      console.log(`Avg TTFT: ${summary.avgTtft}ms | Avg Total: ${summary.avgTotal}ms`);
      console.log(`${'─'.repeat(40)}\n`);

      // Fail the test if any questions failed
      expect(summary.failed, `${shard.shardName}: ${summary.failed} questions failed`).toBe(0);
    });

  });
}

// ============================================================================
// After All Tests: Generate Final Report
// ============================================================================

test.afterAll(async () => {
  // Collect all shard reports from disk
  const resultsDir = path.join(RESULTS_BASE_DIR, manifest.suiteName);

  if (!fs.existsSync(resultsDir)) {
    console.log('No results directory found, skipping final report');
    return;
  }

  const shardDirs = fs.readdirSync(resultsDir).filter(d =>
    d.startsWith(manifest.suiteName) && fs.statSync(path.join(resultsDir, d)).isDirectory()
  );

  const shardReports: ShardReport[] = [];

  for (const shardDir of shardDirs) {
    const reportPath = path.join(resultsDir, shardDir, `${shardDir}.json`);
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as ShardReport;
      shardReports.push(report);
    }
  }

  if (shardReports.length === 0) {
    console.log('No shard reports found, skipping final report');
    return;
  }

  // Sort by shard index
  shardReports.sort((a, b) => a.shardIndex - b.shardIndex);

  // Generate final report
  const suiteStartTime = new Date(Math.min(...shardReports.map(s => new Date(s.startTime).getTime())));
  const suiteEndTime = new Date(Math.max(...shardReports.map(s => new Date(s.endTime).getTime())));

  const finalReport = createFinalReport(manifest.suiteName, shardReports, suiteStartTime, suiteEndTime);
  saveFinalReport(finalReport, resultsDir);

  // Print final summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`FINAL REPORT - ${manifest.suiteName}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Total Questions: ${finalReport.totalQuestions}`);
  console.log(`Passed: ${finalReport.totalPassed}`);
  console.log(`Failed: ${finalReport.totalFailed}`);
  console.log(`Pass Rate: ${finalReport.overallPassRate.toFixed(1)}%`);
  console.log(`Avg TTFT: ${finalReport.avgTtft}ms`);
  console.log(`Avg Total: ${finalReport.avgTotal}ms`);
  console.log(`Total Time: ${(finalReport.totalTimeMs / 1000).toFixed(1)}s`);
  console.log(`\n${finalReport.goNoGo === 'GO' ? '✅' : '❌'} ${finalReport.goNoGo}: ${finalReport.goNoGoReason}`);
  console.log(`${'═'.repeat(60)}\n`);

  console.log(`Reports saved to: ${resultsDir}/`);
  console.log(`- FINAL_REPORT.md`);
  console.log(`- FINAL_REPORT.json`);
  console.log(`- metrics.csv`);
});
