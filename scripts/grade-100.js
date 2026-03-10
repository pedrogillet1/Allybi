const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/Pedro/Desktop/webapp/reports/query-grading';
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
  const sources = data.sources || (data.attachmentsPayload || []).filter(a => a.type === 'source_buttons');
  const sourceButtons = (data.attachmentsPayload || []).find(a => a.type === 'source_buttons');
  const sourceCount = sourceButtons ? (sourceButtons.buttons || []).length : 0;

  results.push({
    query: j.queryNumber,
    question: j.question,
    docId: j.documentId,
    answerLen: answer.length,
    answer: answer,
    failureCode,
    warnings,
    sourceCount,
    timestamp: j.timestamp,
    convId: j.conversationId,
  });
}

// Document name mapping
const docNames = {
  '839dc857-68f7-4c15-98cc-195ebd46fad1': 'BESS Market Assessment',
  '6031a27f-3d47-491e-903c-a1c5884c9eab': 'OBA Marketing Services',
  'd86c1f5b-7b9d-48a8-bfb2-c3aa0b469107': 'Guarda Bens Self Storage',
  'a2d513cf-b57c-44f7-9453-362566c4edd4': 'Trabalho Projeto',
  '902a5302-c496-400e-9ae4-c1647ea3e152': 'TRABALHO FINAL Image',
  'fa905cd0-6927-48c2-9816-9173cdc37c80': 'ATT Bill Dec 2023',
  '1c4d515b-5d13-4a64-9c69-06d70b4e7528': 'Certidao Nascimento',
  'bf3d7e46-7ec0-4cc6-9d8d-6220a6c0fd57': 'SEVIS RTI',
  '333f7db0-78dc-48cd-b2cb-e92cc7b6a3fa': 'Move Out Statement',
  '5068942c-8f1a-44c3-9e64-6dc9be211026': 'Mayfair Investor Deck',
};

// ── OVERVIEW TABLE ──
console.log('='.repeat(120));
console.log('QUERY RESULTS OVERVIEW');
console.log('='.repeat(120));
console.log('Query | Document                  | Ans Len | Sources | Failure Code             | Status');
console.log('-'.repeat(120));

let totalOk = 0, totalEmpty = 0, totalFail = 0;
for (const r of results) {
  const docLabel = (docNames[r.docId] || 'Unknown').padEnd(25);
  const lenStr = String(r.answerLen).padStart(7);
  const srcStr = String(r.sourceCount).padStart(7);
  const failStr = (r.failureCode || '-').padEnd(25);
  let status;
  if (r.failureCode) { status = 'FAIL'; totalFail++; }
  else if (r.answerLen < 10) { status = 'EMPTY'; totalEmpty++; }
  else { status = 'OK'; totalOk++; }
  console.log(`${r.query} | ${docLabel} | ${lenStr} | ${srcStr} | ${failStr} | ${status}`);
}

console.log('-'.repeat(120));
console.log(`TOTALS: OK=${totalOk}  EMPTY=${totalEmpty}  FAIL=${totalFail}  TOTAL=${results.length}`);
console.log('');

// ── SPEED ANALYSIS ──
console.log('='.repeat(120));
console.log('SPEED ANALYSIS (per document block)');
console.log('='.repeat(120));

const blocks = {};
for (const r of results) {
  const doc = docNames[r.docId] || 'Unknown';
  if (!blocks[doc]) blocks[doc] = [];
  blocks[doc].push(r);
}

for (const [doc, queries] of Object.entries(blocks)) {
  const timestamps = queries.map(q => new Date(q.timestamp).getTime()).sort((a,b) => a-b);
  if (timestamps.length >= 2) {
    const totalMs = timestamps[timestamps.length - 1] - timestamps[0];
    const avgMs = totalMs / (timestamps.length - 1);
    console.log(`${doc}: ${queries.length} queries, total=${(totalMs/1000).toFixed(1)}s, avg=${(avgMs/1000).toFixed(1)}s/query`);
  }
}

// ── DETAILED ANSWER INSPECTION ──
console.log('');
console.log('='.repeat(120));
console.log('DETAILED ANSWER INSPECTION (checking for issues)');
console.log('='.repeat(120));

const issues = [];

for (const r of results) {
  const a = r.answer;
  const q = r.question;
  const doc = docNames[r.docId] || 'Unknown';
  const queryIssues = [];

  // 1. EMPTY / FAILURE
  if (r.failureCode) {
    queryIssues.push({ type: 'HARD_FAIL', detail: `failureCode: ${r.failureCode}` });
  }
  if (a.length === 0) {
    queryIssues.push({ type: 'EMPTY_ANSWER', detail: 'No answer text returned' });
  }

  // 2. TRUNCATION check
  if (a.length > 0) {
    const lastChar = a.trim().slice(-1);
    const endsClean = ['.', '!', '?', ':', '*', '|', '-', ')'].includes(lastChar);
    if (!endsClean && a.length > 200) {
      queryIssues.push({ type: 'POSSIBLE_TRUNCATION', detail: `Ends with: "${a.trim().slice(-30)}"` });
    }
  }

  // 3. REPETITION check (sentences repeating)
  if (a.length > 100) {
    const sentences = a.split(/[.!?]\s+/).filter(s => s.trim().length > 20);
    const seen = new Set();
    for (const s of sentences) {
      const norm = s.trim().toLowerCase().replace(/\s+/g, ' ');
      if (norm.length > 30 && seen.has(norm)) {
        queryIssues.push({ type: 'REPETITION', detail: `Repeated: "${norm.substring(0, 60)}..."` });
        break;
      }
      seen.add(norm);
    }
  }

  // 4. WALL_OF_TEXT check (no formatting for long answers)
  if (a.length > 800) {
    const hasHeaders = /#{1,3}\s/.test(a) || /\*\*[^*]+\*\*/.test(a);
    const hasBullets = /^[\-\*•]\s/m.test(a) || /^\d+\.\s/m.test(a);
    const hasTable = /\|.*\|.*\|/.test(a);
    const hasLineBreaks = (a.match(/\n/g) || []).length >= 3;
    if (!hasHeaders && !hasBullets && !hasTable && !hasLineBreaks) {
      queryIssues.push({ type: 'WALL_OF_TEXT', detail: `${a.length} chars with no formatting` });
    }
  }

  // 5. TABLE REQUESTED but not provided
  if (q.toLowerCase().includes('table') || q.toLowerCase().includes('table:')) {
    const hasTable = /\|.*\|.*\|/.test(a);
    if (a.length > 50 && !hasTable) {
      queryIssues.push({ type: 'MISSING_TABLE', detail: 'Question asked for table but none found in answer' });
    }
  }

  // 6. GENERIC / FILLER phrases
  if (a.length > 0) {
    const fillers = [
      'I hope this helps',
      'feel free to ask',
      'Let me know if',
      'Happy to help',
      'Is there anything else',
      'I\'d be happy to',
    ];
    for (const f of fillers) {
      if (a.toLowerCase().includes(f.toLowerCase())) {
        queryIssues.push({ type: 'FILLER_PHRASE', detail: `Contains: "${f}"` });
        break;
      }
    }
  }

  // 7. CONFIDENCE ISSUES - stating things too certainly
  if (a.length > 0) {
    const overconfident = [
      'it is clear that',
      'without a doubt',
      'certainly',
      'undeniably',
      'it is obvious',
      'definitively proves',
    ];
    for (const oc of overconfident) {
      if (a.toLowerCase().includes(oc)) {
        queryIssues.push({ type: 'OVERCONFIDENT', detail: `Contains: "${oc}"` });
        break;
      }
    }
  }

  // 8. SOURCE GROUNDING - no sources for document-specific questions
  if (r.sourceCount === 0 && a.length > 100) {
    queryIssues.push({ type: 'NO_SOURCES', detail: 'Answer provided but no source citations' });
  }

  if (queryIssues.length > 0) {
    for (const iss of queryIssues) {
      issues.push({ query: r.query, doc, ...iss });
    }
  }
}

// Print issues
console.log('');
console.log('Query  | Document                  | Issue Type         | Detail');
console.log('-'.repeat(120));
for (const iss of issues) {
  console.log(`${iss.query.padEnd(6)} | ${iss.doc.padEnd(25)} | ${iss.type.padEnd(18)} | ${iss.detail.substring(0, 60)}`);
}
console.log('-'.repeat(120));
console.log(`Total issues found: ${issues.length}`);

// ── FULL ANSWER DUMP ──
console.log('');
console.log('='.repeat(120));
console.log('FULL ANSWERS (for manual verification)');
console.log('='.repeat(120));

for (const r of results) {
  const doc = docNames[r.docId] || 'Unknown';
  console.log('');
  console.log(`${'─'.repeat(100)}`);
  console.log(`${r.query} | ${doc} | ${r.answerLen} chars | Sources: ${r.sourceCount}`);
  if (r.failureCode) console.log(`FAILURE: ${r.failureCode}`);
  console.log(`Q: ${r.question}`);
  console.log(`${'─'.repeat(100)}`);
  if (r.answer.length > 0) {
    console.log(r.answer);
  } else {
    console.log('[NO ANSWER - EMPTY]');
  }
}
