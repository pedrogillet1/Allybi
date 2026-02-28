#!/usr/bin/env node
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] || fallback;
}

const BASE = String(arg('--base', process.env.E2E_API_BASE_URL || process.env.REACT_APP_API_URL || 'http://localhost:3000')).replace(/\/+$/, '');
const EMAIL = String(arg('--email', process.env.E2E_TEST_EMAIL || 'test@allybi.com'));
const PASSWORD = String(arg('--password', process.env.E2E_TEST_PASSWORD || 'test123'));
const PACK_FILE = String(arg('--pack', 'frontend/e2e/query-packs/test1-bilingual-100.json'));
const OUT_FILE = String(arg('--out', 'frontend/e2e/reports/test1-bilingual-100-results.json'));
const WAIT_MS = Number(arg('--wait-ms', '180000'));
const READY_WAIT_MS = Number(arg('--wait-ready-ms', '90000'));
const READY_POLL_MS = Number(arg('--ready-poll-ms', '3000'));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const httpAgent = new http.Agent();
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

function requestJson(method, urlPath, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = transport.request(url, {
      method,
      agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
      headers: {
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...(SESSION.csrf ? { 'x-csrf-token': SESSION.csrf } : {}),
        ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
        ...extraHeaders,
      },
    }, (res) => {
      captureCookies(res);
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode || 0, headers: res.headers, json: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
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
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        accept: 'text/event-stream',
        ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
        ...(SESSION.csrf ? { 'x-csrf-token': SESSION.csrf } : {}),
      },
    }, (res) => {
      captureCookies(res);
      const contentType = String(res.headers['content-type'] || '');
      if (res.statusCode !== 200 || !contentType.includes('text/event-stream')) {
        let err = '';
        res.on('data', (c) => { err += c; });
        res.on('end', () => resolve({ httpStatus: res.statusCode || 0, error: err || `HTTP ${res.statusCode}`, fullText: '', sources: [], answerMode: null, metadata: {}, events: [] }));
        return;
      }

      let raw = '';
      const events = [];
      let fullText = '';
      let sources = [];
      let answerMode = null;
      let metadata = {};
      let status = null;
      let failureCode = null;
      let fallbackReasonCode = null;
      let truncation = null;
      let evidence = null;
      let traceId = null;
      let conversationId = null;

      res.on('data', (chunk) => {
        raw += chunk.toString();
        const lines = raw.split('\n');
        raw = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            events.push(evt);
            if (evt.type === 'delta' && evt.text) fullText += evt.text;
            if (evt.type === 'sources' && Array.isArray(evt.sources)) sources = evt.sources;
            if (evt.type === 'meta' && evt.answerMode) answerMode = evt.answerMode;
            if (evt.type === 'final') {
              if (evt.content) fullText = evt.content;
              else if (evt.assistantText) fullText = evt.assistantText;
              if (Array.isArray(evt.sources)) sources = evt.sources;
              if (evt.answerMode) answerMode = evt.answerMode;
              if (evt.metadata) metadata = evt.metadata;
              if (evt.status) status = evt.status;
              if (evt.failureCode) failureCode = evt.failureCode;
              if (evt.fallbackReasonCode) fallbackReasonCode = evt.fallbackReasonCode;
              if (evt.truncation) truncation = evt.truncation;
              if (evt.evidence) evidence = evt.evidence;
              if (evt.traceId) traceId = evt.traceId;
              if (evt.conversationId) conversationId = evt.conversationId;
            }
          } catch {}
        }
      });

      res.on('end', () => {
        resolve({
          httpStatus: res.statusCode || 0,
          error: null,
          fullText,
          sources,
          answerMode,
          metadata,
          status,
          failureCode,
          fallbackReasonCode,
          truncation,
          evidence,
          traceId,
          events,
          conversationId,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(WAIT_MS, () => req.destroy(new Error(`Timeout ${WAIT_MS}ms`)));
    req.write(payload);
    req.end();
  });
}

function normalizeName(v) {
  return String(v || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function docsFromResponse(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.documents)) return json.documents;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.data?.items)) return json.data.items;
  if (Array.isArray(json.data?.documents)) return json.data.documents;
  return [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function inferChunkCount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const direct = [
    raw.chunkCount,
    raw.chunksCount,
    raw.indexedChunks,
    raw.totalChunks,
    raw.textChunkCount,
    raw.chunk_count,
    raw.chunks_count,
  ];
  for (const value of direct) {
    const n = toPositiveInt(value);
    if (n !== null) return n;
  }

  const nested = [
    raw.processing?.chunkCount,
    raw.processing?.chunksCount,
    raw.metrics?.chunkCount,
    raw.metrics?.chunksCount,
    raw.stats?.chunkCount,
    raw.stats?.chunksCount,
  ];
  for (const value of nested) {
    const n = toPositiveInt(value);
    if (n !== null) return n;
  }

  if (Array.isArray(raw.chunks)) return raw.chunks.length;
  return null;
}

function isReadyStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return (
    value === 'ready' ||
    value === 'completed' ||
    value === 'available' ||
    value === 'indexed' ||
    value === 'enriching'
  );
}

function validateResolvedDocsReadiness(resolvedDocs) {
  const issues = [];
  for (const doc of resolvedDocs) {
    if (!isReadyStatus(doc.status)) {
      issues.push(`${doc.name} (${doc.id}) status=${doc.status || 'unknown'}`);
      continue;
    }
    if (doc.chunkCount !== null && doc.chunkCount <= 0) {
      issues.push(`${doc.name} (${doc.id}) ready-without-chunks chunkCount=${doc.chunkCount}`);
    }
  }
  return issues;
}

async function main() {
  const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  const queryRows = Array.isArray(pack.queries) ? pack.queries : [];
  if (queryRows.length === 0) throw new Error(`No queries in ${PACK_FILE}`);

  const loginRes = await requestJson('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (loginRes.status !== 200) throw new Error(`Login failed HTTP ${loginRes.status}: ${loginRes.raw}`);
  if (loginRes.json?.accessToken) SESSION.at = loginRes.json.accessToken;
  if (loginRes.json?.refreshToken) SESSION.rt = loginRes.json.refreshToken;

  const readinessDeadline = Date.now() + Math.max(0, READY_WAIT_MS);
  let resolvedDocs = [];
  while (true) {
    const docsRes = await requestJson('GET', '/api/documents?limit=1000');
    if (docsRes.status !== 200) throw new Error(`Documents list failed HTTP ${docsRes.status}`);
    const availableDocs = docsFromResponse(docsRes.json)
      .map((d) => ({
        id: String(d.id || d.docId || d.documentId || '').trim(),
        name: String(d.filename || d.name || d.title || '').trim(),
        status: String(d.status || '').toLowerCase(),
        mimeType: String(d.mimeType || d.type || 'application/octet-stream'),
        chunkCount: inferChunkCount(d),
      }))
      .filter((d) => d.id && d.name);

    const nextResolved = [];
    for (const target of pack.documents || []) {
      const needle = normalizeName(target.filename || target.alias || target.key);
      const match = availableDocs.find((d) => normalizeName(d.name) === needle) ||
        availableDocs.find((d) => normalizeName(d.name).includes(needle) || needle.includes(normalizeName(d.name)));
      if (!match) {
        throw new Error(`Required document not found for pack target: ${target.filename || target.alias || target.key}`);
      }
      if (!nextResolved.find((d) => d.id === match.id)) {
        nextResolved.push({
          id: match.id,
          name: match.name,
          type: match.mimeType,
          status: match.status,
          chunkCount: match.chunkCount,
        });
      }
    }

    resolvedDocs = nextResolved;
    const issues = validateResolvedDocsReadiness(resolvedDocs);
    if (issues.length === 0) break;
    if (Date.now() >= readinessDeadline) {
      throw new Error(`Attached docs not ready/indexed:\n- ${issues.join('\n- ')}`);
    }
    await sleep(Math.max(250, READY_POLL_MS));
  }

  const documentIds = resolvedDocs.map((d) => d.id);
  console.log(`Resolved ${resolvedDocs.length} attached documents for ${queryRows.length} queries.`);

  let conversationId = null;
  const results = [];
  for (let idx = 0; idx < queryRows.length; idx += 1) {
    const q = queryRows[idx];
    process.stdout.write(`Q${String(idx + 1).padStart(3, '0')}/${queryRows.length} [${q.language}] ... `);
    const start = Date.now();
    let response;
    try {
      response = await streamChat({
        message: q.text,
        language: q.language || 'pt',
        attachedDocuments: resolvedDocs,
        documentIds,
        ...(conversationId ? { conversationId } : {}),
      });
    } catch (error) {
      response = { httpStatus: 0, error: error instanceof Error ? error.message : String(error), fullText: '', sources: [], answerMode: null, metadata: {}, events: [] };
    }

    if (response.conversationId) conversationId = response.conversationId;

    const row = {
      index: idx + 1,
      query: q.text,
      expectedLanguage: q.language || 'pt',
      queryType: q.type || null,
      queryTargets: q.targets || [],
      response: String(response.fullText || '').trim(),
      sources: Array.isArray(response.sources) ? response.sources : [],
      answerMode: response.answerMode || null,
      truncation: response.truncation || (Boolean(response.metadata?.truncation?.occurred || response.metadata?.truncated === true) ? response.metadata?.truncation || { occurred: true } : null),
      failureCode: response.failureCode || response.metadata?.failureCode || null,
      fallbackReasonCode: response.fallbackReasonCode || response.metadata?.fallbackReasonCode || null,
      responseStatus: response.status || response.metadata?.status || null,
      traceId: response.traceId || response.metadata?.traceId || null,
      evidence: response.evidence || response.metadata?.evidence || null,
      status: response.error || response.httpStatus >= 400 ? 'error' : 'ok',
      errorDetail: response.error || null,
      durationMs: Date.now() - start,
      transport: {
        httpStatus: response.httpStatus || null,
        requestId: null,
        errorBody: response.error || null,
      },
    };
    results.push(row);
    process.stdout.write(`${row.status.toUpperCase()} (${row.durationMs}ms)\n`);

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({
      meta: {
        generatedAt: new Date().toISOString(),
        packFile: PACK_FILE,
        base: BASE,
        account: EMAIL,
        documentsAttached: resolvedDocs,
        totalQueries: queryRows.length,
      },
      results,
    }, null, 2));
  }

  const errors = results.filter((r) => r.status !== 'ok').length;
  console.log(`Completed. ok=${results.length - errors} error=${errors} output=${OUT_FILE}`);
  if (errors > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
