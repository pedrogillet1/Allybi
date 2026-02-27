#!/usr/bin/env node
/**
 * 40-Query Conversational Regression Runner
 * Executes queries sequentially against the chat API, captures responses, and grades them.
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
  'test@koda.com',
).trim();
const LOGIN_PASSWORD = String(
  readArgValue('--password') ||
  process.env.E2E_TEST_PASSWORD ||
  'test123',
).trim();

const isHttps = BASE.startsWith('https://');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const httpAgent = new http.Agent();
const STRICT_DOCSET_LOCK = !process.argv.includes('--no-strict-docset-lock');

// ── Queries ──────────────────────────────────────────────────────────
const QUERIES = [
  'Me dá uma visão geral dos docs anexados em 6 bullets.',
  'Classifica os anexos em acadêmico, comercial e apresentação.',
  'Qual doc parece mais estratégico para decisão? Justifique com fontes.',
  'Qual doc parece mais técnico? Cite trechos.',
  'Resume tudo em 3 frases para WhatsApp.',
  'Quais docs estão mais completos e quais parecem rasos?',
  'Se eu tiver 15 minutos, qual ordem de leitura você recomenda?',
  'Começa pelo capítulo de scrum.',
  'No capítulo de scrum, qual a definição central de Scrum?',
  'Quais papéis aparecem e qual responsabilidade de cada um?',
  'Explica os eventos do Scrum na ordem correta, simples.',
  'Diferença prática entre Product Backlog e Sprint Backlog.',
  'O que o texto fala sobre Definition of Done?',
  'Me dá 3 trechos curtos que provam os pontos principais.',
  'Agora transforma isso em tabela: conceito | definição | evidência.',
  'Cria 10 flashcards com base nesse capítulo.',
  'Agora conecta com as anotações da aula.',
  'Quais temas das anotações batem com o capítulo?',
  'Quais pontos das anotações contradizem ou ampliam o capítulo?',
  'Resume as anotações por tema em tópicos.',
  'Me dá os 10 termos mais importantes das anotações com explicação curta.',
  'Agora vamos para o trabalho do projeto.',
  'Qual é o objetivo principal do trabalho?',
  'Extrai escopo, entregáveis e critérios de sucesso.',
  'Quais prazos e marcos aparecem?',
  'Quem são os stakeholders citados?',
  'Cria matriz: requisito | prioridade | evidência.',
  'Quais riscos do projeto aparecem no texto?',
  'Quais mitigadores já existem no documento?',
  'Se faltar mitigador, sugere sem inventar fatos fora dos docs.',
  'Resume esse trabalho em um pitch de 60 segundos.',
  'Agora versão técnica para time de execução.',
  'Faz uma SWOT baseada só nesse trabalho.',
  'Compara o trabalho com o capítulo de scrum (convergências e lacunas).',
  'Agora usa o one-pager de marketing e o deck de self storage para comparar posicionamento.',
  'Quais mensagens comerciais se repetem entre o one-pager e o deck?',
  'Onde há inconsistência entre promessa comercial e execução do projeto?',
  'Para a imagem do trabalho final, extraia os pontos-chave visuais e relacione com o texto do projeto.',
  'Quero uma tabela comparativa final: doc | objetivo | risco principal | ação recomendada.',
  'Me diga algo que NÃO está nos documentos anexados e explique por que não pode afirmar.',
];

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

// ── Helpers ──────────────────────────────────────────────────────────
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

function post(urlPath, body) {
  return postRaw(urlPath, body);
}

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

/** Login and capture all session cookies */
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
          // Also store from body in case cookies are httpOnly
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

/** SSE streaming chat request - collects all events */
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

      // If we get a non-200 or non-SSE response, handle as error
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
        // Parse SSE events from raw buffer
        const lines = raw.split('\n');
        raw = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6));
              events.push(evt);
              if (evt.type === 'delta' && evt.text) fullText += evt.text;
              if (evt.type === 'sources' && evt.sources) sources = evt.sources;
              if (evt.type === 'meta') {
                answerMode = evt.answerMode || answerMode;
              }
              if (evt.type === 'final') {
                conversationId = evt.conversationId || conversationId;
                if (evt.content) fullText = evt.content;
                else if (evt.assistantText) fullText = evt.assistantText;
                if (evt.sources) sources = evt.sources;
                if (evt.metadata) metadata = evt.metadata;
                answerMode = evt.answerMode || answerMode;
              }
              if (evt.type === 'error') {
                console.error(`  [SSE error] ${evt.message}`);
              }
            } catch {}
          }
        }
      });

      res.on('end', () => {
        // Process any remaining data
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

        // Check for truncation indicators
        truncated = fullText.includes('[truncated]') ||
                    fullText.includes('…') && fullText.length > 3000 ||
                    events.some(e => e.truncated === true) ||
                    (metadata && metadata.truncated === true);

        resolve({
          events,
          fullText,
          sources,
          answerMode,
          conversationId,
          truncated,
          metadata,
          eventCount: events.length,
        });
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
  if (err.cause && typeof err.cause === 'object') {
    if (err.cause.code) parts.push(`causeCode=${err.cause.code}`);
    if (err.cause.message) parts.push(`cause=${err.cause.message}`);
  }
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    parts.push(`inner=${err.errors.map(e => e?.message || String(e)).join(' | ')}`);
  }
  return parts.length > 0 ? parts.join(' ; ') : String(err);
}

function extractSourceDocumentId(source) {
  if (!source || typeof source !== 'object') return '';
  const candidates = [
    source.documentId,
    source.docId,
    source.id,
    source.document?.id,
  ];
  for (const value of candidates) {
    const id = String(value || '').trim();
    if (id) return id;
  }
  return '';
}

// ── Grade a single query result ──────────────────────────────────────
function gradeResult(idx, query, result, options = {}) {
  const allowedDocIds = new Set(
    Array.isArray(options.allowedDocIds)
      ? options.allowedDocIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
  );
  const sourceDocIds = (result.sources || [])
    .map(extractSourceDocumentId)
    .filter(Boolean);
  const outOfScopeDocIds = sourceDocIds.filter(
    (docId) => allowedDocIds.size > 0 && !allowedDocIds.has(docId),
  );

  const issues = [];
  let score = 100;

  // 1. Basic response check
  if (!result.fullText || result.fullText.length < 20) {
    issues.push('EMPTY_OR_MINIMAL_RESPONSE');
    score -= 50;
  }

  // 2. Sources check
  const hasSources = result.sources && result.sources.length > 0;
  if (!hasSources) {
    issues.push('NO_SOURCES');
    score -= 40;
  }

  if (outOfScopeDocIds.length > 0) {
    issues.push('OUT_OF_SCOPE_SOURCE');
    score = 0;
  }

  // 3. Language check (Portuguese)
  const text = result.fullText || '';
  const ptIndicators = ['de', 'do', 'da', 'os', 'as', 'no', 'na', 'com', 'para', 'que', 'uma', 'são'];
  const enIndicators = ['the', 'is', 'are', 'this', 'that', 'with', 'for', 'from'];
  const ptCount = ptIndicators.filter(w => text.toLowerCase().includes(` ${w} `)).length;
  const enCount = enIndicators.filter(w => text.toLowerCase().includes(` ${w} `)).length;
  if (enCount > ptCount && text.length > 100) {
    issues.push('LANGUAGE_NOT_PORTUGUESE');
    score -= 10;
  }

  // 4. Format compliance checks per query type
  if (query.includes('6 bullets') && (text.match(/[-•●▪]\s/g) || []).length < 4 &&
      (text.match(/^\d+\./gm) || []).length < 4) {
    issues.push('MISSING_BULLET_FORMAT');
    score -= 5;
  }
  if (query.includes('tabela') && !text.includes('|') && !text.includes('─')) {
    issues.push('MISSING_TABLE_FORMAT');
    score -= 5;
  }
  if (query.includes('flashcards') && (text.match(/\d+[.)]/g) || []).length < 5) {
    issues.push('INSUFFICIENT_FLASHCARDS');
    score -= 5;
  }
  if (query.includes('SWOT') && !text.toUpperCase().includes('SWOT') &&
      !text.includes('Forças') && !text.includes('Fraquezas')) {
    issues.push('MISSING_SWOT_STRUCTURE');
    score -= 5;
  }
  if (query.includes('matriz') && !text.includes('|')) {
    issues.push('MISSING_MATRIX_FORMAT');
    score -= 5;
  }

  // 5. Truncation penalty
  if (result.truncated) {
    issues.push('TRUNCATED');
    score -= 5;
  }

  // 6. Error in response
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
    status,
    score,
    issues,
    hasSources,
    answerMode: result.answerMode,
    truncated: result.truncated,
    outOfScopeDocIds,
    sourceDocIds,
  };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('=== 40-Query Regression Runner ===\n');
  console.log(`  API base: ${BASE}`);
  console.log(`  Strict docset lock: ${STRICT_DOCSET_LOCK ? 'ON' : 'OFF'}`);
  console.log(`  TLS verify: ${isHttps ? 'disabled (self-signed allowed)' : 'n/a (http)'}`);

  // 1. Login (captures koda_at, koda_rt, koda_csrf cookies)
  console.log(`[1/4] Logging in as ${LOGIN_EMAIL}...`);
  const loginRes = await login(LOGIN_EMAIL, LOGIN_PASSWORD);
  if (!loginRes.accessToken && !SESSION.at) {
    console.error('Login failed:', JSON.stringify(loginRes));
    process.exit(1);
  }
  console.log('  Logged in. User:', loginRes.user?.name);
  console.log('  CSRF token:', SESSION.csrf ? SESSION.csrf.substring(0, 10) + '...' : 'MISSING');

  // 2. Get documents
  console.log('[2/4] Fetching documents...');
  const docsRes = await get('/api/documents');
  const allDocs = docsRes.data.items.filter(d => d.status === 'ready');

  // Select the relevant documents for this test set (from stress test/pdf + relevant ones)
  // Based on queries: Scrum chapter, class notes, project work, marketing one-pager,
  // self-storage deck, final project image
  const docMap = {};
  for (const d of allDocs) {
    const key = d.filename.toLowerCase();
    if (!docMap[key]) docMap[key] = d;
  }

  // Pick one copy of each relevant doc (prefer stress test folder)
  const targetDocs = [];
  const findDoc = (substring) => {
    const found = allDocs.find(d => d.filename.toLowerCase().includes(substring.toLowerCase()) && d.status === 'ready');
    if (found && !targetDocs.find(t => t.id === found.id)) targetDocs.push(found);
    return found;
  };

  findDoc('Capítulo_8__Framework_Scrum');    // Scrum chapter
  findDoc('Anotações_Aula_2');               // Class notes
  findDoc('Trabalho_projeto');               // Project work
  findDoc('OBA_marketing');                  // Marketing one-pager
  findDoc('guarda_bens_self_storage');       // Self-storage deck
  findDoc('TRABALHO_FINAL');                 // Final project image

  console.log(`  Found ${allDocs.length} total docs, selected ${targetDocs.length} for test:`);
  for (const d of targetDocs) {
    console.log(`    - ${d.filename} (${(d.sizeBytes/1024).toFixed(1)}KB) [${d.id}]`);
  }

  const attachedDocuments = targetDocs.map(d => ({
    id: d.id,
    name: d.filename,
    type: d.mimeType.includes('pdf') ? 'pdf' :
          d.mimeType.includes('presentation') ? 'pptx' :
          d.mimeType.includes('image') ? 'image' : 'other',
  }));
  const documentIds = targetDocs.map(d => d.id);

  // 3. Run queries
  console.log('\n[3/4] Running 40 queries sequentially...\n');
  let conversationId = null;
  const results = [];
  const grades = [];
  let retryCount = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const queryNum = i + 1;
    process.stdout.write(`  Q${String(queryNum).padStart(2,'0')}: ${query.substring(0, 60).padEnd(60)}  `);

    const startTime = Date.now();
    let result;
    let retried = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const body = {
          message: query,
          language: 'pt',
          attachedDocuments,
          documentIds,
        };
        if (conversationId) body.conversationId = conversationId;

        result = await streamChat(body);

        if (!result.conversationId && !conversationId) {
          // Fallback: try non-streaming
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
          retried = true;
          retryCount++;
          console.log(`RETRY (${errorDetail})`);
          await sleep(3000);
        } else {
          result = {
            fullText: '',
            sources: [],
            error: errorDetail,
            answerMode: null,
            conversationId,
            truncated: false,
            events: [],
          };
        }
      }
    }

    const latency = Date.now() - startTime;
    const textLen = (result.fullText || '').length;
    const srcCount = (result.sources || []).length;

    results.push({
      queryNum,
      query,
      assistantText: result.fullText || '',
      sources: result.sources || [],
      sourceDocNames: (result.sources || []).map(s => s.title || s.id || 'unknown'),
      answerMode: result.answerMode,
      truncated: result.truncated || false,
      latencyMs: latency,
      conversationId: result.conversationId || conversationId,
      retried,
      error: result.error || null,
      eventCount: result.eventCount || 0,
      sourceDocIds: (result.sources || []).map(extractSourceDocumentId).filter(Boolean),
      });

    const grade = gradeResult(i, query, result, { allowedDocIds: documentIds });
    grades.push(grade);

    const statusIcon = grade.status === 'PASS' ? '✓' : grade.status === 'PARTIAL' ? '△' : '✗';
    console.log(`${statusIcon} ${grade.status.padEnd(7)} ${grade.score}/100  ${latency}ms  ${textLen}ch  ${srcCount}src  ${grade.issues.length > 0 ? grade.issues.join(', ') : 'OK'}`);

    // Realistic pacing
    await sleep(1500);
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
  const wrongDocCount = grades.filter((g) => g.outOfScopeDocIds.length > 0).length;
  const strictDocsetViolations = grades
    .filter((g) => g.outOfScopeDocIds.length > 0)
    .map((g) => ({
      queryNum: g.queryNum,
      outOfScopeDocIds: g.outOfScopeDocIds,
      sourceDocIds: g.sourceDocIds,
    }));
  const langIssues = grades.filter(g => g.issues.includes('LANGUAGE_NOT_PORTUGUESE')).length;

  // Count recurring issues
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
      totalQueries: 40,
      conversationId,
      documentsAttached: targetDocs.map(d => ({ id: d.id, name: d.filename })),
      retryIncidents: retryCount,
      strictDocsetLock: STRICT_DOCSET_LOCK,
    },
    results,
    grades,
    aggregate: {
      averageScore: parseFloat(avgScore),
      pass: passCount,
      partial: partialCount,
      fail: failCount,
      missingSources,
      missingSourcesRate: ((missingSources / 40) * 100).toFixed(1) + '%',
      wrongDocRate: ((wrongDocCount / 40) * 100).toFixed(1) + '%',
      wrongDocCount,
      truncationIncidence: truncatedCount,
      truncationRate: ((truncatedCount / 40) * 100).toFixed(1) + '%',
      languageIssues: langIssues,
    },
    strictDocsetViolations,
    topIssues: topIssues.slice(0, 10),
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'queries-40-run.json'), JSON.stringify(jsonReport, null, 2));
  console.log('  Saved: frontend/e2e/reports/queries-40-run.json');

  const strictSummary = {
    generatedAt: new Date().toISOString(),
    strictDocsetLock: STRICT_DOCSET_LOCK,
    passed:
      parseFloat(avgScore) >= 90 &&
      failCount === 0 &&
      missingSources === 0 &&
      wrongDocCount === 0 &&
      truncatedCount === 0 &&
      langIssues === 0,
    metrics: {
      averageScore: parseFloat(avgScore),
      passCount,
      failCount,
      missingSources,
      wrongDocCount,
      truncatedCount,
      langIssues,
      retryCount,
    },
    strictDocsetViolations,
  };
  fs.writeFileSync(
    path.join(REPORTS_DIR, 'strict-query-summary.json'),
    JSON.stringify(strictSummary, null, 2),
  );
  console.log('  Saved: frontend/e2e/reports/strict-query-summary.json');

  // ── Save Markdown report ──
  let md = `# 40-Query Regression Grading Report\n\n`;
  md += `**Date:** ${new Date().toISOString()}  \n`;
  md += `**Account:** ${LOGIN_EMAIL}  \n`;
  md += `**API Base:** ${BASE}  \n`;
  md += `**Conversation ID:** ${conversationId}  \n`;
  md += `**Documents Attached:** ${targetDocs.map(d => d.filename).join(', ')}  \n\n`;

  md += `## Summary Table\n\n`;
  md += `| # | Query (truncated) | Status | Score | Issues |\n`;
  md += `|---|---|---|---|---|\n`;
  for (const g of grades) {
    const qShort = g.query.length > 55 ? g.query.substring(0, 52) + '...' : g.query;
    md += `| ${g.queryNum} | ${qShort} | ${g.status} | ${g.score} | ${g.issues.join('; ') || 'OK'} |\n`;
  }

  md += `\n## Overall Metrics\n\n`;
  md += `| Metric | Value |\n`;
  md += `|---|---|\n`;
  md += `| Aggregate Score | **${avgScore}/100** |\n`;
  md += `| PASS | ${passCount}/40 |\n`;
  md += `| PARTIAL | ${partialCount}/40 |\n`;
  md += `| FAIL | ${failCount}/40 |\n`;
  md += `| Missing Sources Rate | ${jsonReport.aggregate.missingSourcesRate} (${missingSources}/40) |\n`;
  md += `| Wrong-Doc Rate | ${jsonReport.aggregate.wrongDocRate} |\n`;
  md += `| Wrong-Doc Count | ${wrongDocCount}/40 |\n`;
  md += `| Truncation Incidence | ${truncatedCount}/40 (${jsonReport.aggregate.truncationRate}) |\n`;
  md += `| Language Issues | ${langIssues}/40 |\n`;
  md += `| Retry Incidents | ${retryCount} |\n`;

  md += `\n## Top Recurring Failure Patterns\n\n`;
  md += `| # | Issue | Count | Suspected Root Cause |\n`;
  md += `|---|---|---|---|\n`;
  const rootCauses = {
    'NO_SOURCES': 'retrievalEngine.service.ts — evidence gate not returning sources or SSE sources event not emitted',
    'LANGUAGE_NOT_PORTUGUESE': 'chatLanguage.service.ts — language detection/enforcement failing; check language param propagation',
    'EMPTY_OR_MINIMAL_RESPONSE': 'ChatRuntimeOrchestrator.ts — pipeline abort or LLM timeout; check llmGateway.service.ts',
    'MISSING_BULLET_FORMAT': 'system_base.any.json or responseContractEnforcer.service.ts — format instructions not applied',
    'MISSING_TABLE_FORMAT': 'responseContractEnforcer.service.ts — table formatting not enforced',
    'INSUFFICIENT_FLASHCARDS': 'responseContractEnforcer.service.ts — completeness check not enforced for structured outputs',
    'MISSING_SWOT_STRUCTURE': 'system_base.any.json — SWOT template not in prompt bank',
    'MISSING_MATRIX_FORMAT': 'responseContractEnforcer.service.ts — matrix/table format not enforced',
    'TRUNCATED': 'tokenBudget.service.ts — budget too aggressive or truncationClassifier cutting early',
  };
  for (let i = 0; i < Math.min(10, topIssues.length); i++) {
    const [issue, count] = topIssues[i];
    md += `| ${i + 1} | ${issue} | ${count} | ${rootCauses[issue] || 'Needs investigation'} |\n`;
  }

  md += `\n## Top 10 Fixes Prioritized by Impact\n\n`;
  const fixes = topIssues.slice(0, 10).map(([issue, count], i) => ({
    rank: i + 1,
    issue,
    count,
    impact: count * (issue.includes('SOURCE') ? 15 : issue.includes('EMPTY') ? 50 : issue.includes('LANGUAGE') ? 10 : 5),
    fix: rootCauses[issue] || 'Investigate further',
  })).sort((a, b) => b.impact - a.impact);

  for (const f of fixes) {
    md += `${f.rank}. **${f.issue}** (${f.count}x, impact score: ${f.impact})\n`;
    md += `   - Root cause: ${f.fix}\n\n`;
  }

  md += `## Go/No-Go for Frontend Testing\n\n`;
  const goNoGo = strictSummary.passed;
  md += goNoGo
    ? `**GO** — Strict gates passed (score>=90, fail=0, missing-sources=0, wrong-doc=0, truncation=0, language=0).\n`
    : `**NO-GO** — Strict frontend-readiness gates failed. Investigate blocking metrics above.\n`;

  md += `\n### Blocking Issues\n\n`;
  if (failCount > 0) {
    md += `- ${failCount} queries failed (strict threshold: 0)\n`;
  }
  if (missingSources > 0) {
    md += `- ${missingSources} queries missing sources (strict threshold: 0)\n`;
  }
  if (langIssues > 0) {
    md += `- ${langIssues} language consistency issues (strict threshold: 0)\n`;
  }
  if (truncatedCount > 0) {
    md += `- ${truncatedCount} queries with truncation (strict threshold: 0)\n`;
  }
  if (wrongDocCount > 0) {
    md += `- ${wrongDocCount} queries cited out-of-scope documents (strict threshold: 0)\n`;
  }

  if (strictDocsetViolations.length > 0) {
    md += `\n### Strict Docset Violations\n\n`;
    md += `| Query # | Out-of-scope doc IDs |\n`;
    md += `|---|---|\n`;
    for (const violation of strictDocsetViolations) {
      md += `| ${violation.queryNum} | ${violation.outOfScopeDocIds.join(', ')} |\n`;
    }
  }

  fs.writeFileSync(path.join(REPORTS_DIR, 'queries-40-grading.md'), md);
  console.log('  Saved: frontend/e2e/reports/queries-40-grading.md');

  console.log('\n=== RESULTS ===');
  console.log(`  Score:    ${avgScore}/100`);
  console.log(`  PASS:     ${passCount}/40`);
  console.log(`  PARTIAL:  ${partialCount}/40`);
  console.log(`  FAIL:     ${failCount}/40`);
  console.log(`  Sources:  ${missingSources} missing (${jsonReport.aggregate.missingSourcesRate})`);
  console.log(`  WrongDoc: ${wrongDocCount}`);
  console.log(`  Truncated:${truncatedCount}`);
  console.log(`  Language: ${langIssues} issues`);
  console.log(`  Retries:  ${retryCount}`);
  console.log(`  Verdict:  ${goNoGo ? 'GO ✓' : 'NO-GO ✗'}`);

  if (STRICT_DOCSET_LOCK && wrongDocCount > 0) {
    console.error(`\nStrict docset lock failed: ${wrongDocCount} query(ies) cited out-of-scope sources.`);
    process.exitCode = 1;
  }
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
