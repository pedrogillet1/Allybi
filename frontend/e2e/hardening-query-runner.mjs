#!/usr/bin/env node
/**
 * Production Hardening: 90-Query Benchmark Runner
 * 9 documents x 10 queries each, matched by title fragment.
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const BASE = process.env.KODA_BASE_URL || 'http://localhost:5000';
const LOGIN_EMAIL = process.env.BENCHMARK_USER_EMAIL || 'test@allybi.com';
const LOGIN_PASSWORD = process.env.BENCHMARK_USER_PASSWORD || 'test123';

// ── Document query sets (matched by title fragment) ──────────────────
const DOC_QUERIES = [
  {
    titleMatch: ['cadastro', 'pnad'],
    docLabel: 'Acesso ao Cadastro Unico (PNAD 2014)',
    queries: [
      'How many households in the Northeast region were aware of the Cadastro Unico program in 2014?',
      'What percentage of urban versus rural households attempted to register in the Cadastro Unico?',
      'Which Brazilian macro-region had the lowest access to the Unified Registry for federal social programs?',
      'How does per-capita household income correlate with Cadastro Unico registration rates across states?',
      'What were the main sanitation and water supply conditions of households registered in the Cadastro Unico?',
      'Which metropolitan areas had the highest number of households that completed the Cadastro Unico interview?',
      'How did access to durable goods differ between Cadastro Unico registered and unregistered households?',
      'What share of households in the Southeast region had telephone access among those registered in the Cadastro Unico?',
      'How many residents per household on average were found in Cadastro Unico registered homes across the five macro-regions?',
      'What was the garbage collection coverage rate among households that attempted Cadastro Unico registration in the North region?',
    ],
  },
  {
    titleMatch: ['reserverequirements', 'reserve_requirements', 'primaryrules'],
    docLabel: 'BCB Reserve Requirements (Primary Rules)',
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
    titleMatch: ['trade act', '1974', '2101'],
    docLabel: 'Trade Act of 1974 (19 U.S.C. 2101-2497b)',
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
    titleMatch: ['trademark', 'tmep', 'examining procedure'],
    docLabel: 'Trademark Manual of Examining Procedure (TMEP)',
    queries: [
      'What is the legal basis under the Commerce Clause for federal trademark registration in the United States?',
      'How does an examining attorney evaluate whether a trademark application meets the use-in-commerce requirement?',
      'What is the process for filing an intent-to-use trademark application and converting it to a use-based registration?',
      'How does the Madrid Protocol enable international trademark registration through the USPTO?',
      'What are the grounds for refusing a trademark registration during substantive examination under the Lanham Act?',
      'How are service marks, collective marks, and certification marks distinguished in the examination process?',
      'What classification system does the USPTO use for goods and services in trademark applications?',
      'How can an applicant respond to an Office action issued by a trademark examining attorney?',
      'What post-registration maintenance requirements must a trademark owner fulfill to keep a registration active?',
      'How does the Trademark Trial and Appeal Board handle appeals from final refusals by examining attorneys?',
    ],
  },
  {
    titleMatch: ['br363', 'inpi', 'patent examination', 'appeal'],
    docLabel: 'INPI Patent Examination on Appeal (br363pt_1)',
    queries: [
      'What are the three stages of technical analysis when examining a patent application on appeal at INPI?',
      'How does COREP determine whether formal defects in the original examination prejudiced the patent analysis?',
      'Under what circumstances is a denied patent application returned to the first instance instead of being decided on appeal?',
      'What dispatch models does INPI use to communicate different outcomes of a patent appeal examination?',
      'How does the principle of "causa madura" apply to patent appeal decisions at INPI?',
      'What role do DIRPA technical divisions play in the appeal examination of patent applications?',
      'How are claim amendments evaluated during the second-instance examination of a denied patent?',
      'What criteria determine whether the objections from the original denial opinion should be maintained on appeal?',
      'How does INPI\'s appeal procedure differ for invention patents versus utility model patents?',
      'What legislation governs the administrative appeal process for patent applications at INPI?',
    ],
  },
  {
    titleMatch: ['br373', 'inpi', 'fee schedule', 'portaria', '110/2025'],
    docLabel: 'INPI Fee Schedule (br373pt_1)',
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
    titleMatch: ['non-profit', 'social assistance', 'tab02', 'entidades'],
    docLabel: 'Private Non-Profit Social Assistance Entities (tab02)',
    queries: [
      'How many private non-profit social assistance entities were operating in Brazil in 2013?',
      'Which Brazilian region had the highest concentration of non-profit social assistance organizations?',
      'How are non-profit social assistance entities distributed across municipality population size classes?',
      'What percentage of private non-profit entities in Brazil had social assistance as their primary area of activity?',
      'How many non-profit entities focused on education compared to health services across Brazilian states?',
      'Which state had the largest number of private non-profit social assistance organizations in 2013?',
      'How did the number of non-profit entities in the North region compare to the South region?',
      'What share of non-profit social assistance entities were dedicated to human rights advocacy and culture and sports?',
      'How many non-profit entities focused on rehabilitation services were found in the Southeast region?',
      'What was the distribution of non-profit entities in Brazilian metropolitan areas by their primary activity?',
    ],
  },
  {
    titleMatch: ['us217', 'food drug cosmetic', 'fdca', 'title 21'],
    docLabel: 'US Federal Food, Drug, and Cosmetic Act (us217en_1)',
    queries: [
      'How does the Federal Food, Drug, and Cosmetic Act define adulterated food and what penalties apply?',
      'What is the premarket approval process for new drugs under the FDCA?',
      'How does the FDA regulate medical devices through the 510(k) clearance pathway?',
      'What requirements does the FDCA impose on food labeling and nutritional information?',
      'How does the accelerated approval pathway work for drugs treating serious conditions?',
      'What authority does the FDA have to regulate tobacco products under the FDCA?',
      'How are generic drugs approved under the abbreviated new drug application process?',
      'What safety standards does the FDCA establish for infant formula manufacturing?',
      'How does the FDCA regulate the import and export of drugs and medical devices?',
      'What is the REMS program and when does the FDA require it for approved drugs?',
    ],
  },
  {
    titleMatch: ['us423', 'cares act', 'h.r. 748'],
    docLabel: 'CARES Act (us423en)',
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
          (fullText.includes('...') && fullText.length > 3000) ||
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

// ── Document matcher (by title fragment) ─────────────────────────────
function findDocByTitleFragments(allDocs, fragments) {
  const lower = fragments.map(f => f.toLowerCase());
  return allDocs.find(d => {
    const name = (d.filename || d.title || d.name || '').toLowerCase();
    const id = (d.id || '').toLowerCase();
    return lower.some(f => name.includes(f) || id.includes(f));
  });
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== Hardening Benchmark Runner ===\n`);
  console.log(`  API base: ${BASE}`);
  console.log(`  Account:  ${LOGIN_EMAIL}`);

  // 1. Login
  console.log(`\n[1/4] Logging in...`);
  const loginRes = await login(LOGIN_EMAIL, LOGIN_PASSWORD);
  if (!loginRes.accessToken && !SESSION.at) {
    console.error('Login failed:', JSON.stringify(loginRes));
    process.exit(1);
  }
  console.log('  Logged in.');

  // 2. Resolve documents by title match
  console.log('[2/4] Fetching documents...');
  const docsRes = await get('/api/documents');
  const allDocs = (docsRes.data?.items || docsRes.data || []).filter(d => d.status === 'ready');
  console.log(`  Found ${allDocs.length} ready documents.\n`);

  const docMap = {};
  for (const group of DOC_QUERIES) {
    const found = findDocByTitleFragments(allDocs, group.titleMatch);
    if (found) {
      docMap[group.docLabel] = found;
      console.log(`  + ${group.docLabel}`);
      console.log(`    -> ${found.filename || found.title} [${found.id.substring(0, 8)}]`);
    } else {
      console.log(`  x ${group.docLabel} -> NOT FOUND (searched: ${group.titleMatch.join(', ')})`);
    }
  }

  // Calculate tested queries (skip groups where doc is not found)
  const testedGroups = DOC_QUERIES.filter(g => docMap[g.docLabel]);
  const skippedGroups = DOC_QUERIES.filter(g => !docMap[g.docLabel]);
  const totalQueries = testedGroups.reduce((s, g) => s + g.queries.length, 0);

  if (skippedGroups.length > 0) {
    console.log(`\n  Skipping ${skippedGroups.length} doc group(s) not found: ${skippedGroups.map(g => g.docLabel).join(', ')}`);
  }

  // 3. Run queries
  console.log(`\n[3/4] Running ${totalQueries} queries (${testedGroups.length} doc groups)...\n`);
  const results = [];
  const conversationIds = [];
  let queryIndex = 0;

  for (const group of DOC_QUERIES) {
    const doc = docMap[group.docLabel];
    if (!doc) {
      console.log(`\n  -- ${group.docLabel} -- SKIPPED (doc not found)`);
      continue;  // Skip entirely — no results, no count
    }

    const groupAttached = [{ id: doc.id, name: doc.filename, type: 'pdf' }];
    const groupDocIds = [doc.id];
    let conversationId = null;

    console.log(`\n  -- ${group.docLabel} -- (${doc.id.substring(0, 8)})`);

    for (const q of group.queries) {
      const num = ++queryIndex;
      process.stdout.write(`  Q${String(num).padStart(2, '0')}: ${q.substring(0, 70).padEnd(70)}  `);

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
      const hasErr = result.error ? ' ERR' : '';
      const hasTrunc = result.truncated ? ' TRUNC' : '';
      const marker = result.error ? 'x' : textLen > 100 ? '+' : '~';

      console.log(`${marker} ${latency}ms  ${textLen}ch  ${srcCount}src${hasErr}${hasTrunc}`);

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

  // 4. Save results
  console.log('\n[4/4] Saving results...');

  let backendCommit = 'unknown';
  try { backendCommit = execSync('git rev-parse HEAD').toString().trim(); } catch {}

  const runMetadata = {
    runId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    backendCommit,
    runnerVersion: '2.0.0',
    accountId: LOGIN_EMAIL,
    queryCount: totalQueries,
    docGroupsResolved: testedGroups.length,
    docGroupsSkipped: skippedGroups.map(g => g.docLabel),
  };

  const jsonReport = {
    runMetadata,
    meta: { runDate: new Date().toISOString(), account: LOGIN_EMAIL, baseUrl: BASE, totalQueries, conversationIds },
    results,
  };

  const jsonPath = path.join(REPORTS_DIR, 'hardening-benchmark-run.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

  // Also save a markdown summary
  const mdLines = [
    `# Hardening Benchmark Results`,
    ``,
    `- **Date**: ${new Date().toISOString()}`,
    `- **Account**: ${LOGIN_EMAIL}`,
    `- **Total queries tested**: ${totalQueries}`,
    `- **Doc groups tested**: ${testedGroups.length}/${DOC_QUERIES.length}`,
    skippedGroups.length > 0 ? `- **Skipped**: ${skippedGroups.map(g => g.docLabel).join(', ')}` : null,
    ``,
  ].filter(Boolean);

  for (const group of testedGroups) {
    mdLines.push(`## ${group.docLabel}`);
    mdLines.push('');
    const groupResults = results.filter(r => r.docLabel === group.docLabel);
    for (const r of groupResults) {
      const status = r.error ? 'ERROR' : r.fullText.length > 100 ? 'OK' : 'SHORT';
      mdLines.push(`### Q${r.queryNum}: ${r.query}`);
      mdLines.push(`**Status**: ${status} | **Latency**: ${r.latencyMs}ms | **Length**: ${r.fullText.length}ch | **Sources**: ${r.sources.length}`);
      mdLines.push('');
      if (r.fullText) {
        mdLines.push(r.fullText);
      } else if (r.error) {
        mdLines.push(`> Error: ${r.error}`);
      }
      mdLines.push('');
      mdLines.push('---');
      mdLines.push('');
    }
  }

  const answered = results.filter(r => (r.fullText || '').length > 100);
  const errored = results.filter(r => r.error);
  const avgLatency = Math.round(results.filter(r => !r.error).reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, results.filter(r => !r.error).length));

  mdLines.push(`## Summary`);
  mdLines.push(`| Metric | Value |`);
  mdLines.push(`|--------|-------|`);
  mdLines.push(`| Answered (>100ch) | ${answered.length}/${totalQueries} |`);
  mdLines.push(`| Errors | ${errored.length} |`);
  mdLines.push(`| Avg latency | ${avgLatency}ms |`);

  const mdPath = path.join(REPORTS_DIR, 'hardening-benchmark-answers.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'));
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);

  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`  Total queries: ${totalQueries}`);
  console.log(`  Answered (>100ch): ${answered.length}`);
  console.log(`  Errored: ${errored.length}`);
  console.log(`  Avg latency: ${avgLatency}ms`);
  console.log('\nDone.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
