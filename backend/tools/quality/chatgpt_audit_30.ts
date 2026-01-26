/**
 * ChatGPT-Style & Format Audit - 30 Query Suite
 * Runs all queries in one conversation, grades each response
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CONVERSATION_ID = `chatgpt-audit-${Date.now()}`;

interface AuditQuery {
  id: number;
  section: string;
  query: string;
  expect: string;
  checks: {
    buttonOnly?: boolean;
    exactBullets?: number;
    exactSentences?: number;
    requireTable?: boolean;
    requireSourcePills?: boolean;
    requireFileList?: boolean;
    shortAnswer?: boolean;
    noText?: boolean;
  };
}

const AUDIT_QUERIES: AuditQuery[] = [
  // Section 1 — Inventory & listing style
  { id: 1, section: "Inventory", query: "How many files do I have total?", expect: "1 short sentence, no list", checks: { shortAnswer: true } },
  { id: 2, section: "Inventory", query: "List my files.", expect: "file_list attachment (top 10 + See all)", checks: { requireFileList: true } },
  { id: 3, section: "Inventory", query: "Show only PDFs.", expect: "file_list attachment filtered to PDF", checks: { requireFileList: true } },
  { id: 4, section: "Inventory", query: "Show only spreadsheets.", expect: "file_list attachment filtered to spreadsheets", checks: { requireFileList: true } },
  { id: 5, section: "Inventory", query: "Show only presentations.", expect: "file_list attachment filtered to PPTX", checks: { requireFileList: true } },
  { id: 6, section: "Inventory", query: "Which is my newest PDF? (button only)", expect: "button-only source_buttons, no text", checks: { buttonOnly: true, noText: true } },

  // Section 2 — File actions button-only
  { id: 7, section: "FileActions", query: "Open 'Lone Mountain Ranch P&L 2024.xlsx'. (button only)", expect: "button-only", checks: { buttonOnly: true, noText: true } },
  { id: 8, section: "FileActions", query: "Where is it located? (button only)", expect: "button-only (same file)", checks: { buttonOnly: true, noText: true } },
  { id: 9, section: "FileActions", query: "Show it again. (button only)", expect: "button-only", checks: { buttonOnly: true, noText: true } },
  { id: 10, section: "FileActions", query: "Open 'Rosewood Fund v3.xlsx'. (button only)", expect: "fuzzy match button-only OR disambiguation", checks: { buttonOnly: true } },

  // Section 3 — PPTX summary
  { id: 11, section: "PPTX", query: "Summarize the Project Management Presentation in exactly 5 bullets.", expect: "exactly 5 bullets, source pills", checks: { exactBullets: 5, requireSourcePills: true } },
  { id: 12, section: "PPTX", query: "Which slide mentions stakeholders?", expect: "slide number, 1 sentence, source pill", checks: { shortAnswer: true, requireSourcePills: true } },
  { id: 13, section: "PPTX", query: "List the stakeholders in exactly 5 bullets.", expect: "exactly 5 bullets, source pills", checks: { exactBullets: 5, requireSourcePills: true } },
  { id: 14, section: "PPTX", query: "What methodology is described? (2 bullets)", expect: "exactly 2 bullets", checks: { exactBullets: 2, requireSourcePills: true } },

  // Section 4 — PDF definitions
  { id: 15, section: "PDF", query: "Define 'intangibility' in exactly 2 sentences.", expect: "exactly 2 sentences, source pills", checks: { exactSentences: 2, requireSourcePills: true } },
  { id: 16, section: "PDF", query: "List exactly 3 negative examples from the marketing PDF.", expect: "exactly 3 bullets", checks: { exactBullets: 3, requireSourcePills: true } },
  { id: 17, section: "PDF", query: "Does the PDF mention 'inseparability' explicitly? Answer yes/no and cite.", expect: "yes/no only + source pill", checks: { shortAnswer: true, requireSourcePills: true } },

  // Section 5 — Excel content-location
  { id: 18, section: "Excel", query: "Which tab contains 'EBITDA Details'?", expect: "tab name, 1 sentence, source pill", checks: { shortAnswer: true, requireSourcePills: true } },
  { id: 19, section: "Excel", query: "What was EBITDA in July 2024? (1 line)", expect: "single line value", checks: { shortAnswer: true, requireSourcePills: true } },
  { id: 20, section: "Excel", query: "Which month had the highest and lowest EBITDA in 2024? Put it in a table.", expect: "valid table, source pill", checks: { requireTable: true, requireSourcePills: true } },
  { id: 21, section: "Excel", query: "Was July an outlier? Explain in exactly 2 sentences.", expect: "exactly 2 sentences", checks: { exactSentences: 2, requireSourcePills: true } },

  // Section 6 — Compare tables
  { id: 22, section: "Compare", query: "Compare Q1 vs Q2 EBITDA in a two-column table.", expect: "valid table", checks: { requireTable: true, requireSourcePills: true } },
  { id: 23, section: "Compare", query: "Compare revenue and expenses in a two-column table.", expect: "two-column table", checks: { requireTable: true, requireSourcePills: true } },

  // Section 7 — Locator
  { id: 24, section: "Locator", query: "Find all mentions of 'deadline' in my documents.", expect: "top results + see-all if many", checks: { requireSourcePills: true } },
  { id: 25, section: "Locator", query: "Where does it mention 'compliance requirements'?", expect: "location(s) or not found", checks: { requireSourcePills: true } },

  // Section 8 — Help/clarify
  { id: 26, section: "Help", query: "How do I open a document in Koda?", expect: "short answer + 3-5 bullets", checks: {} },
  { id: 27, section: "Help", query: "Open 'Project Management Presentation'.", expect: "disambiguation or button", checks: {} },
  { id: 28, section: "Help", query: "Open the second one.", expect: "button-only open", checks: { buttonOnly: true } },

  // Section 9 — Tone
  { id: 29, section: "Tone", query: "Explain what this deck is trying to prove, chat style.", expect: "conversational, short, grounded", checks: { requireSourcePills: true } },

  // Section 10 — Gate
  { id: 30, section: "Gate", query: "Summarize the integration guide in exactly 3 sentences.", expect: "exactly 3 sentences, no artifacts", checks: { exactSentences: 3, requireSourcePills: true } },
];

interface QueryResult {
  id: number;
  query: string;
  section: string;
  fullAnswer: string;
  intent: string;
  sourceButtons: any;
  fileList: any;
  hardFails: string[];
  score: number;
  maxScore: number;
  passed: boolean;
  details: string[];
}

async function runQuery(query: string): Promise<any> {
  const url = `${BASE_URL}/api/rag/query/stream`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      userId: 'test-user-001',
      conversationId: CONVERSATION_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const text = await response.text();
  const lines = text.split('\n').filter(l => l.startsWith('data: '));

  let fullAnswer = '';
  let intent = '';
  let sourceButtons: any = null;
  let fileList: any = null;

  for (const line of lines) {
    try {
      const data = JSON.parse(line.replace('data: ', ''));
      if (data.type === 'chunk' && data.content) {
        fullAnswer += data.content;
      }
      if (data.type === 'intent') {
        intent = data.intent;
      }
      if (data.type === 'done') {
        if (data.sourceButtons) sourceButtons = data.sourceButtons;
        if (data.fileList) fileList = data.fileList;
        if (data.fullAnswer) fullAnswer = data.fullAnswer;
      }
    } catch (e) {}
  }

  return { fullAnswer, intent, sourceButtons, fileList };
}

function countBullets(text: string): number {
  const bulletPatterns = [
    /^[-•*]\s+/gm,
    /^\d+\.\s+/gm,
  ];
  let count = 0;
  for (const pattern of bulletPatterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function countSentences(text: string): number {
  // Remove bullet markers first
  const clean = text.replace(/^[-•*]\s+/gm, '').replace(/^\d+\.\s+/gm, '');
  // Count sentence-ending punctuation
  const matches = clean.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}

function hasTable(text: string): boolean {
  // Check for markdown table pattern
  return /\|.+\|/.test(text) && /\|[-:]+\|/.test(text);
}

function gradeResponse(auditQuery: AuditQuery, result: any): QueryResult {
  const hardFails: string[] = [];
  const details: string[] = [];
  let score = 0;
  const maxScore = 10;

  const { fullAnswer, intent, sourceButtons, fileList } = result;
  const checks = auditQuery.checks;

  // === HARD FAIL CHECKS ===

  // 1. Truncation
  if (fullAnswer.endsWith('...') || fullAnswer.endsWith('..')) {
    hardFails.push('TRUNCATION: ends with ...');
  }
  if (/\d+\.\s*$/.test(fullAnswer.trim())) {
    hardFails.push('TRUNCATION: dangling list marker');
  }

  // 2. Mixed list markers
  const hasBullets = /^[-•*]\s+/m.test(fullAnswer);
  const hasNumbers = /^\d+\.\s+/m.test(fullAnswer);
  if (hasBullets && hasNumbers) {
    hardFails.push('BROKEN STRUCTURE: mixed list markers');
  }

  // 3. Table validation
  if (checks.requireTable && !hasTable(fullAnswer)) {
    hardFails.push('BROKEN STRUCTURE: no valid table when requested');
  }

  // 4. Button-only check
  if (checks.buttonOnly || checks.noText) {
    if (fullAnswer.trim().length > 50 && !sourceButtons) {
      hardFails.push('UI CONTRACT: file action has narrative text instead of button-only');
    }
  }

  // 5. Template leakage
  if (/Step\s+\d+[:/]/i.test(fullAnswer) && !/steps?/i.test(auditQuery.query)) {
    hardFails.push('TEMPLATE LEAKAGE: Step 1/Step 2 scaffolding');
  }
  if (/Note:\s+Only\s+\d+/i.test(fullAnswer)) {
    hardFails.push('TEMPLATE LEAKAGE: "Note: Only X items"');
  }
  if (/^I'm Koda/i.test(fullAnswer) && !/what is koda/i.test(auditQuery.query)) {
    hardFails.push('TEMPLATE LEAKAGE: "I\'m Koda" intro');
  }

  // === SCORING ===

  // 2 pts: correct operator formatting
  if (intent) {
    score += 2;
    details.push(`✓ Intent: ${intent}`);
  } else {
    details.push('✗ No intent detected');
  }

  // 2 pts: adaptive structure
  const isShort = fullAnswer.split(/\s+/).length < 100;
  if (isShort || checks.shortAnswer) {
    score += 2;
    details.push('✓ Adaptive structure (short)');
  } else if (countBullets(fullAnswer) > 0) {
    score += 2;
    details.push('✓ Adaptive structure (bullets)');
  } else {
    score += 1;
    details.push('○ Structure could be more adaptive');
  }

  // 2 pts: constraint compliance
  let constraintPass = true;
  if (checks.exactBullets !== undefined) {
    const bulletCount = countBullets(fullAnswer);
    if (bulletCount === checks.exactBullets) {
      details.push(`✓ Exact bullets: ${bulletCount}/${checks.exactBullets}`);
    } else {
      constraintPass = false;
      details.push(`✗ Bullet count: ${bulletCount}, expected ${checks.exactBullets}`);
    }
  }
  if (checks.exactSentences !== undefined) {
    const sentenceCount = countSentences(fullAnswer);
    if (sentenceCount === checks.exactSentences) {
      details.push(`✓ Exact sentences: ${sentenceCount}/${checks.exactSentences}`);
    } else {
      constraintPass = false;
      details.push(`✗ Sentence count: ${sentenceCount}, expected ${checks.exactSentences}`);
    }
  }
  if (constraintPass) {
    score += 2;
  }

  // 2 pts: UI contract
  let uiPass = true;
  if (checks.requireSourcePills && !sourceButtons) {
    uiPass = false;
    details.push('✗ Missing source pills');
  } else if (checks.requireSourcePills) {
    details.push('✓ Source pills present');
  }
  if (checks.requireFileList && !fileList) {
    uiPass = false;
    details.push('✗ Missing file_list attachment');
  } else if (checks.requireFileList) {
    details.push('✓ File list present');
  }
  if (uiPass) {
    score += 2;
  }

  // 2 pts: style parity
  const noSpam = !/Pontos-chave:|Key points:|Principais|Resumo:/i.test(fullAnswer);
  if (noSpam) {
    score += 2;
    details.push('✓ No template spam');
  } else {
    details.push('✗ Template spam detected');
  }

  return {
    id: auditQuery.id,
    query: auditQuery.query,
    section: auditQuery.section,
    fullAnswer,
    intent,
    sourceButtons,
    fileList,
    hardFails,
    score,
    maxScore,
    passed: hardFails.length === 0 && score >= 8,
    details,
  };
}

async function runAudit() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     ChatGPT-Style & Format Audit - 30 Query Suite            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log(`Base URL: ${BASE_URL}\n`);

  const results: QueryResult[] = [];
  let totalScore = 0;
  let maxTotal = 0;
  let hardFailCount = 0;

  for (const auditQuery of AUDIT_QUERIES) {
    console.log(`\n━━━ Q${auditQuery.id}: ${auditQuery.section} ━━━`);
    console.log(`Query: "${auditQuery.query}"`);
    console.log(`Expect: ${auditQuery.expect}`);

    try {
      const result = await runQuery(auditQuery.query);
      const graded = gradeResponse(auditQuery, result);
      results.push(graded);

      totalScore += graded.score;
      maxTotal += graded.maxScore;

      if (graded.hardFails.length > 0) {
        hardFailCount++;
        console.log(`\n❌ HARD FAIL:`);
        graded.hardFails.forEach(f => console.log(`   - ${f}`));
      }

      console.log(`\nAnswer (${graded.fullAnswer.length} chars): ${graded.fullAnswer.slice(0, 200)}${graded.fullAnswer.length > 200 ? '...' : ''}`);
      console.log(`\nScore: ${graded.score}/${graded.maxScore} ${graded.passed ? '✅ PASS' : '❌ FAIL'}`);
      graded.details.forEach(d => console.log(`  ${d}`));

      // Small delay between queries
      await new Promise(r => setTimeout(r, 500));

    } catch (err: any) {
      console.log(`\n❌ ERROR: ${err.message}`);
      results.push({
        id: auditQuery.id,
        query: auditQuery.query,
        section: auditQuery.section,
        fullAnswer: '',
        intent: '',
        sourceButtons: null,
        fileList: null,
        hardFails: [`ERROR: ${err.message}`],
        score: 0,
        maxScore: 10,
        passed: false,
        details: [],
      });
      hardFailCount++;
    }
  }

  // Final report
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     FINAL AUDIT REPORT                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const passedCount = results.filter(r => r.passed).length;
  const percentage = Math.round((passedCount / results.length) * 100);

  console.log(`Total Score: ${totalScore}/${maxTotal} (${Math.round((totalScore/maxTotal)*100)}%)`);
  console.log(`Queries Passed: ${passedCount}/${results.length} (${percentage}%)`);
  console.log(`Hard Fails: ${hardFailCount}`);

  if (hardFailCount > 0) {
    console.log('\n❌ AUDIT FAILED - Hard fail conditions triggered');
  } else if (passedCount === results.length) {
    console.log('\n✅ AUDIT PASSED - ChatGPT-quality style and formatting achieved!');
  } else {
    console.log('\n⚠️ AUDIT INCOMPLETE - Some queries did not pass');
  }

  // Section breakdown
  console.log('\n━━━ Section Breakdown ━━━');
  const sections = [...new Set(results.map(r => r.section))];
  for (const section of sections) {
    const sectionResults = results.filter(r => r.section === section);
    const sectionPassed = sectionResults.filter(r => r.passed).length;
    const sectionTotal = sectionResults.length;
    const icon = sectionPassed === sectionTotal ? '✅' : '❌';
    console.log(`${icon} ${section}: ${sectionPassed}/${sectionTotal}`);
  }

  // Save detailed results
  const outputPath = path.join(__dirname, `../../audit_output_mass/chatgpt_audit_${Date.now()}`);
  fs.mkdirSync(outputPath, { recursive: true });
  fs.writeFileSync(path.join(outputPath, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to: ${outputPath}/results.json`);

  // Return summary for caller
  return {
    totalScore,
    maxTotal,
    passedCount,
    totalQueries: results.length,
    hardFailCount,
    passed: hardFailCount === 0 && passedCount === results.length,
  };
}

runAudit().catch(console.error);
