#!/usr/bin/env node
/**
 * 40-Query Document-Specific Regression Runner
 * Tests RAG quality against 4 specific documents with 10 targeted queries each.
 * Each document group runs in its own conversation with single-doc attachment.
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORTS_DIR, { recursive: true });

function readArgValue(flag) {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

const BASE = String(
  readArgValue('--base') ||
  process.env.E2E_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5000',
).trim().replace(/\/+$/, '');
const LOGIN_EMAIL = String(
  readArgValue('--email') ||
  process.env.E2E_TEST_EMAIL ||
  'test@allybi.com',
).trim();
const LOGIN_PASSWORD = String(
  readArgValue('--password') ||
  process.env.E2E_TEST_PASSWORD ||
  'test123',
).trim();

const isHttps = BASE.startsWith('https://');
const httpsAgent = new https.Agent();
const httpAgent = new http.Agent();

// ── Document-specific query sets ──────────────────────────────────
const DOC_QUERIES = [
  {
    docKeyword: 'ReserveRequirements',
    altKeywords: ['reserve', 'bcb'],
    docLabel: 'BCB Reserve Requirements',
    queries: [
      'What is the current reserve ratio that Brazilian commercial banks must maintain on demand deposits?',
      'How is the computation period for time deposit reserve requirements structured and what is its duration?',
      'What deduction is applied to the reserve base for demand deposits before calculating the required amount?',
      'How does Tier 1 Capital affect the deduction tiers for time deposit reserve requirements?',
      'What interest rate is charged as a deficiency penalty when a bank fails to meet its demand deposit reserve obligation?',
      'Are savings deposit reserves remunerated differently depending on when the deposit was made relative to May 2012?',
      'Which types of financial institutions are subject to savings deposit reserve requirements under BCB rules?',
      'How are real estate credit operations factored into the calculation of savings deposit reserve requirements?',
      'What is the maintenance period for demand deposit reserves and how does it align with the computation period?',
      'How does the Selic rate interact with the remuneration formula for time deposit reserves held at the Central Bank?',
    ],
  },
  {
    docKeyword: 'Trade_Act',
    altKeywords: ['trade', '1974'],
    docLabel: 'Trade Act of 1974',
    queries: [
      'What authority does the President have to modify tariff rates under the Trade Act of 1974?',
      'How does the Trade Adjustment Assistance program help workers displaced by increased imports?',
      'What are the eligibility criteria for a country to receive benefits under the Generalized System of Preferences?',
      'What procedures must the US Trade Representative follow when initiating a Section 301 investigation against unfair trade practices?',
      'How does the Act define and address injury caused to domestic industries by import competition?',
      'What role does the International Trade Commission play in investigating trade agreement violations?',
      'How are trade readjustment allowances calculated for workers who lose their jobs due to import competition?',
      'What limitations does the Act impose on the President\'s ability to decrease existing duty rates through trade agreements?',
      'How does the Jackson-Vanik amendment condition most-favored-nation status on emigration policies of non-market economies?',
      'What provisions does the Act include for addressing trade with countries that are uncooperative in combating narcotics production?',
    ],
  },
  {
    docKeyword: 'br373pt_1',
    altKeywords: ['br373pt', 'portaria'],
    docLabel: 'INPI Fee Schedule',
    queries: [
      'How much does it cost to file a patent application at INPI under the current fee schedule?',
      'What discount percentage can micro and small businesses receive on INPI service fees?',
      'How do patent annuity fees change over the lifetime of an invention patent in Brazil?',
      'What are the fees for filing a trademark registration request at INPI?',
      'Under what conditions can a person with a disability receive a full fee waiver for INPI services?',
      'How much does it cost to file an appeal against a patent denial at INPI?',
      'What new service codes were created for priority processing of trademark applications?',
      'How do utility model annuity fees compare to invention patent annuity fees at INPI?',
      'What fees apply to PCT international phase patent applications filed through INPI?',
      'What is the fee for requesting a certified copy or patentability opinion from INPI?',
    ],
  },
  {
    docKeyword: 'us423en',
    altKeywords: ['cares'],
    docLabel: 'CARES Act',
    queries: [
      'How did the Paycheck Protection Program provide forgivable loans to small businesses during the pandemic?',
      'What were the eligibility requirements and payment amounts for the individual stimulus recovery rebates?',
      'How did the Pandemic Unemployment Assistance program expand coverage to workers not traditionally eligible for unemployment benefits?',
      'What financial relief did the CARES Act provide specifically to the airline industry?',
      'How did the Economic Stabilization Fund authorize Treasury lending to affected businesses and what oversight was established?',
      'What foreclosure moratorium and mortgage forbearance protections did the CARES Act create for homeowners?',
      'How did the CARES Act expand telehealth coverage under Medicare during the COVID-19 emergency?',
      'What role did the Special Inspector General for Pandemic Recovery play in overseeing CARES Act spending?',
      'How did the CARES Act modify the employee retention tax credit to incentivize keeping workers on payroll?',
      'What emergency appropriations did Division B of the CARES Act allocate for coronavirus health response and federal agency operations?',
    ],
  },
];

// Flatten all queries with metadata
const ALL_QUERIES = [];
for (const group of DOC_QUERIES) {
  for (const q of group.queries) {
    ALL_QUERIES.push({ query: q, docLabel: group.docLabel, docKeyword: group.docKeyword });
  }
}

// ── Session state (cookies + CSRF) ───────────────────────────────────
let SESSION = { at: '', rt: '', csrf: '' };

function cookieHeader() {
  const parts = [];
  if (SESSION.at) parts.push(`koda_at=${SESSION.at}`);
  if (SESSION.rt) parts.push(`koda_rt=${SESSION.rt}`);
  if (SESSION.csrf) parts.push(`koda_csrf=${SESSION.csrf}`);
  return parts.join('; ');
}

function captureCookies(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return;
  for (const line of Array.isArray(raw) ? raw : [raw]) {
    const m = line.match(/^(koda_at|koda_rt|koda_csrf)=([^;]+)/);
    if (m) SESSION[m[1].replace('koda_', '')] = m[2];
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────
function postRaw(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const payload = JSON.stringify(body);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'POST',
      agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader(),
        'x-csrf-token': SESSION.csrf,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      captureCookies(res);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function post(urlPath, body) { return postRaw(urlPath, body); }

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'GET',
      agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
      headers: {
        'Cookie': cookieHeader(),
        'x-csrf-token': SESSION.csrf,
      },
    }, (res) => {
      captureCookies(res);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function login(email, password) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/auth/login', BASE);
    const payload = JSON.stringify({ email, password });
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'POST',
      agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      captureCookies(res);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.accessToken) SESSION.at = parsed.accessToken;
          if (parsed.refreshToken) SESSION.rt = parsed.refreshToken;
          resolve(parsed);
        } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function streamChat(body) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/chat/stream', BASE);
    const payload = JSON.stringify(body);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'POST',
      agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader(),
        'x-csrf-token': SESSION.csrf,
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'text/event-stream',
      },
    }, (res) => {
      captureCookies(res);
      const contentType = res.headers['content-type'] || '';
      if (res.statusCode !== 200 || !contentType.includes('text/event-stream')) {
        let errData = '';
        res.on('data', c => errData += c);
        res.on('end', () => {
          let errMsg = `HTTP ${res.statusCode}`;
          try { const j = JSON.parse(errData); errMsg = j.error?.message || j.error || errMsg; } catch {}
          resolve({
            events: [], fullText: '', sources: [], answerMode: null,
            conversationId: null, truncated: false, metadata: {},
            eventCount: 0, error: errMsg,
          });
        });
        return;
      }

      let raw = '';
      const events = [];
      let fullText = '';
      let sources = [];
      let answerMode = null;
      let conversationId = null;
      let truncated = false;
      let metadata = {};

      res.on('data', chunk => {
        raw += chunk.toString();
        const lines = raw.split('\n');
        raw = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6));
              events.push(evt);
              if (evt.type === 'delta' && evt.text) fullText += evt.text;
              if (evt.type === 'sources' && evt.sources) sources = evt.sources;
              if (evt.type === 'meta') answerMode = evt.answerMode || answerMode;
              if (evt.type === 'final') {
                conversationId = evt.conversationId || conversationId;
                if (evt.content) fullText = evt.content;
                else if (evt.assistantText) fullText = evt.assistantText;
                if (evt.sources) sources = evt.sources;
                if (evt.metadata) metadata = evt.metadata;
                answerMode = evt.answerMode || answerMode;
              }
              if (evt.type === 'error') console.error(`  [SSE error] ${evt.message}`);
            } catch {}
          }
        }
      });

      res.on('end', () => {
        if (raw.startsWith('data: ')) {
          try {
            const evt = JSON.parse(raw.slice(6));
            events.push(evt);
            if (evt.type === 'final') {
              conversationId = evt.conversationId || conversationId;
              if (evt.content) fullText = evt.content;
              else if (evt.assistantText) fullText = evt.assistantText;
              if (evt.sources) sources = evt.sources;
              answerMode = evt.answerMode || answerMode;
            }
          } catch {}
        }
        truncated = fullText.includes('[truncated]') ||
                    (fullText.includes('…') && fullText.length > 3000) ||
                    events.some(e => e.truncated === true) ||
                    (metadata && metadata.truncated === true);
        resolve({ events, fullText, sources, answerMode, conversationId, truncated, metadata, eventCount: events.length });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(new Error('Timeout 120s')); });
    req.write(payload);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function describeError(err) {
  if (!err) return 'unknown_error';
  const parts = [];
  if (err.name) parts.push(err.name);
  if (err.code) parts.push(`code=${err.code}`);
  if (err.message) parts.push(err.message);
  return parts.length > 0 ? parts.join(' ; ') : String(err);
}

function extractSourceDocumentId(source) {
  if (!source || typeof source !== 'object') return '';
  const candidates = [source.documentId, source.docId, source.id, source.document?.id];
  for (const value of candidates) {
    const id = String(value || '').trim();
    if (id) return id;
  }
  return '';
}

// ── Grade a single query result ──────────────────────────────────────
function gradeResult(idx, queryMeta, result, options = {}) {
  const { query, docLabel } = queryMeta;
  const allowedDocIds = new Set(
    Array.isArray(options.allowedDocIds)
      ? options.allowedDocIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
  );
  const sourceDocIds = (result.sources || []).map(extractSourceDocumentId).filter(Boolean);
  const outOfScopeDocIds = sourceDocIds.filter(
    (docId) => allowedDocIds.size > 0 && !allowedDocIds.has(docId),
  );

  const issues = [];
  let score = 100;
  const text = result.fullText || '';

  // 1. Basic response check
  if (!text || text.length < 30) {
    issues.push('EMPTY_OR_MINIMAL_RESPONSE');
    score -= 50;
  }

  // 2. Sources check
  const hasSources = result.sources && result.sources.length > 0;
  if (!hasSources) {
    issues.push('NO_SOURCES');
    score -= 40;
  }

  // 3. Out-of-scope source check
  if (outOfScopeDocIds.length > 0) {
    issues.push('OUT_OF_SCOPE_SOURCE');
    score -= 20;
  }

  // 4. Content quality: check for hedge/filler prefixes
  const hedgePrefixes = [
    /^pelos? trechos? /i,
    /^de acordo com os documentos? /i,
    /^com base nos? trechos? /i,
    /^from the retrieved snippets/i,
    /^based on the evidence/i,
    /^according to the documents/i,
    /^based on the available/i,
    /^based on the provided/i,
  ];
  for (const rx of hedgePrefixes) {
    if (rx.test(text.trim())) {
      issues.push('HEDGE_PREFIX_LEAKED');
      score -= 15;
      break;
    }
  }

  // 5. Check for excessive hedging / "not found" language
  const hedgePhrases = [
    /does not (?:contain|include|mention|specify|address)/i,
    /não (?:aparece|traz|consta|contém)/i,
    /no relevant information/i,
    /I (?:cannot|couldn't|can't) (?:find|locate|determine)/i,
  ];
  let hedgeCount = 0;
  for (const rx of hedgePhrases) {
    if (rx.test(text)) hedgeCount++;
  }
  if (hedgeCount >= 2) {
    issues.push('EXCESSIVE_HEDGING');
    score -= 10;
  }

  // 6. Substantive answer length — very short answers for complex questions
  if (text.length > 30 && text.length < 150 && query.length > 60) {
    issues.push('ANSWER_TOO_SHORT');
    score -= 10;
  }

  // 7. Truncation penalty
  if (result.truncated) {
    issues.push('TRUNCATED');
    score -= 5;
  }

  // 8. Error in response
  if (result.error) {
    issues.push('ERROR: ' + result.error);
    score -= 40;
  }

  score = Math.max(0, Math.min(100, score));
  let status = 'PASS';
  if (score < 70) status = 'FAIL';
  else if (score < 90) status = 'PARTIAL';

  return {
    queryNum: idx + 1,
    query,
    docLabel,
    status,
    score,
    issues,
    hasSources,
    answerMode: result.answerMode,
    truncated: result.truncated,
    outOfScopeDocIds,
    sourceDocIds,
    responseLength: text.length,
  };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== ${ALL_QUERIES.length}-Query Document Regression Runner ===\n`);
  console.log(`  API base: ${BASE}`);
  console.log(`  Documents: ${DOC_QUERIES.map(d => d.docLabel).join(', ')}`);

  // 1. Login
  console.log(`\n[1/4] Logging in as ${LOGIN_EMAIL}...`);
  const loginRes = await login(LOGIN_EMAIL, LOGIN_PASSWORD);
  if (!loginRes.accessToken && !SESSION.at) {
    console.error('Login failed:', JSON.stringify(loginRes));
    process.exit(1);
  }
  console.log('  Logged in. User:', loginRes.user?.name);

  // 2. Get documents and find our 4 targets
  console.log('[2/4] Fetching documents...');
  const docsRes = await get('/api/documents');
  const allDocs = (docsRes.data?.items || docsRes.data || []).filter(d => d.status === 'ready');
  console.log(`  Found ${allDocs.length} ready documents total.`);
  console.log('  Available docs:');
  for (const d of allDocs) {
    console.log(`    - ${d.filename} [${d.id}]`);
  }

  const targetDocs = [];
  const docGroupMap = {}; // docKeyword -> doc object

  for (const group of DOC_QUERIES) {
    const keywords = [group.docKeyword, ...(group.altKeywords || [])];
    let found = null;
    for (const kw of keywords) {
      found = allDocs.find(d =>
        d.filename.toLowerCase().includes(kw.toLowerCase()) && d.status === 'ready'
      );
      if (found) break;
    }
    if (found && !targetDocs.find(t => t.id === found.id)) {
      targetDocs.push(found);
      docGroupMap[group.docKeyword] = found;
      console.log(`  ✓ ${group.docLabel} → ${found.filename} [${found.id}]`);
    } else {
      console.log(`  ✗ ${group.docLabel} → NOT FOUND (searched: ${keywords.join(', ')})`);
    }
  }

  if (targetDocs.length === 0) {
    console.error('\nNo target documents found! Check document filenames.');
    process.exit(1);
  }

  // 3. Run queries — one conversation per document group, single-doc attachment
  console.log(`\n[3/4] Running ${ALL_QUERIES.length} queries (per-group conversations)...\n`);
  const results = [];
  const grades = [];
  let retryCount = 0;
  const conversationIds = [];
  let queryIndex = 0;

  for (const group of DOC_QUERIES) {
    const groupDoc = docGroupMap[group.docKeyword];
    if (!groupDoc) {
      console.log(`\n  ── ${group.docLabel} ── SKIPPED (doc not found)`);
      for (const q of group.queries) {
        results.push({
          queryNum: queryIndex + 1, query: q, docLabel: group.docLabel,
          assistantText: '', sources: [], answerMode: null, truncated: false,
          latencyMs: 0, conversationId: null, error: 'DOC_NOT_FOUND', sourceDocIds: [],
        });
        grades.push({
          queryNum: queryIndex + 1, query: q, docLabel: group.docLabel,
          status: 'FAIL', score: 0, issues: ['DOC_NOT_FOUND'], hasSources: false,
          answerMode: null, truncated: false, outOfScopeDocIds: [], sourceDocIds: [],
          responseLength: 0,
        });
        queryIndex++;
      }
      continue;
    }

    const groupAttached = [{
      id: groupDoc.id,
      name: groupDoc.filename,
      type: groupDoc.mimeType?.includes('pdf') ? 'pdf' :
            groupDoc.mimeType?.includes('presentation') ? 'pptx' :
            groupDoc.mimeType?.includes('image') ? 'image' : 'other',
    }];
    const groupDocIds = [groupDoc.id];
    let conversationId = null; // fresh per group

    console.log(`\n  ── ${group.docLabel} ── (doc: ${groupDoc.id.substring(0, 8)}…)`);

    for (const q of group.queries) {
      const queryNum = queryIndex + 1;
      process.stdout.write(`  Q${String(queryNum).padStart(2,'0')}: ${q.substring(0, 70).padEnd(70)}  `);

      const startTime = Date.now();
      let result;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const body = {
            message: q,
            preferredLanguage: 'en',
            language: 'en',
            locale: 'en',
            attachedDocuments: groupAttached,
            documentIds: groupDocIds,
          };
          if (conversationId) body.conversationId = conversationId;

          result = await streamChat(body);

          if (!result.conversationId && !conversationId) {
            const fallback = await post('/api/chat/chat', body);
            if (fallback.conversationId) {
              conversationId = fallback.conversationId;
              result = {
                fullText: fallback.assistantText || '',
                sources: fallback.sources || [],
                answerMode: fallback.answerMode || null,
                conversationId: fallback.conversationId,
                truncated: false,
                events: [],
                metadata: fallback.metadata || {},
              };
            }
          }

          if (result.conversationId) conversationId = result.conversationId;
          break;
        } catch (err) {
          const errorDetail = describeError(err);
          if (attempt === 0) {
            retryCount++;
            console.log(`RETRY (${errorDetail})`);
            await sleep(3000);
          } else {
            result = {
              fullText: '', sources: [], error: errorDetail, answerMode: null,
              conversationId, truncated: false, events: [],
            };
          }
        }
      }

      const latency = Date.now() - startTime;
      const textLen = (result.fullText || '').length;
      const srcCount = (result.sources || []).length;

      results.push({
        queryNum, query: q, docLabel: group.docLabel,
        assistantText: result.fullText || '',
        sources: result.sources || [],
        answerMode: result.answerMode,
        truncated: result.truncated || false,
        latencyMs: latency,
        conversationId: result.conversationId || conversationId,
        error: result.error || null,
        sourceDocIds: (result.sources || []).map(extractSourceDocumentId).filter(Boolean),
      });

      const grade = gradeResult(queryIndex, { query: q, docLabel: group.docLabel, docKeyword: group.docKeyword }, result, { allowedDocIds: groupDocIds });
      grades.push(grade);

      const statusIcon = grade.status === 'PASS' ? '✓' : grade.status === 'PARTIAL' ? '△' : '✗';
      console.log(`${statusIcon} ${grade.status.padEnd(7)} ${grade.score}/100  ${latency}ms  ${textLen}ch  ${srcCount}src  ${grade.issues.length > 0 ? grade.issues.join(', ') : 'OK'}`);

      queryIndex++;
      await sleep(500);
    }

    conversationIds.push(conversationId);
  }

  // 4. Aggregate and save
  console.log('\n[4/4] Computing aggregate metrics...\n');

  const totalScore = grades.reduce((s, g) => s + g.score, 0);
  const avgScore = (totalScore / grades.length).toFixed(1);
  const passCount = grades.filter(g => g.status === 'PASS').length;
  const partialCount = grades.filter(g => g.status === 'PARTIAL').length;
  const failCount = grades.filter(g => g.status === 'FAIL').length;
  const missingSources = grades.filter(g => !g.hasSources).length;
  const truncatedCount = grades.filter(g => g.truncated).length;
  const wrongDocCount = grades.filter(g => g.outOfScopeDocIds.length > 0).length;
  const hedgePrefixCount = grades.filter(g => g.issues.includes('HEDGE_PREFIX_LEAKED')).length;

  // Per-document scores
  const docScores = {};
  for (const group of DOC_QUERIES) {
    const docGrades = grades.filter(g => g.docLabel === group.docLabel);
    if (docGrades.length > 0) {
      const docAvg = docGrades.reduce((s, g) => s + g.score, 0) / docGrades.length;
      docScores[group.docLabel] = {
        avgScore: docAvg.toFixed(1),
        pass: docGrades.filter(g => g.status === 'PASS').length,
        partial: docGrades.filter(g => g.status === 'PARTIAL').length,
        fail: docGrades.filter(g => g.status === 'FAIL').length,
        missingSources: docGrades.filter(g => !g.hasSources).length,
      };
    }
  }

  // Issue frequency
  const issueCounts = {};
  for (const g of grades) {
    for (const issue of g.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }
  const topIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);

  // ── Save JSON report ──
  const jsonReport = {
    meta: {
      runDate: new Date().toISOString(),
      account: LOGIN_EMAIL,
      baseUrl: BASE,
      totalQueries: ALL_QUERIES.length,
      conversationIds,
      documentsAttached: targetDocs.map(d => ({ id: d.id, name: d.filename })),
      retryIncidents: retryCount,
    },
    results,
    grades,
    docScores,
    aggregate: {
      averageScore: parseFloat(avgScore),
      pass: passCount,
      partial: partialCount,
      fail: failCount,
      missingSources,
      missingSourcesRate: ((missingSources / ALL_QUERIES.length) * 100).toFixed(1) + '%',
      wrongDocCount,
      truncationIncidence: truncatedCount,
      hedgePrefixLeaks: hedgePrefixCount,
    },
    topIssues: topIssues.slice(0, 10),
  };

  fs.writeFileSync(
    path.join(REPORTS_DIR, `doc-regression-${ALL_QUERIES.length}-run.json`),
    JSON.stringify(jsonReport, null, 2),
  );
  console.log(`  Saved: frontend/e2e/reports/doc-regression-${ALL_QUERIES.length}-run.json`);

  // ── Save Markdown report ──
  let md = `# ${ALL_QUERIES.length}-Query Document Regression Report\n\n`;
  md += `**Date:** ${new Date().toISOString()}  \n`;
  md += `**Account:** ${LOGIN_EMAIL}  \n`;
  md += `**API Base:** ${BASE}  \n`;
  md += `**Conversations:** ${conversationIds.filter(Boolean).length} (per-group)  \n`;
  md += `**Documents:** ${targetDocs.map(d => d.filename).join(', ')}  \n\n`;

  // Per-document summary
  md += `## Per-Document Scores\n\n`;
  md += `| Document | Avg Score | PASS | PARTIAL | FAIL | Missing Sources |\n`;
  md += `|---|---|---|---|---|---|\n`;
  for (const [label, stats] of Object.entries(docScores)) {
    md += `| ${label} | **${stats.avgScore}** | ${stats.pass}/10 | ${stats.partial}/10 | ${stats.fail}/10 | ${stats.missingSources} |\n`;
  }

  md += `\n## Full Results\n\n`;
  md += `| # | Doc | Query (truncated) | Status | Score | Len | Sources | Issues |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const r = results[i];
    const qShort = g.query.length > 45 ? g.query.substring(0, 42) + '...' : g.query;
    const docShort = g.docLabel.substring(0, 12);
    md += `| ${g.queryNum} | ${docShort} | ${qShort} | ${g.status} | ${g.score} | ${g.responseLength} | ${r.sources?.length || 0} | ${g.issues.join('; ') || 'OK'} |\n`;
  }

  md += `\n## Overall Metrics\n\n`;
  md += `| Metric | Value |\n`;
  md += `|---|---|\n`;
  md += `| Aggregate Score | **${avgScore}/100** |\n`;
  md += `| PASS | ${passCount}/${ALL_QUERIES.length} |\n`;
  md += `| PARTIAL | ${partialCount}/${ALL_QUERIES.length} |\n`;
  md += `| FAIL | ${failCount}/${ALL_QUERIES.length} |\n`;
  md += `| Missing Sources | ${missingSources}/${ALL_QUERIES.length} |\n`;
  md += `| Hedge Prefix Leaks | ${hedgePrefixCount}/${ALL_QUERIES.length} |\n`;
  md += `| Truncated | ${truncatedCount}/${ALL_QUERIES.length} |\n`;
  md += `| Wrong-Doc Sources | ${wrongDocCount}/${ALL_QUERIES.length} |\n`;
  md += `| Retries | ${retryCount} |\n`;

  md += `\n## Top Issues\n\n`;
  for (const [issue, count] of topIssues.slice(0, 10)) {
    md += `- **${issue}**: ${count}x\n`;
  }

  // Full answer text for review
  md += `\n## Full Answers (for manual review)\n\n`;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const g = grades[i];
    md += `### Q${r.queryNum} [${g.docLabel}] — ${g.status} (${g.score}/100)\n\n`;
    md += `**Query:** ${r.query}\n\n`;
    md += `**Answer (${r.assistantText.length} chars):**\n\n`;
    md += `${r.assistantText}\n\n`;
    if (r.sources?.length > 0) {
      md += `**Sources:** ${r.sources.map(s => s.title || s.documentId || 'unknown').join(', ')}\n\n`;
    }
    md += `---\n\n`;
  }

  fs.writeFileSync(
    path.join(REPORTS_DIR, `doc-regression-${ALL_QUERIES.length}-grading.md`),
    md,
  );
  console.log(`  Saved: frontend/e2e/reports/doc-regression-${ALL_QUERIES.length}-grading.md`);

  console.log('\n=== RESULTS ===');
  console.log(`  Score:      ${avgScore}/100`);
  console.log(`  PASS:       ${passCount}/${ALL_QUERIES.length}`);
  console.log(`  PARTIAL:    ${partialCount}/${ALL_QUERIES.length}`);
  console.log(`  FAIL:       ${failCount}/${ALL_QUERIES.length}`);
  console.log(`  No Sources: ${missingSources}`);
  console.log(`  Hedge Pfx:  ${hedgePrefixCount}`);
  console.log(`  Truncated:  ${truncatedCount}`);
  console.log(`  WrongDoc:   ${wrongDocCount}`);
  console.log(`  Retries:    ${retryCount}`);

  console.log('\n  Per-Document:');
  for (const [label, stats] of Object.entries(docScores)) {
    console.log(`    ${label}: ${stats.avgScore}/100 (${stats.pass}P/${stats.partial}T/${stats.fail}F)`);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
