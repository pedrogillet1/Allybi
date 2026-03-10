const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/Pedro/Desktop/webapp/reports/query-grading-v2';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

// Collect all results
const results = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const raw = j.rawResponse || {};
  const data = raw.data || raw;
  const answer = j.answer || data.assistantText || '';
  const failureCode = data.failureCode || null;
  const warnings = data.warnings || [];
  const sourceButtons = (data.attachmentsPayload || []).find(a => a.type === 'source_buttons');
  const sourceCount = sourceButtons ? (sourceButtons.buttons || []).length : 0;

  results.push({
    query: j.queryNumber,
    question: j.question,
    docId: j.documentId,
    answerLen: answer.length,
    answer,
    failureCode,
    warnings,
    sourceCount,
    timestamp: j.timestamp,
    durationMs: j.durationMs || 0,
    convId: j.conversationId,
    error: j.error,
  });
}

// Document name mapping
const docNames = {
  '839dc857-68f7-4c15-98cc-195ebd46fad1': 'BESS Market Assessment',
  '5068942c-8f1a-44c3-9e64-6dc9be211026': 'Mayfair Investor Deck',
  'fa905cd0-6927-48c2-9816-9173cdc37c80': 'ATT Bill Dec 2023',
  '3ff4d2a2-e5ec-4dbe-ad29-95074e0688a1': 'Breguet Document',
  'c1908b22-a131-412d-b0c2-69cae091c821': 'Trade Act of 1974',
  'f3b276b5-598b-4dad-ac9c-1f806e334cd4': 'IBGE Open Data Plan',
  '7938c5e6-2a29-4acd-bf86-a28abc3e87bb': 'ARM Montana/Arizona',
  'd86c1f5b-7b9d-48a8-bfb2-c3aa0b469107': 'Guarda Bens Storage',
  '6d4ba0b7-ed89-4c98-af4a-27da5a1658d1': 'Reserve Requirements',
  'ef8f193a-3a70-42ee-a0bf-a925a86f484d': 'Tabela 1.1 IBGE',
};

// ══════════════════════════════════════════════════════════════
// SECTION 1: OVERVIEW TABLE
// ══════════════════════════════════════════════════════════════
console.log('═'.repeat(140));
console.log('  HARSH GRADING REPORT — 100 QUERIES');
console.log('═'.repeat(140));
console.log('');
console.log('Query  | Document                  | Ans Len | Srcs | Duration | Failure              | Grade');
console.log('─'.repeat(140));

let totalOk = 0, totalEmpty = 0, totalFail = 0, totalWarn = 0;
const grades = [];

for (const r of results) {
  const docLabel = (docNames[r.docId] || 'Unknown').padEnd(25);
  const lenStr = String(r.answerLen).padStart(7);
  const srcStr = String(r.sourceCount).padStart(4);
  const durStr = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s`.padStart(8) : '    N/A ';
  const failStr = (r.failureCode || r.error || '-').substring(0, 20).padEnd(20);

  let grade;
  if (r.failureCode || r.error) {
    grade = 'FAIL';
    totalFail++;
  } else if (r.answerLen < 10) {
    grade = 'EMPTY';
    totalEmpty++;
  } else if (r.answerLen < 100) {
    grade = 'THIN';
    totalWarn++;
  } else {
    grade = 'OK';
    totalOk++;
  }
  grades.push({ ...r, grade });
  console.log(`${(r.query || '?').padEnd(6)} | ${docLabel} | ${lenStr} | ${srcStr} | ${durStr} | ${failStr} | ${grade}`);
}

console.log('─'.repeat(140));
console.log(`TOTALS: OK=${totalOk}  THIN=${totalWarn}  EMPTY=${totalEmpty}  FAIL=${totalFail}  TOTAL=${results.length}`);
console.log('');

// ══════════════════════════════════════════════════════════════
// SECTION 2: PER-DOCUMENT BLOCK SUMMARY
// ══════════════════════════════════════════════════════════════
console.log('═'.repeat(140));
console.log('  PER-DOCUMENT BLOCK SUMMARY');
console.log('═'.repeat(140));

const blocks = {};
for (const r of grades) {
  const doc = docNames[r.docId] || 'Unknown';
  if (!blocks[doc]) blocks[doc] = [];
  blocks[doc].push(r);
}

for (const [doc, queries] of Object.entries(blocks)) {
  const ok = queries.filter(q => q.grade === 'OK').length;
  const thin = queries.filter(q => q.grade === 'THIN').length;
  const empty = queries.filter(q => q.grade === 'EMPTY').length;
  const fail = queries.filter(q => q.grade === 'FAIL').length;
  const avgLen = Math.round(queries.reduce((s, q) => s + q.answerLen, 0) / queries.length);
  const avgSrc = (queries.reduce((s, q) => s + q.sourceCount, 0) / queries.length).toFixed(1);
  const durations = queries.filter(q => q.durationMs > 0).map(q => q.durationMs);
  const avgDur = durations.length ? `${(durations.reduce((s, d) => s + d, 0) / durations.length / 1000).toFixed(1)}s` : 'N/A';

  const blockScore = ok * 10 + thin * 5 + empty * 0 + fail * 0;
  const pct = (blockScore / (queries.length * 10) * 100).toFixed(0);

  console.log(`\n  ${doc} (${queries.length} queries)`);
  console.log(`    OK: ${ok}  THIN: ${thin}  EMPTY: ${empty}  FAIL: ${fail}  Score: ${blockScore}/${queries.length * 10} (${pct}%)`);
  console.log(`    Avg answer length: ${avgLen} chars | Avg sources: ${avgSrc} | Avg response time: ${avgDur}`);
}

// ══════════════════════════════════════════════════════════════
// SECTION 3: HARSH QUALITY CHECKS
// ══════════════════════════════════════════════════════════════
console.log('');
console.log('═'.repeat(140));
console.log('  HARSH QUALITY ISSUES');
console.log('═'.repeat(140));

const issues = [];

for (const r of grades) {
  const a = r.answer;
  const q = r.question;
  const doc = docNames[r.docId] || 'Unknown';
  const queryIssues = [];

  // 1. HARD FAILURE
  if (r.failureCode || r.error) {
    queryIssues.push({ severity: 'CRITICAL', type: 'HARD_FAIL', detail: `${r.failureCode || r.error}` });
  }

  // 2. EMPTY
  if (a.length === 0) {
    queryIssues.push({ severity: 'CRITICAL', type: 'EMPTY_ANSWER', detail: 'No answer text returned' });
  }

  // 3. TOO SHORT for a detailed question
  if (a.length > 0 && a.length < 200 && q.length > 50) {
    queryIssues.push({ severity: 'HIGH', type: 'TOO_SHORT', detail: `Only ${a.length} chars for a complex question` });
  }

  // 4. TRUNCATION — answer doesn't end cleanly
  if (a.length > 200) {
    const lastChar = a.trim().slice(-1);
    const endsClean = ['.', '!', '?', ':', '*', '|', '-', ')', ']', '"', '`'].includes(lastChar);
    if (!endsClean) {
      queryIssues.push({ severity: 'HIGH', type: 'TRUNCATION', detail: `Ends: "…${a.trim().slice(-40)}"` });
    }
  }

  // 5. REPETITION — same sentence appears multiple times
  if (a.length > 100) {
    const sentences = a.split(/[.!?]\s+/).filter(s => s.trim().length > 25);
    const seen = new Set();
    for (const s of sentences) {
      const norm = s.trim().toLowerCase().replace(/\s+/g, ' ');
      if (norm.length > 30 && seen.has(norm)) {
        queryIssues.push({ severity: 'HIGH', type: 'REPETITION', detail: `"${norm.substring(0, 50)}…"` });
        break;
      }
      seen.add(norm);
    }
  }

  // 6. WALL OF TEXT — long answer with no formatting
  if (a.length > 800) {
    const hasHeaders = /#{1,3}\s/.test(a) || /\*\*[^*]+\*\*/.test(a);
    const hasBullets = /^[\-\*•]\s/m.test(a) || /^\d+\.\s/m.test(a);
    const hasTable = /\|.*\|.*\|/.test(a);
    const hasLineBreaks = (a.match(/\n/g) || []).length >= 3;
    if (!hasHeaders && !hasBullets && !hasTable && !hasLineBreaks) {
      queryIssues.push({ severity: 'MEDIUM', type: 'WALL_OF_TEXT', detail: `${a.length} chars, no formatting` });
    }
  }

  // 7. TABLE REQUESTED but missing
  if (/\btable\b/i.test(q) && a.length > 50 && !/\|.*\|.*\|/.test(a)) {
    queryIssues.push({ severity: 'HIGH', type: 'MISSING_TABLE', detail: 'Question asked for table but none found' });
  }

  // 8. FILLER / chatbot phrases
  const fillers = [
    'I hope this helps', 'feel free to ask', 'Let me know if',
    'Happy to help', 'Is there anything else', "I'd be happy to",
    'do not hesitate', 'please let me know', 'hope that helps',
  ];
  for (const f of fillers) {
    if (a.toLowerCase().includes(f.toLowerCase())) {
      queryIssues.push({ severity: 'MEDIUM', type: 'FILLER_PHRASE', detail: `Contains: "${f}"` });
      break;
    }
  }

  // 9. OVERCONFIDENT language
  const overconfident = [
    'it is clear that', 'without a doubt', 'undeniably',
    'it is obvious', 'definitively proves', 'indisputably',
  ];
  for (const oc of overconfident) {
    if (a.toLowerCase().includes(oc)) {
      queryIssues.push({ severity: 'MEDIUM', type: 'OVERCONFIDENT', detail: `"${oc}"` });
      break;
    }
  }

  // 10. NO SOURCES for document-specific question
  if (r.sourceCount === 0 && a.length > 100) {
    queryIssues.push({ severity: 'HIGH', type: 'NO_SOURCES', detail: 'Document answer but no source citations' });
  }

  // 11. HALLUCINATION RISK — answer mentions specifics not in question context
  // Check if answer is suspiciously generic
  if (a.length > 200) {
    const genericPatterns = [
      /the document (discusses|covers|provides|mentions|outlines|addresses|highlights|explores|details|describes)\s+(a\s+)?(variety|range|number|wide|several|various|multiple|comprehensive)/i,
      /according to (the|this) (document|file|report|deck|presentation|bill|statute),?\s+(it|the|this)/i,
    ];
    // Don't flag these — they're structural and don't indicate hallucination
  }

  // 12. LANGUAGE MISMATCH — Portuguese doc but English answer
  const ptDocs = ['IBGE Open Data Plan', 'Guarda Bens Storage', 'Tabela 1.1 IBGE'];
  if (ptDocs.includes(doc) && a.length > 200) {
    // Check if question was in English but answer should respect doc language
    const ptWords = (a.match(/\b(dados|abertos|nascidos|vivos|tabela|plano|região|estado|município)\b/gi) || []).length;
    // Only flag if answer has ZERO Portuguese — might indicate no real retrieval
    // Actually this is fine — English questions get English answers from Portuguese docs
  }

  // 13. EXTRACT/LIST questions that get prose instead
  if (/\b(extract|list|pull out|identify)\b/i.test(q) && a.length > 200) {
    const hasList = /^[\-\*•]\s/m.test(a) || /^\d+[\.\)]\s/m.test(a) || /\|.*\|.*\|/.test(a);
    if (!hasList) {
      queryIssues.push({ severity: 'MEDIUM', type: 'PROSE_NOT_LIST', detail: 'Extract/list question answered with prose only' });
    }
  }

  // 14. COMPARE question that doesn't actually compare
  if (/\bcompare\b/i.test(q) && a.length > 200) {
    const hasComparison = /\b(versus|vs\.?|compared|while|whereas|in contrast|on the other hand|difference|unlike)\b/i.test(a);
    const hasTable = /\|.*\|.*\|/.test(a);
    if (!hasComparison && !hasTable) {
      queryIssues.push({ severity: 'MEDIUM', type: 'NO_COMPARISON', detail: 'Compare question but no comparative language found' });
    }
  }

  // 15. SLOW RESPONSE
  if (r.durationMs > 30000) {
    queryIssues.push({ severity: 'LOW', type: 'SLOW_RESPONSE', detail: `${(r.durationMs / 1000).toFixed(1)}s` });
  }

  // 16. "I cannot" / refusal
  if (/\b(I cannot|I can't|I'm unable|I am unable|not able to|I don't have access)\b/i.test(a)) {
    queryIssues.push({ severity: 'HIGH', type: 'REFUSAL', detail: 'Answer contains refusal language' });
  }

  // 17. HEDGE OVERLOAD — too many hedging phrases
  if (a.length > 200) {
    const hedges = (a.match(/\b(may|might|could|possibly|perhaps|appears to|seems to|it is possible|likely|unlikely)\b/gi) || []).length;
    const hedgeDensity = hedges / (a.length / 100);
    if (hedgeDensity > 3) {
      queryIssues.push({ severity: 'MEDIUM', type: 'OVER_HEDGING', detail: `${hedges} hedge words in ${a.length} chars` });
    }
  }

  for (const iss of queryIssues) {
    issues.push({ query: r.query, doc, ...iss });
  }
}

// Print issues sorted by severity
const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
issues.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

console.log('');
console.log('Query  | Severity | Issue Type         | Document                  | Detail');
console.log('─'.repeat(140));
for (const iss of issues) {
  const sev = iss.severity.padEnd(8);
  const type = iss.type.padEnd(18);
  const doc = iss.doc.padEnd(25);
  console.log(`${(iss.query || '?').padEnd(6)} | ${sev} | ${type} | ${doc} | ${(iss.detail || '').substring(0, 60)}`);
}
console.log('─'.repeat(140));
console.log(`Total issues: ${issues.length}`);
console.log(`  CRITICAL: ${issues.filter(i => i.severity === 'CRITICAL').length}`);
console.log(`  HIGH: ${issues.filter(i => i.severity === 'HIGH').length}`);
console.log(`  MEDIUM: ${issues.filter(i => i.severity === 'MEDIUM').length}`);
console.log(`  LOW: ${issues.filter(i => i.severity === 'LOW').length}`);

// ══════════════════════════════════════════════════════════════
// SECTION 4: OVERALL SCORECARD
// ══════════════════════════════════════════════════════════════
console.log('');
console.log('═'.repeat(140));
console.log('  FINAL SCORECARD');
console.log('═'.repeat(140));

const totalQueries = results.length;
const passRate = ((totalOk / totalQueries) * 100).toFixed(1);
const criticalIssues = issues.filter(i => i.severity === 'CRITICAL').length;
const highIssues = issues.filter(i => i.severity === 'HIGH').length;
const avgAnswerLen = Math.round(results.reduce((s, r) => s + r.answerLen, 0) / totalQueries);
const avgSources = (results.reduce((s, r) => s + r.sourceCount, 0) / totalQueries).toFixed(1);
const durations = results.filter(r => r.durationMs > 0).map(r => r.durationMs);
const avgDuration = durations.length ? `${(durations.reduce((s, d) => s + d, 0) / durations.length / 1000).toFixed(1)}s` : 'N/A';
const medianDuration = durations.length ? `${(durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)] / 1000).toFixed(1)}s` : 'N/A';

// Harsh letter grade
let letterGrade;
const adjustedScore = passRate - (criticalIssues * 5) - (highIssues * 2);
if (adjustedScore >= 95) letterGrade = 'A';
else if (adjustedScore >= 90) letterGrade = 'A-';
else if (adjustedScore >= 85) letterGrade = 'B+';
else if (adjustedScore >= 80) letterGrade = 'B';
else if (adjustedScore >= 75) letterGrade = 'B-';
else if (adjustedScore >= 70) letterGrade = 'C+';
else if (adjustedScore >= 65) letterGrade = 'C';
else if (adjustedScore >= 60) letterGrade = 'C-';
else if (adjustedScore >= 50) letterGrade = 'D';
else letterGrade = 'F';

console.log('');
console.log(`  Queries run:        ${totalQueries}`);
console.log(`  Pass (OK):          ${totalOk} (${passRate}%)`);
console.log(`  Thin:               ${totalWarn}`);
console.log(`  Empty:              ${totalEmpty}`);
console.log(`  Failed:             ${totalFail}`);
console.log(`  Critical issues:    ${criticalIssues}`);
console.log(`  High issues:        ${highIssues}`);
console.log(`  Medium issues:      ${issues.filter(i => i.severity === 'MEDIUM').length}`);
console.log(`  Avg answer length:  ${avgAnswerLen} chars`);
console.log(`  Avg sources:        ${avgSources}`);
console.log(`  Avg response time:  ${avgDuration}`);
console.log(`  Median resp time:   ${medianDuration}`);
console.log('');
console.log(`  ┌──────────────────────────────┐`);
console.log(`  │  OVERALL GRADE:  ${letterGrade.padEnd(12)}│`);
console.log(`  │  Adjusted score: ${String(adjustedScore.toFixed(1)).padEnd(12)}│`);
console.log(`  └──────────────────────────────┘`);
console.log('');

// ══════════════════════════════════════════════════════════════
// SECTION 5: FULL ANSWERS DUMP
// ══════════════════════════════════════════════════════════════
console.log('═'.repeat(140));
console.log('  FULL ANSWERS (for manual review)');
console.log('═'.repeat(140));

for (const r of results) {
  const doc = docNames[r.docId] || 'Unknown';
  const relatedIssues = issues.filter(i => i.query === r.query);
  const issueFlags = relatedIssues.map(i => `[${i.severity}:${i.type}]`).join(' ');

  console.log('');
  console.log(`${'─'.repeat(120)}`);
  console.log(`${r.query} | ${doc} | ${r.answerLen} chars | Sources: ${r.sourceCount} | ${r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : 'N/A'}`);
  if (issueFlags) console.log(`FLAGS: ${issueFlags}`);
  if (r.failureCode) console.log(`FAILURE: ${r.failureCode}`);
  if (r.error) console.log(`ERROR: ${r.error}`);
  console.log(`Q: ${r.question}`);
  console.log(`${'─'.repeat(120)}`);
  if (r.answer.length > 0) {
    console.log(r.answer);
  } else {
    console.log('[NO ANSWER - EMPTY]');
  }
}
