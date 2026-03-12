#!/usr/bin/env node
/**
 * Focused runner — only the problem queries (Q29, Q36, Q42, Q73, Q76).
 * Outputs results in the same format as 99-query-run.json so grade-99-query.mjs works.
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
const LOGIN_EMAIL = 'test@koda.com';
const LOGIN_PASSWORD = 'test1234';

// Only the doc groups containing problem queries, with only those queries
const FOCUSED = [
  {
    docId: '2ba9f87c',
    docLabel: 'ATT Bill Dec2023',
    queries: [
      { globalNum: 29, text: 'What should the customer verify before the scheduled AutoPay date?' },
    ],
  },
  {
    docId: 'd4497946',
    docLabel: 'Breguet',
    queries: [
      { globalNum: 36, text: 'Produce a high-confidence fact sheet using only facts that are directly visible.' },
    ],
  },
  {
    docId: 'c6e86f64',
    docLabel: 'IBGE Open Data Plan',
    queries: [
      { globalNum: 42, text: 'Which legal and institutional frameworks are cited as the basis for this plan?' },
    ],
  },
  {
    docId: '8c00a4ed',
    docLabel: 'Reserve Requirements',
    queries: [
      { globalNum: 73, text: 'How is the reserve base calculated for demand deposits?' },
      { globalNum: 76, text: 'Compare the rules for demand deposits versus savings deposits in a side-by-side table.' },
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
          resolve({ fullText: '', sources: [], answerMode: null, conversationId: null, truncated: false, metadata: {}, error: errMsg });
        });
        return;
      }

      let raw = '';
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
            } catch {}
          }
        }
      });

      res.on('end', () => {
        if (raw.startsWith('data: ')) {
          try {
            const evt = JSON.parse(raw.slice(6));
            if (evt.type === 'final') {
              conversationId = evt.conversationId || conversationId;
              if (evt.content) fullText = evt.content;
              else if (evt.assistantText) fullText = evt.assistantText;
              if (evt.sources) sources = evt.sources;
              answerMode = evt.answerMode || answerMode;
            }
          } catch {}
        }
        truncated = fullText.includes('[truncated]') || (fullText.includes('…') && fullText.length > 3000);
        resolve({ fullText, sources, answerMode, conversationId, truncated, metadata });
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

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const totalQueries = FOCUSED.reduce((s, g) => s + g.queries.length, 0);
  console.log(`=== Focused Query Runner (${totalQueries} queries) ===\n`);

  // 1. Login
  console.log(`[1/4] Logging in as ${LOGIN_EMAIL}...`);
  const loginRes = await login(LOGIN_EMAIL, LOGIN_PASSWORD);
  if (!loginRes.accessToken && !SESSION.at) {
    console.error('Login failed:', JSON.stringify(loginRes));
    process.exit(1);
  }
  console.log('  Logged in.');

  // 2. Resolve docs
  console.log('[2/4] Fetching documents...');
  const docsRes = await get('/api/documents');
  const allDocs = (docsRes.data?.items || docsRes.data || []).filter(d => d.status === 'ready');

  const docMap = {};
  for (const group of FOCUSED) {
    const found = allDocs.find(d => d.id.startsWith(group.docId));
    if (found) {
      docMap[group.docId] = found;
      console.log(`  ✓ ${group.docLabel} → ${found.id.substring(0, 8)}…`);
    } else {
      console.log(`  ✗ ${group.docLabel} → NOT FOUND`);
    }
  }

  // 3. Run queries
  console.log(`\n[3/4] Running ${totalQueries} focused queries...\n`);
  const results = [];

  for (const group of FOCUSED) {
    const doc = docMap[group.docId];
    if (!doc) {
      for (const q of group.queries) {
        results.push({ queryNum: q.globalNum, query: q.text, docLabel: group.docLabel, fullText: '', sources: [], answerMode: null, truncated: false, latencyMs: 0, error: 'DOC_NOT_FOUND' });
      }
      continue;
    }

    const groupAttached = [{ id: doc.id, name: doc.filename, type: 'pdf' }];
    const groupDocIds = [doc.id];

    console.log(`  ── ${group.docLabel} ──`);

    for (const q of group.queries) {
      process.stdout.write(`  Q${String(q.globalNum).padStart(2, '0')}: ${q.text.substring(0, 65).padEnd(65)}  `);

      const startTime = Date.now();
      let result;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await streamChat({
            message: q.text,
            preferredLanguage: 'en',
            language: 'en',
            locale: 'en',
            attachedDocuments: groupAttached,
            documentIds: groupDocIds,
          });
          break;
        } catch (err) {
          if (attempt === 0) {
            console.log(`RETRY (${err.message})`);
            await sleep(3000);
          } else {
            result = { fullText: '', sources: [], error: err.message, answerMode: null, truncated: false };
          }
        }
      }

      const latency = Date.now() - startTime;
      const textLen = (result.fullText || '').length;
      const srcCount = (result.sources || []).length;
      const hasErr = result.error ? ' ✗ ERR' : '';

      console.log(`${textLen > 100 ? '✓' : '△'} ${latency}ms  ${textLen}ch  ${srcCount}src${hasErr}`);

      results.push({
        queryNum: q.globalNum, query: q.text, docLabel: group.docLabel,
        fullText: result.fullText || '', sources: result.sources || [],
        answerMode: result.answerMode, truncated: result.truncated || false,
        latencyMs: latency, conversationId: result.conversationId || null,
        error: result.error || null,
      });

      await sleep(300);
    }
  }

  // 4. Merge into existing 99-query-run.json (replace only the focused query numbers)
  const jsonPath = path.join(REPORTS_DIR, '99-query-run.json');
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    console.error(`  Could not read ${jsonPath} — saving focused results only.`);
    existing = { meta: {}, results: [] };
  }

  const focusedNums = new Set(results.map(r => r.queryNum));
  const merged = existing.results.filter(r => !focusedNums.has(r.queryNum));
  merged.push(...results);
  merged.sort((a, b) => a.queryNum - b.queryNum);
  existing.results = merged;
  existing.meta.lastFocusedRun = new Date().toISOString();

  fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2));
  console.log(`\n[4/4] Merged ${results.length} results into ${jsonPath}`);

  // Quick per-query summary
  console.log(`\n=== FOCUSED RESULTS ===`);
  for (const r of results) {
    const len = (r.fullText || '').length;
    const preview = (r.fullText || '').substring(0, 100).replace(/\n/g, ' ');
    console.log(`  Q${r.queryNum}: ${len}ch ${r.sources?.length || 0}src ${r.latencyMs}ms`);
    console.log(`    "${preview}…"`);
  }
  console.log('\nDone. Run grade-99-query.mjs to grade.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
