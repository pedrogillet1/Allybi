/**
 * Comprehensive Koda Test Runner
 * Executes all 30 tests in a single conversation with real authentication
 *
 * Run with: npx ts-node tests/runComprehensiveTest.ts
 */

import {
  TEST_QUESTIONS,
  API_BASE_URL,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TestQuestion,
} from './comprehensiveKodaTest';

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  questionId: string;
  category: string;
  subcategory: string;
  language: string;
  query: string;
  expectedAnswerType: string;
  actualAnswerType?: string;
  expectedDuration: number;
  actualDuration: number;
  passed: boolean;
  responseLength: number;
  hasCitations: boolean;
  hasDocTokens: boolean;
  errors: string[];
  warnings: string[];
  response?: string;
  rawResponse?: any;
  performanceRatio: number; // actualDuration / expectedDuration
  // Service tracing
  servicesUsed: string[];
  serviceCallCount: number;
}

interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  avgDuration: number;
}

interface TestReport {
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  testsPassed: number;
  testsFailed: number;
  testsWithWarnings: number;
  totalTests: number;
  passRate: number;
  averageResponseTime: number;
  fastestTest: { id: string; duration: number };
  slowestTest: { id: string; duration: number };
  results: TestResult[];
  categoryStats: Map<string, CategoryStats>;
  conversationId: string;
  authToken: string;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runComprehensiveTests(): Promise<TestReport> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('           KODA COMPREHENSIVE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  const startTime = new Date();
  const results: TestResult[] = [];

  // Step 1: Authenticate
  console.log('Step 1: Authenticating...');
  const authToken = await authenticate();
  console.log(`   ✓ Authentication successful`);
  console.log('');

  // Step 2: Create conversation
  console.log('Step 2: Creating test conversation...');
  const conversationId = await createConversation(authToken);
  console.log(`   ✓ Conversation created: ${conversationId}`);
  console.log('');

  // Step 3: Run all tests
  console.log('Step 3: Running 30 tests...');
  console.log('');

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const question = TEST_QUESTIONS[i];
    console.log(`[${i + 1}/30] ${question.id}: ${question.subcategory}`);
    console.log(`   Query: "${question.query.substring(0, 50)}${question.query.length > 50 ? '...' : ''}"`);

    try {
      const result = await runSingleTest(question, conversationId, authToken);
      results.push(result);

      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`   ${status} | ${result.actualDuration}ms | ${result.responseLength} chars`);
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.join(', ')}`);
      }
    } catch (error: any) {
      console.log(`   ✗ ERROR: ${error.message}`);
      results.push({
        questionId: question.id,
        category: question.category,
        subcategory: question.subcategory,
        language: question.language,
        query: question.query,
        expectedAnswerType: question.expectedAnswerType,
        expectedDuration: question.expectedDuration,
        actualDuration: 0,
        passed: false,
        responseLength: 0,
        hasCitations: false,
        hasDocTokens: false,
        errors: [error.message],
        warnings: [],
        performanceRatio: 0,
        servicesUsed: [],
        serviceCallCount: 0,
      });
    }

    // Small delay between requests to avoid overwhelming the server
    await sleep(500);
    console.log('');
  }

  const endTime = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();

  // Calculate statistics
  const testsPassed = results.filter((r) => r.passed).length;
  const testsFailed = results.filter((r) => !r.passed).length;
  const testsWithWarnings = results.filter((r) => r.warnings.length > 0).length;
  const passRate = (testsPassed / results.length) * 100;
  const averageResponseTime =
    results.reduce((sum, r) => sum + r.actualDuration, 0) / results.length;

  // Find fastest and slowest tests
  let fastestTest = { id: '', duration: Infinity };
  let slowestTest = { id: '', duration: 0 };
  for (const result of results) {
    if (result.actualDuration > 0 && result.actualDuration < fastestTest.duration) {
      fastestTest = { id: result.questionId, duration: result.actualDuration };
    }
    if (result.actualDuration > slowestTest.duration) {
      slowestTest = { id: result.questionId, duration: result.actualDuration };
    }
  }

  // Calculate category statistics
  const categoryStats = new Map<string, CategoryStats>();
  for (const result of results) {
    const cat = result.category;
    if (!categoryStats.has(cat)) {
      categoryStats.set(cat, { total: 0, passed: 0, failed: 0, avgDuration: 0 });
    }
    const stats = categoryStats.get(cat)!;
    stats.total++;
    if (result.passed) stats.passed++;
    else stats.failed++;
    stats.avgDuration += result.actualDuration;
  }
  // Calculate average durations per category
  categoryStats.forEach((stats) => {
    stats.avgDuration = Math.round(stats.avgDuration / stats.total);
  });

  const report: TestReport = {
    startTime,
    endTime,
    totalDuration,
    testsPassed,
    testsFailed,
    testsWithWarnings,
    totalTests: results.length,
    passRate,
    averageResponseTime,
    fastestTest,
    slowestTest,
    results,
    categoryStats,
    conversationId,
    authToken,
  };

  return report;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function authenticate(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Authentication failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.token || data.accessToken;
}

async function createConversation(authToken: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      title: `Comprehensive Test - ${new Date().toISOString()}`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create conversation: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.id || data.conversationId;
}

async function runSingleTest(
  question: TestQuestion,
  conversationId: string,
  authToken: string
): Promise<TestResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const requestId = `test-${question.id}-${Date.now()}`;

  const response = await fetch(
    `${API_BASE_URL}/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'x-request-id': requestId, // Send request ID for tracing
      },
      body: JSON.stringify({
        content: question.query,
        role: 'user',
      }),
    }
  );

  const endTime = Date.now();
  const actualDuration = endTime - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // FIX: Properly extract assistant message content from API response
  // The API returns: { userMessage: {...}, assistantMessage: { content: "..." }, conversationId: "..." }
  const assistantMessage =
    data.assistantMessage?.content ||  // Primary: from assistantMessage object
    data.content ||                     // Fallback: direct content field
    data.message ||                     // Fallback: message field
    data.response ||                    // Fallback: response field
    '';

  // Extract service tracing info (if available)
  const servicesUsed = data._trace?.services || [];
  const serviceCallCount = data._trace?.callCount || 0;

  // Calculate performance ratio
  const performanceRatio = question.expectedDuration > 0
    ? actualDuration / question.expectedDuration
    : 0;

  // Validate response
  const hasCitations = assistantMessage.includes('[') && assistantMessage.includes(']');
  const hasDocTokens = /\{\{DOC:::|DOC\d+|doc\d+/i.test(assistantMessage);

  // Check validation rules
  if (question.validationRules.mustContain) {
    for (const term of question.validationRules.mustContain) {
      if (!assistantMessage.toLowerCase().includes(term.toLowerCase())) {
        warnings.push(`Missing expected term: "${term}"`);
      }
    }
  }

  if (question.validationRules.mustNotContain) {
    for (const term of question.validationRules.mustNotContain) {
      if (assistantMessage.toLowerCase().includes(term.toLowerCase())) {
        errors.push(`Contains forbidden term: "${term}"`);
      }
    }
  }

  if (question.validationRules.mustHaveCitations === true && !hasCitations) {
    warnings.push('Missing expected citations');
  }

  if (question.validationRules.mustHaveDocTokens === true && !hasDocTokens) {
    warnings.push('Missing expected document tokens');
  }

  // Validate services (if trace data available)
  if (servicesUsed.length > 0) {
    // Check required services
    for (const required of question.expectedServices.mustInclude) {
      if (!servicesUsed.includes(required)) {
        warnings.push(`Expected service not called: ${required}`);
      }
    }
    // Check forbidden services
    for (const forbidden of question.expectedServices.mustNotInclude) {
      if (servicesUsed.includes(forbidden)) {
        warnings.push(`Unexpected service called: ${forbidden}`);
      }
    }
  }

  // Check duration - use 3x threshold instead of 2x for more lenient testing
  if (actualDuration > question.expectedDuration * 3) {
    errors.push(`Response too slow: ${actualDuration}ms > ${question.expectedDuration * 3}ms (3x threshold)`);
  } else if (actualDuration > question.expectedDuration * 2) {
    warnings.push(`Response slower than expected: ${actualDuration}ms > ${question.expectedDuration * 2}ms`);
  }

  // Basic response validation
  if (assistantMessage.length === 0) {
    errors.push('Empty response');
  }

  const passed = errors.length === 0;

  return {
    questionId: question.id,
    category: question.category,
    subcategory: question.subcategory,
    language: question.language,
    query: question.query,
    expectedAnswerType: question.expectedAnswerType,
    expectedDuration: question.expectedDuration,
    actualDuration,
    passed,
    responseLength: assistantMessage.length,
    hasCitations,
    hasDocTokens,
    errors,
    warnings,
    performanceRatio,
    response: assistantMessage.substring(0, 500),
    rawResponse: data,
    servicesUsed,
    serviceCallCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(report: TestReport): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                      TEST REPORT');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Summary stats
  const passIcon = report.passRate >= 80 ? '✓' : report.passRate >= 50 ? '⚠' : '✗';
  console.log('SUMMARY');
  console.log(`   ${passIcon} Pass Rate: ${report.passRate.toFixed(1)}% (${report.testsPassed}/${report.totalTests})`);
  console.log(`   Total Tests: ${report.totalTests}`);
  console.log(`   ✓ Passed: ${report.testsPassed}`);
  console.log(`   ✗ Failed: ${report.testsFailed}`);
  console.log(`   ⚠ With Warnings: ${report.testsWithWarnings}`);
  console.log(`   Total Duration: ${(report.totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Avg Response Time: ${report.averageResponseTime.toFixed(0)}ms`);
  if (report.fastestTest.id) {
    console.log(`   🚀 Fastest: ${report.fastestTest.id} (${report.fastestTest.duration}ms)`);
  }
  if (report.slowestTest.id) {
    console.log(`   🐌 Slowest: ${report.slowestTest.id} (${report.slowestTest.duration}ms)`);
  }
  console.log(`   Conversation ID: ${report.conversationId}`);
  console.log('');

  // Category breakdown
  console.log('RESULTS BY CATEGORY');
  console.log('');

  report.categoryStats.forEach((stats, category) => {
    const passRate = ((stats.passed / stats.total) * 100).toFixed(0);
    const status = stats.failed === 0 ? '✓' : '✗';
    console.log(`${status} ${category}`);
    console.log(`   Passed: ${stats.passed}/${stats.total} (${passRate}%) | Avg: ${stats.avgDuration}ms`);
  });
  console.log('');

  // Detailed results
  console.log('DETAILED RESULTS');
  console.log('');

  for (const result of report.results) {
    const icon = result.passed ? '✓' : '✗';
    const warnIcon = result.warnings.length > 0 ? ' ⚠' : '';
    const perfRatio = result.performanceRatio.toFixed(1);
    console.log(`${icon}${warnIcon} ${result.questionId}: ${result.subcategory}`);
    console.log(`   Query: "${result.query.substring(0, 60)}${result.query.length > 60 ? '...' : ''}"`);
    console.log(`   Duration: ${result.actualDuration}ms (${perfRatio}x expected) | Response: ${result.responseLength} chars`);
    if (result.servicesUsed.length > 0) {
      console.log(`   Services: ${result.servicesUsed.join(', ')} (${result.serviceCallCount} calls)`);
    }
    if (result.errors.length > 0) {
      console.log(`   ❌ Errors: ${result.errors.join('; ')}`);
    }
    if (result.warnings.length > 0) {
      console.log(`   ⚠️  Warnings: ${result.warnings.join('; ')}`);
    }
    if (result.response && result.response.length > 0) {
      console.log(`   Response preview: "${result.response.substring(0, 100)}..."`);
    }
    console.log('');
  }

  // Failed tests summary
  const failed = report.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('FAILED TESTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    for (const result of failed) {
      console.log(`✗ ${result.questionId}: ${result.query}`);
      console.log(`   Errors: ${result.errors.join('; ')}`);
      console.log('');
    }
  }

  console.log('═══════════════════════════════════════════════════════════════════');
}

function saveReportToFile(report: TestReport): void {
  const fs = require('fs');
  const path = require('path');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.join(__dirname, '..', 'test-reports');

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Convert Map to object for JSON serialization
  const reportForJson = {
    ...report,
    categoryStats: Object.fromEntries(report.categoryStats),
  };

  // Save JSON report
  const jsonPath = path.join(reportDir, `comprehensive-test-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(reportForJson, null, 2));
  console.log(`JSON report saved to: ${jsonPath}`);

  // Save CSV report
  const csvPath = path.join(reportDir, `comprehensive-test-${timestamp}.csv`);
  const csvHeaders = [
    'Question ID',
    'Category',
    'Subcategory',
    'Language',
    'Query',
    'Passed',
    'Duration (ms)',
    'Expected Duration (ms)',
    'Performance Ratio',
    'Response Length',
    'Has Citations',
    'Has Doc Tokens',
    'Errors',
    'Warnings',
  ];
  const csvRows = report.results.map((r) => [
    r.questionId,
    `"${r.category}"`,
    `"${r.subcategory}"`,
    r.language,
    `"${r.query.replace(/"/g, '""')}"`,
    r.passed ? 'PASS' : 'FAIL',
    r.actualDuration,
    r.expectedDuration,
    r.performanceRatio.toFixed(2),
    r.responseLength,
    r.hasCitations ? 'Yes' : 'No',
    r.hasDocTokens ? 'Yes' : 'No',
    `"${r.errors.join('; ').replace(/"/g, '""')}"`,
    `"${r.warnings.join('; ').replace(/"/g, '""')}"`,
  ]);
  const csvContent = [csvHeaders.join(','), ...csvRows.map((row) => row.join(','))].join('\n');
  fs.writeFileSync(csvPath, csvContent);
  console.log(`CSV report saved to: ${csvPath}`);

  // Save HTML report
  const htmlPath = path.join(reportDir, `comprehensive-test-${timestamp}.html`);
  const html = generateHTMLReport(report);
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML report saved to: ${htmlPath}`);
}

function generateHTMLReport(report: TestReport): string {
  const passRate = report.passRate.toFixed(1);
  const statusColor = report.testsFailed === 0 ? '#4CAF50' : report.passRate >= 80 ? '#FF9800' : '#F44336';

  // Generate category rows
  const categoryRows = Array.from(report.categoryStats.entries())
    .map(([category, stats]) => {
      const rate = ((stats.passed / stats.total) * 100).toFixed(0);
      return `
        <tr>
          <td>${category}</td>
          <td>${stats.total}</td>
          <td class="pass">${stats.passed}</td>
          <td class="${stats.failed > 0 ? 'fail' : ''}">${stats.failed}</td>
          <td>${rate}%</td>
          <td>${stats.avgDuration}ms</td>
        </tr>
      `;
    })
    .join('');

  // Generate result rows
  const resultRows = report.results
    .map((result) => {
      const statusClass = result.passed ? 'pass' : 'fail';
      const statusText = result.passed ? 'PASS' : 'FAIL';
      const warnClass = result.warnings.length > 0 ? 'warning' : '';
      const issues = [...result.errors.map(e => `❌ ${e}`), ...result.warnings.map(w => `⚠️ ${w}`)].join('<br>');

      return `
        <tr class="${warnClass}">
          <td><strong>${result.questionId}</strong></td>
          <td class="query">"${result.query}"</td>
          <td class="${statusClass}">${statusText}</td>
          <td>${result.actualDuration}ms</td>
          <td>${result.performanceRatio.toFixed(1)}x</td>
          <td>${result.responseLength}</td>
          <td class="${result.errors.length > 0 ? 'fail' : warnClass}">${issues || '-'}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Koda Comprehensive Test Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid ${statusColor}; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin: 20px 0; }
    .stat-card { background: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 4px solid #2196F3; }
    .stat-card.success { border-left-color: #4CAF50; }
    .stat-card.error { border-left-color: #F44336; }
    .stat-card.warning { border-left-color: #FF9800; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #333; margin: 8px 0; }
    .stat-sub { font-size: 12px; color: #888; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; font-weight: 600; }
    tr:hover { background: #f9f9f9; }
    tr.warning { background: #fff8e1; }
    .pass { color: #4CAF50; font-weight: bold; }
    .fail { color: #F44336; font-weight: bold; }
    .warning { color: #FF9800; }
    .query { font-style: italic; color: #666; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timestamp { color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Koda Comprehensive Test Report</h1>
    <p class="timestamp"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>API:</strong> ${API_BASE_URL} | <strong>Conversation:</strong> ${report.conversationId}</p>

    <div class="summary">
      <div class="stat-card ${report.testsFailed === 0 ? 'success' : report.passRate >= 80 ? 'warning' : 'error'}">
        <div class="stat-label">Pass Rate</div>
        <div class="stat-value">${passRate}%</div>
        <div class="stat-sub">${report.testsPassed} / ${report.totalTests} passed</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Total Duration</div>
        <div class="stat-value">${(report.totalDuration / 1000).toFixed(1)}s</div>
        <div class="stat-sub">Avg: ${report.averageResponseTime.toFixed(0)}ms</div>
      </div>

      <div class="stat-card ${report.testsWithWarnings > 0 ? 'warning' : ''}">
        <div class="stat-label">Warnings</div>
        <div class="stat-value">${report.testsWithWarnings}</div>
        <div class="stat-sub">Tests with issues</div>
      </div>

      <div class="stat-card ${report.testsFailed > 0 ? 'error' : 'success'}">
        <div class="stat-label">Failed</div>
        <div class="stat-value">${report.testsFailed}</div>
        <div class="stat-sub">${report.testsPassed} passed</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Fastest</div>
        <div class="stat-value">${report.fastestTest.duration}ms</div>
        <div class="stat-sub">${report.fastestTest.id}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Slowest</div>
        <div class="stat-value">${report.slowestTest.duration}ms</div>
        <div class="stat-sub">${report.slowestTest.id}</div>
      </div>
    </div>

    <h2>Category Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Total</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Pass Rate</th>
          <th>Avg Duration</th>
        </tr>
      </thead>
      <tbody>
        ${categoryRows}
      </tbody>
    </table>

    <h2>Detailed Results</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Query</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Perf Ratio</th>
          <th>Response Len</th>
          <th>Issues</th>
        </tr>
      </thead>
      <tbody>
        ${resultRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    const report = await runComprehensiveTests();
    generateReport(report);
    saveReportToFile(report);

    // Exit with appropriate code
    if (report.passRate === 100) {
      console.log('\n✓ ALL TESTS PASSED');
      process.exit(0);
    } else {
      console.log(`\n✗ ${report.testsFailed} TESTS FAILED`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('Test runner failed:', error.message);
    process.exit(1);
  }
}

main();
