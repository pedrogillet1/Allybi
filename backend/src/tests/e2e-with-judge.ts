/**
 * KODA — ULTIMATE QUALITY TEST WITH LLM-AS-JUDGE
 *
 * 60 Questions | 12 Sections | Single Conversation
 * Every answer graded by Claude on 8 dimensions
 *
 * PASS THRESHOLD:
 * - Overall score ≥ 0.70
 * - No critical dimensions below 0.50
 * - Zero fallback/rephrase requests
 */

import 'dotenv/config';
import axios from 'axios';
import * as fs from 'fs';
import { AnswerJudgeService, JudgeResult } from './judge/answerJudge.service';

const API_BASE = process.env.API_BASE || 'http://localhost:5001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@koda.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123';

interface TestCase {
  id: number;
  section: string;
  question: string;
  expectedBehavior: string;
}

const TEST_CASES: TestCase[] = [
  // SECTION 1 — BASIC LOCATION AWARENESS
  { id: 1, section: '1-LOCATION-BASIC', question: 'Where is the Rosewood Fund document located?', expectedBehavior: 'Show file location with button' },
  { id: 2, section: '1-LOCATION-BASIC', question: 'Open the Rosewood Fund document.', expectedBehavior: 'Open file with button' },
  { id: 3, section: '1-LOCATION-BASIC', question: 'Which folder contains the financial report?', expectedBehavior: 'Name the folder' },
  { id: 4, section: '1-LOCATION-BASIC', question: 'Show me the contract document.', expectedBehavior: 'Show file with button' },
  { id: 5, section: '1-LOCATION-BASIC', question: 'Where exactly is the spreadsheet stored?', expectedBehavior: 'Show exact path' },

  // SECTION 2 — LOCATION + CONTENT
  { id: 6, section: '2-LOCATION-CONTENT', question: 'Where does the Rosewood Fund document talk about expected returns?', expectedBehavior: 'Cite page/section with content' },
  { id: 7, section: '2-LOCATION-CONTENT', question: 'On which page does it explain risk factors?', expectedBehavior: 'Provide page number' },
  { id: 8, section: '2-LOCATION-CONTENT', question: 'Open the page where operating expenses are discussed.', expectedBehavior: 'Open to specific page' },
  { id: 9, section: '2-LOCATION-CONTENT', question: 'Show me the exact section that mentions cash flow.', expectedBehavior: 'Quote or describe section' },
  { id: 10, section: '2-LOCATION-CONTENT', question: 'Where does the contract specify termination terms?', expectedBehavior: 'Locate in document' },

  // SECTION 3 — CONTENT UNDERSTANDING
  { id: 11, section: '3-CONTENT', question: 'What does the Rosewood Fund document say about expected returns?', expectedBehavior: 'Summarize document content' },
  { id: 12, section: '3-CONTENT', question: 'Why does it say that?', expectedBehavior: 'Explain reasoning from doc' },
  { id: 13, section: '3-CONTENT', question: 'What is the main risk highlighted in the financial report?', expectedBehavior: 'Extract key risk' },
  { id: 14, section: '3-CONTENT', question: 'Summarize the purpose of the contract.', expectedBehavior: 'Concise summary' },
  { id: 15, section: '3-CONTENT', question: 'What is the key takeaway from the spreadsheet?', expectedBehavior: 'Main insight' },

  // SECTION 4 — LOCATION + WHY
  { id: 16, section: '4-LOCATION-WHY', question: 'Where exactly does the document say who the stakeholders are, and why is that important?', expectedBehavior: 'Location + explanation' },
  { id: 17, section: '4-LOCATION-WHY', question: 'On which page is revenue recognition explained, and why is it structured that way?', expectedBehavior: 'Page + reasoning' },
  { id: 18, section: '4-LOCATION-WHY', question: 'Show me where the contract defines obligations, and explain their intent.', expectedBehavior: 'Location + intent' },
  { id: 19, section: '4-LOCATION-WHY', question: 'Open the page where expenses are listed and explain what stands out.', expectedBehavior: 'Page + analysis' },
  { id: 20, section: '4-LOCATION-WHY', question: 'Where does the spreadsheet calculate totals, and why is that relevant?', expectedBehavior: 'Location + relevance' },

  // SECTION 5 — FOLLOW-UPS
  { id: 21, section: '5-FOLLOWUPS', question: 'Does that section mention any limitations?', expectedBehavior: 'Answer from context' },
  { id: 22, section: '5-FOLLOWUPS', question: 'Is this page more important than the previous one?', expectedBehavior: 'Compare without asking' },
  { id: 23, section: '5-FOLLOWUPS', question: 'Does this document contradict the other financial file?', expectedBehavior: 'Cross-doc analysis' },
  { id: 24, section: '5-FOLLOWUPS', question: 'Open the earlier document again.', expectedBehavior: 'Remember and open' },
  { id: 25, section: '5-FOLLOWUPS', question: 'Where was that file stored?', expectedBehavior: 'Recall location' },

  // SECTION 6 — COMPARISON
  { id: 26, section: '6-COMPARISON', question: 'Which document explains financial performance more clearly?', expectedBehavior: 'Compare with reasoning' },
  { id: 27, section: '6-COMPARISON', question: 'Is the spreadsheet consistent with the financial report?', expectedBehavior: 'Analyze consistency' },
  { id: 28, section: '6-COMPARISON', question: 'Which file mentions risks in more detail?', expectedBehavior: 'Compare risk coverage' },
  { id: 29, section: '6-COMPARISON', question: 'Compare how the contract and report handle obligations.', expectedBehavior: 'Structured comparison' },
  { id: 30, section: '6-COMPARISON', question: 'Which document should I read first to understand the business?', expectedBehavior: 'Recommendation' },

  // SECTION 7 — NAVIGATION
  { id: 31, section: '7-NAVIGATION', question: 'List all documents in the finance folder.', expectedBehavior: 'List with buttons' },
  { id: 32, section: '7-NAVIGATION', question: 'List only the PDF files.', expectedBehavior: 'Filtered list' },
  { id: 33, section: '7-NAVIGATION', question: 'Show me all documents related to legal matters.', expectedBehavior: 'Semantic filter' },
  { id: 34, section: '7-NAVIGATION', question: 'Which files look like reports rather than raw data?', expectedBehavior: 'Classify files' },
  { id: 35, section: '7-NAVIGATION', question: 'Where are the oldest files stored?', expectedBehavior: 'Metadata query' },

  // SECTION 8 — FILE ACTIONS
  { id: 36, section: '8-FILE-ACTIONS', question: 'Just open it.', expectedBehavior: 'Button only, minimal text' },
  { id: 37, section: '8-FILE-ACTIONS', question: 'Show me that document again.', expectedBehavior: 'Re-show with button' },
  { id: 38, section: '8-FILE-ACTIONS', question: 'Where was that file?', expectedBehavior: 'Location from context' },
  { id: 39, section: '8-FILE-ACTIONS', question: 'Open the spreadsheet.', expectedBehavior: 'Open with button' },
  { id: 40, section: '8-FILE-ACTIONS', question: 'Go back to the Rosewood Fund document.', expectedBehavior: 'Navigate with button' },

  // SECTION 9 — AMBIGUOUS
  { id: 41, section: '9-AMBIGUOUS', question: 'Does this look good or bad overall?', expectedBehavior: 'Give opinion, no fallback' },
  { id: 42, section: '9-AMBIGUOUS', question: 'Is this better than the other one?', expectedBehavior: 'Compare, no clarify' },
  { id: 43, section: '9-AMBIGUOUS', question: "What's the main point here?", expectedBehavior: 'Summarize' },
  { id: 44, section: '9-AMBIGUOUS', question: 'Should I be concerned about anything?', expectedBehavior: 'Highlight risks' },
  { id: 45, section: '9-AMBIGUOUS', question: 'What stands out the most?', expectedBehavior: 'Key insight' },

  // SECTION 10 — STRESS
  { id: 46, section: '10-STRESS', question: 'Where is the contract?', expectedBehavior: 'Fast location' },
  { id: 47, section: '10-STRESS', question: 'Open it.', expectedBehavior: 'Fast open' },
  { id: 48, section: '10-STRESS', question: 'Where does it talk about obligations?', expectedBehavior: 'Find section' },
  { id: 49, section: '10-STRESS', question: 'Open that page.', expectedBehavior: 'Open page' },
  { id: 50, section: '10-STRESS', question: 'Go back to the financial report.', expectedBehavior: 'Switch doc' },
  { id: 51, section: '10-STRESS', question: 'Where is it stored?', expectedBehavior: 'Location fast' },

  // SECTION 11 — FORMAT
  { id: 52, section: '11-FORMAT', question: 'Explain this clearly.', expectedBehavior: 'Clear explanation' },
  { id: 53, section: '11-FORMAT', question: 'Explain this briefly.', expectedBehavior: 'Concise' },
  { id: 54, section: '11-FORMAT', question: 'Explain this step by step.', expectedBehavior: 'Numbered steps' },
  { id: 55, section: '11-FORMAT', question: "Explain this like I'm not technical.", expectedBehavior: 'Plain language' },
  { id: 56, section: '11-FORMAT', question: 'Just list the key points.', expectedBehavior: 'Bullet list' },

  // SECTION 12 — EDGE
  { id: 57, section: '12-EDGE', question: "Open a file that doesn't exist.", expectedBehavior: 'Graceful not found' },
  { id: 58, section: '12-EDGE', question: 'Which document is the most important?', expectedBehavior: 'Subjective handled' },
  { id: 59, section: '12-EDGE', question: 'Is anything missing from these files?', expectedBehavior: 'Helpful guidance' },
  { id: 60, section: '12-EDGE', question: 'What should I read next?', expectedBehavior: 'Suggestion' },
];

interface TestResult {
  id: number;
  section: string;
  question: string;
  answer: string;
  responseTime: number;
  judgeResult: JudgeResult;
}

async function login(): Promise<string> {
  const res = await axios.post(`${API_BASE}/api/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  return res.data.accessToken || res.data.token;
}

async function sendMessage(token: string, message: string, conversationId: string): Promise<{ answer: string; responseTime: number }> {
  const start = Date.now();
  const res = await axios.post(
    `${API_BASE}/api/rag/query`,
    { query: message, conversationId, language: 'en' },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 }
  );
  const responseTime = Date.now() - start;
  const answer = res.data.answer || res.data.response || '';
  return { answer, responseTime };
}

async function runTests() {
  console.log('═'.repeat(80));
  console.log('  KODA — ULTIMATE QUALITY TEST WITH LLM-AS-JUDGE');
  console.log('  60 Questions | 12 Sections | 8 Quality Dimensions');
  console.log('═'.repeat(80));
  console.log('\n  Every answer graded by Claude on:');
  console.log('  Correctness | Completeness | Formatting | Tone');
  console.log('  Hallucination | UX | Location | Redundancy\n');

  // Login
  console.log('🔐 Logging in...');
  let token: string;
  try {
    token = await login();
    console.log('✅ Logged in\n');
  } catch (e: any) {
    console.error('❌ Login failed:', e.message);
    process.exit(1);
  }

  const judge = new AnswerJudgeService();
  const conversationId = `quality-test-${Date.now()}`;
  const results: TestResult[] = [];
  let currentSection = '';
  const sectionStats: Record<string, { pass: number; fail: number; avgScore: number; scores: number[] }> = {};

  // Context tracking for follow-up questions
  let conversationContext = '';

  for (const testCase of TEST_CASES) {
    // Section header
    if (testCase.section !== currentSection) {
      currentSection = testCase.section;
      sectionStats[currentSection] = { pass: 0, fail: 0, avgScore: 0, scores: [] };
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`  SECTION ${currentSection}`);
      console.log(`${'─'.repeat(70)}`);
    }

    const qDisplay = testCase.question.length > 50
      ? testCase.question.substring(0, 47) + '...'
      : testCase.question.padEnd(50);

    process.stdout.write(`  [${testCase.id.toString().padStart(2)}] ${qDisplay} `);

    try {
      // Get Koda's answer
      const { answer, responseTime } = await sendMessage(token, testCase.question, conversationId);

      // Judge the answer
      const judgeResult = await judge.judge({
        question: testCase.question,
        answer,
        expectedBehavior: testCase.expectedBehavior,
        context: conversationContext,
      });

      // Update conversation context (last 3 exchanges)
      conversationContext = `Q: ${testCase.question}\nA: ${answer.substring(0, 500)}\n\n` + conversationContext;
      if (conversationContext.length > 2000) {
        conversationContext = conversationContext.substring(0, 2000);
      }

      const result: TestResult = {
        id: testCase.id,
        section: testCase.section,
        question: testCase.question,
        answer,
        responseTime,
        judgeResult,
      };
      results.push(result);

      // Update stats
      sectionStats[currentSection].scores.push(judgeResult.overallScore);
      if (judgeResult.pass) {
        sectionStats[currentSection].pass++;
        console.log(`✅ ${judgeResult.overallScore.toFixed(2)} ${judgeResult.verdict} (${responseTime}ms)`);
      } else {
        sectionStats[currentSection].fail++;
        console.log(`❌ ${judgeResult.overallScore.toFixed(2)} ${judgeResult.verdict}`);
        if (judgeResult.issues.length > 0) {
          console.log(`     Issues: ${judgeResult.issues[0]}`);
        }
      }

      // Rate limit between requests (judge + API)
      await new Promise(r => setTimeout(r, 500));

    } catch (e: any) {
      console.log(`❌ ERROR: ${e.message}`);
      results.push({
        id: testCase.id,
        section: testCase.section,
        question: testCase.question,
        answer: '',
        responseTime: 0,
        judgeResult: {
          pass: false,
          overallScore: 0,
          scores: { correctness: 0, completeness: 0, formatting: 0, tone: 0, hallucination: 0, ux: 0, location: 0, redundancy: 0 },
          issues: [e.message],
          suggestions: [],
          verdict: 'FAIL',
        },
      });
      sectionStats[currentSection].fail++;
      sectionStats[currentSection].scores.push(0);
    }
  }

  // Calculate section averages
  for (const section of Object.keys(sectionStats)) {
    const scores = sectionStats[section].scores;
    sectionStats[section].avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
  }

  // Final Report
  console.log('\n' + '═'.repeat(80));
  console.log('  FINAL QUALITY SCORECARD');
  console.log('═'.repeat(80));

  const passed = results.filter(r => r.judgeResult.pass).length;
  const failed = results.filter(r => !r.judgeResult.pass).length;
  const total = results.length;
  const overallAvg = results.reduce((sum, r) => sum + r.judgeResult.overallScore, 0) / total;

  console.log(`\n  Overall Pass Rate: ${passed}/${total} (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`  Overall Quality Score: ${(overallAvg * 100).toFixed(1)}%`);

  // Dimension breakdown
  console.log('\n  Dimension Averages:');
  const dimensions = ['correctness', 'completeness', 'formatting', 'tone', 'hallucination', 'ux', 'location', 'redundancy'];
  for (const dim of dimensions) {
    const avg = results.reduce((sum, r) => sum + (r.judgeResult.scores as any)[dim], 0) / total;
    const icon = avg >= 0.8 ? '✅' : avg >= 0.6 ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${dim.padEnd(15)} ${(avg * 100).toFixed(0)}%`);
  }

  // Section breakdown
  console.log('\n  Section Breakdown:');
  console.log('  ' + '─'.repeat(60));
  for (const [section, stats] of Object.entries(sectionStats)) {
    const sectionTotal = stats.pass + stats.fail;
    const rate = ((stats.pass / sectionTotal) * 100).toFixed(0);
    const status = stats.fail > 0 ? '⚠️ ' : '✅';
    console.log(`  ${status} ${section.padEnd(25)} ${stats.pass}/${sectionTotal} (${rate}%) avg=${(stats.avgScore * 100).toFixed(0)}%`);
  }

  // Top issues
  const allIssues: string[] = [];
  for (const r of results) {
    if (!r.judgeResult.pass) {
      allIssues.push(...r.judgeResult.issues.map(i => `[${r.id}] ${i}`));
    }
  }
  if (allIssues.length > 0) {
    console.log('\n  Top Issues:');
    for (const issue of allIssues.slice(0, 10)) {
      console.log(`    • ${issue}`);
    }
  }

  // Verdict
  console.log('\n' + '═'.repeat(80));
  if (overallAvg >= 0.95 && failed === 0) {
    console.log('  ✅ VERDICT: EXCELLENT — Production-grade quality');
    console.log('     Ready for ML routing optimization.');
  } else if (overallAvg >= 0.85 && passed >= total * 0.9) {
    console.log('  ✅ VERDICT: GOOD — Minor improvements needed');
    console.log('     Can proceed with ML, but fix issues first.');
  } else if (overallAvg >= 0.70) {
    console.log('  ⚠️  VERDICT: ACCEPTABLE — Needs work');
    console.log('     Fix failing cases before ML.');
  } else {
    console.log('  ❌ VERDICT: FAIL — Significant quality issues');
    console.log('     Do NOT add ML. Fix deterministically first.');
  }
  console.log('═'.repeat(80) + '\n');

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total,
      passed,
      failed,
      overallAvg: Math.round(overallAvg * 100) / 100,
      passRate: Math.round((passed / total) * 100),
    },
    dimensionAverages: Object.fromEntries(
      dimensions.map(d => [d, Math.round(results.reduce((sum, r) => sum + (r.judgeResult.scores as any)[d], 0) / total * 100) / 100])
    ),
    sectionStats,
    results: results.map(r => ({
      id: r.id,
      section: r.section,
      question: r.question,
      answer: r.answer.substring(0, 500),
      responseTime: r.responseTime,
      pass: r.judgeResult.pass,
      score: r.judgeResult.overallScore,
      verdict: r.judgeResult.verdict,
      scores: r.judgeResult.scores,
      issues: r.judgeResult.issues,
    })),
  };

  const reportPath = './quality-judge-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📊 Detailed report saved to: ${reportPath}`);

  process.exit(overallAvg >= 0.70 && passed >= total * 0.9 ? 0 : 1);
}

runTests().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
