#!/usr/bin/env node
/**
 * 90-Query Document Regression Runner (99 minus Trade Act)
 * 9 documents × 10 queries each, streamed via SSE.
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const BASE = 'http://localhost:5000';
const LOGIN_EMAIL = 'test@allybi.com';
const LOGIN_PASSWORD = 'test123';

// ── Document-specific query sets ──────────────────────────────────
const DOC_QUERIES = [
  {
    docId: '5caa545b',
    docLabel: 'BESS Brazilian Market',
    queries: [
      'What is the main investment thesis of the BESS Brazil market assessment?',
      'How does the document explain BESS as a regulated capacity asset rather than just an energy asset?',
      'Extract every explicit market-size, growth, or deployment figure mentioned for Brazil and the global storage market.',
      'What role does LRCAP 2026 play in the document\'s view of the Brazilian storage opportunity?',
      'Compare the storage technologies discussed, especially lithium-ion versus vanadium flow batteries.',
      'What grid services or operational capabilities does the document say storage buyers are actually purchasing?',
      'Which near-term Brazilian market segments are presented as the best opportunities for deployment or investment?',
      'What are the main arguments for a strategic partnership between Lyon Capital and RKP?',
      'Reconstruct the regulatory and commercial timeline the document presents for Brazil\'s storage market.',
      'Separate the document\'s claims into three buckets: clearly supported, suggested, and not fully evidenced.',
    ],
  },
  {
    docId: '087794fe',
    docLabel: 'Mayfair Investor Deck',
    queries: [
      'What is the core investment story Mayfair is telling in this deck?',
      'How does Mayfair describe its AI-native, vertically integrated fashion model?',
      'Extract all explicit financial and operating metrics in the deck and explain each one in context.',
      'Who are the founders, advisors, and notable investors mentioned in the presentation?',
      'Which markets and customer segments does Mayfair say it is targeting first, and why?',
      'How does the deck compare Mayfair\'s operating model with legacy fashion peers?',
      'What does the deck say about launch speed, inventory, CAC payback, and revenue per employee?',
      'How is the planned use of funds split, and what strategic priorities does that imply?',
      'What ESG or sustainability claims are made, and which of them look strongest versus weakest?',
      'Write a skeptical diligence memo listing the main red flags, ambiguities, and unsupported claims in the deck.',
    ],
  },
  {
    docId: '9f9ae5a5',
    docLabel: 'ATT Bill Dec2023',
    queries: [
      'Give a full billing summary with issue date, billing period, total due, and AutoPay date.',
      'Break down the monthly charges, add-ons, company fees, and taxes for this line.',
      'Why is the total due $98.49, and which line items contribute to it?',
      'Compare the last bill amount with the current amount and explain the difference.',
      'Put every visible charge into a table: item | amount | category | evidence.',
      'Extract all account identifiers, phone numbers, dates, and dollar amounts visible in the bill.',
      'Which charges look recurring versus potentially variable or one-time?',
      'Explain this bill in plain English to the account holder.',
      'What should the customer verify before the scheduled AutoPay date?',
      'What important billing details are not fully visible or cannot be confirmed from this document alone?',
    ],
  },
  {
    docId: 'd57332fe',
    docLabel: 'Breguet',
    queries: [
      'Identify the most likely document type for Breguet.pdf based only on visible evidence.',
      'Extract every readable date, proper noun, place name, and commercial identifier from the file.',
      'What evidence suggests this document is related to a Breguet boutique, purchase, or service interaction?',
      'Describe the document layout and the kinds of fields or sections that appear to exist.',
      'Separate what is clearly legible from what is too faint, missing, or unreadable.',
      'Produce a high-confidence fact sheet using only facts that are directly visible.',
      'What is the likely issuer, and what clues support that conclusion?',
      'If this were being used for audit or verification, which fields would need manual confirmation?',
      'List possible red flags, such as missing totals, unclear recipient data, or incomplete provenance.',
      'Give a strict recap in three sections: supported, weakly suggested, and unreadable.',
    ],
  },
  {
    docId: '83672a58',
    docLabel: 'IBGE Open Data Plan',
    queries: [
      'What is the overall purpose of the IBGE Open Data Plan for 2024-2025?',
      'Which legal and institutional frameworks are cited as the basis for this plan?',
      'What are the plan\'s general and specific objectives?',
      'How does the document say IBGE should prioritize which datasets to open first?',
      'Which portals, APIs, and open formats are referenced for publishing data?',
      'What governance or monitoring structure does the plan propose to track execution?',
      'What does the document say about transparency, confidentiality, and protection of informant data?',
      'Summarize the annex on the most accessed SIDRA tables and why it matters for prioritization.',
      'Explain the "5-star open data" model referenced in the plan.',
      'Extract the action-plan fields used in the schedule, such as dataset name, activity, deadline, periodicity, and responsible unit.',
    ],
  },
  {
    docId: '4d0f9a1a',
    docLabel: 'ARM Montana Arizona',
    queries: [
      'Summarize the three assets or project groups included in the ARM Montana & Arizona summary.',
      'Break down the uses of capital for each project and for the total portfolio.',
      'Break down the sources of capital for each project and identify the equity requirement.',
      'Compare Lone Mountain Ranch, Baxter Hotel, and Rex Ranch in terms of purchase price, capex, and capital structure.',
      'Which financing components are already in place, and which appear to depend on future execution?',
      'What does the document suggest about ARM\'s hospitality and real-estate strategy?',
      'Identify every explicit figure tied to debt, deposits, renovation, and acquisition.',
      'What underwriting questions remain unanswered if an investor only had this one-page summary?',
      'Write a concise investment-committee note with strengths, risks, and missing information.',
      'Put the full one-page summary into a structured table: asset | location | purchase | capex | debt | deposits | equity.',
    ],
  },
  {
    docId: '3b71d2bd',
    docLabel: 'Guarda Bens Self Storage',
    queries: [
      'What business does Guarda Bens describe, and how does it position its service offering?',
      'Map the current box-rental process from first customer contact to ongoing monthly follow-up.',
      'Summarize the primary and support activities in the value chain slide.',
      'Extract the full SIPOC model from the presentation and explain what each part means.',
      'What exact problem is defined in the deck, and what operational impacts are listed?',
      'What categories of root cause are referenced in the Ishikawa analysis?',
      'Which causes receive the highest GUT priority scores, and why?',
      'What SMART goal is defined, and what operational improvement target does it set?',
      'What KPIs or performance indicators are implied by the deck, even if not fully quantified?',
      'What process gaps, ambiguities, or implementation risks remain after reading the presentation?',
    ],
  },
  {
    docId: '27fa8bbd',
    docLabel: 'Reserve Requirements',
    queries: [
      'Summarize all reserve-requirement categories covered in this document.',
      'Which institutions are subject to reserve requirements for demand deposits and savings deposits?',
      'How is the reserve base calculated for demand deposits?',
      'How is the reserve base calculated for savings deposits?',
      'List all regulatory bases cited, including BCB resolutions, CMN resolutions, and normative instructions.',
      'Compare the rules for demand deposits versus savings deposits in a side-by-side table.',
      'What 2024 and 2025 regulatory updates are explicitly referenced in the document?',
      'Explain the computation period, maintenance period, and deficiency-charge concepts in simple terms.',
      'Build an operational checklist for a compliance team using only the information shown here.',
      'Identify any fields that appear incomplete, truncated, or in need of the original Portuguese source for confirmation.',
    ],
  },
  {
    docId: '20b5d889',
    docLabel: 'Tabela 1.1',
    queries: [
      'What does Tabela 1.1 measure, and how is the geography organized in the visible rows?',
      'Extract the year columns and explain the difference between "antes de 2016," yearly counts from 2016 onward, and "ano de nascimento ignorado."',
      'What are the total registered live births shown for Total, Brasil (1), and Norte?',
      'List the visible geographies in the sheet snippet and their hierarchy.',
      'Extract the 2024 values for every visible row in the sheet preview.',
      'Which visible geography has the highest total number of registered live births in the excerpt?',
      'Compare Total versus Brasil (1) and explain what that difference might represent.',
      'Identify all rows in the visible excerpt that contain dashes, blanks, notes, or footnote markers.',
      'Build a table with the visible rows only: geography | total records | before 2016 | 2024.',
    ],
  },
];

// ── Session state ────────────────────────────────────────────────────
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

// ── HTTP helpers ─────────────────────────────────────────────────────
function login(email, password) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/auth/login', BASE);
    const payload = JSON.stringify({ email, password });
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
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

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'GET',
      headers: { 'Cookie': cookieHeader(), 'x-csrf-token': SESSION.csrf },
    }, (res) => {
      captureCookies(res);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    });
    req.on('error', reject);
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
          resolve({ events: [], fullText: '', sources: [], answerMode: null, conversationId: null, truncated: false, metadata: {}, eventCount: 0, error: errMsg });
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

function extractSourceDocumentId(source) {
  if (!source || typeof source !== 'object') return '';
  const candidates = [source.documentId, source.docId, source.id, source.document?.id];
  for (const value of candidates) {
    const id = String(value || '').trim();
    if (id) return id;
  }
  return '';
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const totalQueries = DOC_QUERIES.reduce((s, g) => s + g.queries.length, 0);
  console.log(`=== ${totalQueries}-Query Document Regression Runner ===\n`);
  console.log(`  API base: ${BASE}`);

  // 1. Login
  console.log(`\n[1/4] Logging in as ${LOGIN_EMAIL}...`);
  const loginRes = await login(LOGIN_EMAIL, LOGIN_PASSWORD);
  if (!loginRes.accessToken && !SESSION.at) {
    console.error('Login failed:', JSON.stringify(loginRes));
    process.exit(1);
  }
  console.log('  Logged in.');

  // 2. Resolve full document IDs
  console.log('[2/4] Fetching documents...');
  const docsRes = await get('/api/documents');
  const allDocs = (docsRes.data?.items || docsRes.data || []).filter(d => d.status === 'ready');
  console.log(`  Found ${allDocs.length} ready documents.`);

  const docMap = {}; // docId prefix -> full doc object
  for (const group of DOC_QUERIES) {
    const found = allDocs.find(d => d.id.startsWith(group.docId));
    if (found) {
      docMap[group.docId] = found;
      console.log(`  ✓ ${group.docLabel} → ${found.filename} [${found.id.substring(0, 8)}…]`);
    } else {
      console.log(`  ✗ ${group.docLabel} → NOT FOUND (prefix: ${group.docId})`);
    }
  }

  // 3. Run queries
  console.log(`\n[3/4] Running ${totalQueries} queries...\n`);
  const results = [];
  const conversationIds = [];
  let queryIndex = 0;

  for (const group of DOC_QUERIES) {
    const doc = docMap[group.docId];
    if (!doc) {
      console.log(`\n  ── ${group.docLabel} ── SKIPPED (doc not found)`);
      for (const q of group.queries) {
        results.push({ queryNum: ++queryIndex, query: q, docLabel: group.docLabel, fullText: '', sources: [], answerMode: null, truncated: false, latencyMs: 0, conversationId: null, error: 'DOC_NOT_FOUND' });
      }
      continue;
    }

    const groupAttached = [{ id: doc.id, name: doc.filename, type: 'pdf' }];
    const groupDocIds = [doc.id];
    let conversationId = null;

    console.log(`\n  ── ${group.docLabel} ── (${doc.id.substring(0, 8)}…)`);

    for (const q of group.queries) {
      const num = ++queryIndex;
      process.stdout.write(`  Q${String(num).padStart(2, '0')}: ${q.substring(0, 65).padEnd(65)}  `);

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
          if (result.conversationId) conversationId = result.conversationId;
          break;
        } catch (err) {
          if (attempt === 0) {
            console.log(`RETRY (${err.message})`);
            await sleep(3000);
          } else {
            result = { fullText: '', sources: [], error: err.message, answerMode: null, conversationId, truncated: false, events: [] };
          }
        }
      }

      const latency = Date.now() - startTime;
      const textLen = (result.fullText || '').length;
      const srcCount = (result.sources || []).length;
      const hasErr = result.error ? '✗ ERR' : '';
      const hasTrunc = result.truncated ? ' TRUNC' : '';

      console.log(`${textLen > 100 ? '✓' : '△'} ${latency}ms  ${textLen}ch  ${srcCount}src${hasErr}${hasTrunc}`);

      results.push({
        queryNum: num, query: q, docLabel: group.docLabel,
        fullText: result.fullText || '', sources: result.sources || [],
        answerMode: result.answerMode, truncated: result.truncated || false,
        latencyMs: latency, conversationId: result.conversationId || conversationId,
        error: result.error || null,
      });

      await sleep(300);
    }
    conversationIds.push(conversationId);
  }

  // 4. Save raw JSON
  console.log('\n[4/4] Saving results...');
  const jsonReport = {
    meta: { runDate: new Date().toISOString(), account: LOGIN_EMAIL, baseUrl: BASE, totalQueries, conversationIds },
    results,
  };
  const jsonPath = path.join(REPORTS_DIR, `99-query-run.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`  Saved: ${jsonPath}`);

  // Quick summary
  const answered = results.filter(r => (r.fullText || '').length > 100);
  const errored = results.filter(r => r.error);
  const noSources = results.filter(r => !r.sources || r.sources.length === 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`  Total queries: ${totalQueries}`);
  console.log(`  Answered (>100ch): ${answered.length}`);
  console.log(`  Errored: ${errored.length}`);
  console.log(`  No sources: ${noSources.length}`);
  console.log(`  Avg latency: ${Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)}ms`);
  console.log('\nDone. Run grading separately.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
