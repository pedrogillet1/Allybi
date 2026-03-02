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
const START_INDEX = Math.max(1, Number(arg('--start-index', '1')) || 1);
const MAX_QUERIES = Math.max(0, Number(arg('--max-queries', '0')) || 0);
const INITIAL_CONVERSATION_ID = String(arg('--conversation-id', '') || '').trim() || null;
const APPEND_MODE = process.argv.includes('--append');
const QUIET = process.argv.includes('--quiet');
const REQUIRE_DOCUMENTS = String(
  arg('--require-documents', process.env.E2E_REQUIRE_DOCUMENTS || ''),
).trim().toLowerCase();

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
      let attachments = [];
      let answerMode = null;
      let metadata = {};
      let status = null;
      let failureCode = null;
      let fallbackReasonCode = null;
      let truncation = null;
      let evidence = null;
      let traceId = null;
      let conversationId = null;
      let assistantTelemetry = null;
      let streamError = null;

      res.on('data', (chunk) => {
        raw += chunk.toString();
        const lines = raw.split('\n');
        raw = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.replace(/^data:\s?/, ''));
            events.push(evt);
            if (evt.type === 'delta' && evt.text) fullText += evt.text;
            if (evt.type === 'sources' && Array.isArray(evt.sources)) sources = evt.sources;
            if (evt.type === 'meta' && evt.answerMode) answerMode = evt.answerMode;
            if (evt.type === 'error' && evt.message) {
              streamError = String(evt.message);
              if (!fullText) fullText = streamError;
              status = status || 'failed';
            }
            if (evt.type === 'final') {
              // Final event is authoritative — override deltas even when text is empty
              if ('content' in evt) fullText = evt.content || '';
              else if ('assistantText' in evt) fullText = evt.assistantText || '';
              else if ('text' in evt) fullText = evt.text || '';
              // When backend signals failure with no text, don't keep streamed deltas
              if (evt.failureCode && !fullText) fullText = '';
              if (Array.isArray(evt.sources)) sources = evt.sources;
              if (Array.isArray(evt.attachments)) attachments = evt.attachments;
              if (evt.answerMode) answerMode = evt.answerMode;
              if (evt.metadata) metadata = evt.metadata;
              if (evt.status) status = evt.status;
              if (evt.failureCode) failureCode = evt.failureCode;
              if (evt.fallbackReasonCode) fallbackReasonCode = evt.fallbackReasonCode;
              if (evt.truncation) truncation = evt.truncation;
              if (evt.evidence) evidence = evt.evidence;
              if (evt.traceId) traceId = evt.traceId;
              if (evt.conversationId) conversationId = evt.conversationId;
              if (evt.assistantTelemetry && typeof evt.assistantTelemetry === 'object') {
                assistantTelemetry = evt.assistantTelemetry;
              }
            }
          } catch {}
        }
      });

      res.on('end', () => {
        const sourcesFromAttachments = (() => {
          if (!Array.isArray(attachments)) return [];
          const sourceButtons = attachments.find(
            (a) => a && typeof a === 'object' && a.type === 'source_buttons' && Array.isArray(a.buttons),
          );
          if (!sourceButtons) return [];
          return sourceButtons.buttons
            .map((btn) => {
              if (!btn || typeof btn !== 'object') return null;
              const location = btn.location && typeof btn.location === 'object' ? btn.location : null;
              const locationType = String(location?.type || '').toLowerCase();
              const locationValue = location?.value;
              const item = {
                documentId: String(btn.documentId || btn.docId || btn.id || '').trim() || null,
                filename: String(btn.title || btn.filename || 'Document').trim(),
                mimeType: btn.mimeType || null,
                page: null,
              };
              if (locationType === 'page' && Number.isFinite(Number(locationValue))) {
                item.page = Number(locationValue);
              }
              if (locationType === 'sheet' && String(locationValue || '').trim()) {
                item.sheet = String(locationValue || '').trim();
              }
              if (locationType === 'slide' && Number.isFinite(Number(locationValue))) {
                item.slide = Number(locationValue);
              }
              return item.documentId ? item : null;
            })
            .filter(Boolean);
        })();
        const effectiveSources =
          Array.isArray(sources) && sources.length > 0
            ? sources
            : sourcesFromAttachments;
        resolve({
          httpStatus: res.statusCode || 0,
          error: streamError,
          fullText,
          sources: effectiveSources,
          attachments,
          answerMode,
          metadata,
          status,
          failureCode,
          fallbackReasonCode,
          truncation,
          evidence,
          traceId,
          assistantTelemetry,
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

function normalizeDocTarget(target) {
  if (!target || typeof target !== 'object') return null;
  const id = String(target.id || target.documentId || '').trim();
  const filename = String(target.filename || target.name || '').trim();
  const alias = String(target.alias || target.key || '').trim();
  if (!id && !filename && !alias) return null;
  return { id, filename, alias };
}

function shouldRequireDocuments(packFile, explicitFlag) {
  if (explicitFlag === '1' || explicitFlag === 'true' || explicitFlag === 'yes') {
    return true;
  }
  if (explicitFlag === '0' || explicitFlag === 'false' || explicitFlag === 'no') {
    return false;
  }
  // Default strict mode for curated human-style packs.
  return /allybi-human-style/i.test(String(packFile || ''));
}

async function main() {
  const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  const allQueryRows = Array.isArray(pack.queries) ? pack.queries : [];
  if (allQueryRows.length === 0) throw new Error(`No queries in ${PACK_FILE}`);
  if (START_INDEX > allQueryRows.length) {
    throw new Error(
      `--start-index ${START_INDEX} out of range for ${allQueryRows.length} queries in ${PACK_FILE}`,
    );
  }
  const startOffset = START_INDEX - 1;
  const queryRows = MAX_QUERIES > 0
    ? allQueryRows.slice(startOffset, startOffset + MAX_QUERIES)
    : allQueryRows.slice(startOffset);
  if (queryRows.length === 0) {
    throw new Error(
      `No queries selected after slicing with --start-index ${START_INDEX} --max-queries ${MAX_QUERIES}`,
    );
  }
  const requireDocuments = shouldRequireDocuments(PACK_FILE, REQUIRE_DOCUMENTS);
  const docTargets = Array.isArray(pack.documents)
    ? pack.documents.map(normalizeDocTarget).filter(Boolean)
    : [];
  if (requireDocuments && docTargets.length === 0) {
    throw new Error(
      `Pack ${PACK_FILE} must define at least one document target (id + filename recommended).`,
    );
  }

  const loginRes = await requestJson('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (loginRes.status !== 200) throw new Error(`Login failed HTTP ${loginRes.status}: ${loginRes.raw}`);
  if (loginRes.json?.accessToken) SESSION.at = loginRes.json.accessToken;
  if (loginRes.json?.refreshToken) SESSION.rt = loginRes.json.refreshToken;

  const readinessDeadline = Date.now() + Math.max(0, READY_WAIT_MS);
  let resolvedDocs = [];
  while (true) {
    const docsRes = await requestJson('GET', '/api/documents?limit=1000');
    if (docsRes.status !== 200) {
      // Localhost fallback: if pack is id-pinned, proceed without list endpoint.
      // Some local DBs contain legacy enum data that can break /api/documents listing.
      const allTargetsHaveIds = docTargets.length > 0 && docTargets.every((t) => t.id);
      if (!allTargetsHaveIds) {
        throw new Error(`Documents list failed HTTP ${docsRes.status}`);
      }
      console.warn(
        `[run-query-pack] warning: /api/documents failed HTTP ${docsRes.status}; using id-only fallback for attachedDocuments`,
      );
      resolvedDocs = docTargets.map((target) => ({
        id: target.id,
        name: target.filename || target.alias || target.id,
        type: 'application/octet-stream',
        status: 'ready',
        chunkCount: null,
      }));
      break;
    }
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
    for (const target of docTargets) {
      let match = null;
      if (target.id) {
        match = availableDocs.find((d) => d.id === target.id) || null;
        if (!match) {
          throw new Error(
            `Required document id not found for pack target: ${target.id} (${target.filename || target.alias || 'unnamed'})`,
          );
        }
      } else {
        const needle = normalizeName(target.filename || target.alias);
        const candidates = availableDocs.filter((d) => {
          const normalized = normalizeName(d.name);
          return normalized === needle ||
            normalized.includes(needle) ||
            needle.includes(normalized);
        });
        if (candidates.length === 0) {
          throw new Error(
            `Required document not found for pack target: ${target.filename || target.alias}`,
          );
        }
        if (candidates.length > 1) {
          const names = candidates.slice(0, 5).map((c) => `${c.name} (${c.id})`).join(', ');
          throw new Error(
            `Ambiguous document target "${target.filename || target.alias}" matched ${candidates.length} docs. Add explicit id. Candidates: ${names}`,
          );
        }
        match = candidates[0];
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
  if (!QUIET) {
    console.log(
      `Resolved ${resolvedDocs.length} attached documents for ${queryRows.length} queries (from index ${START_INDEX} of ${allQueryRows.length}).`,
    );
  }

  let conversationId = INITIAL_CONVERSATION_ID;
  const resultsByIndex = new Map();
  if (APPEND_MODE && fs.existsSync(OUT_FILE)) {
    const previous = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    const prevRows = Array.isArray(previous?.results) ? previous.results : [];
    for (const row of prevRows) {
      const idx = Number(row?.index);
      if (Number.isFinite(idx) && idx > 0) resultsByIndex.set(idx, row);
    }
    if (!conversationId) {
      conversationId = String(
        previous?.meta?.conversationId ||
        prevRows
          .slice()
          .reverse()
          .find((r) => r?.conversationId)?.conversationId ||
        '',
      ).trim() || null;
    }
  }
  const chunkResults = [];
  for (let idx = 0; idx < queryRows.length; idx += 1) {
    const q = queryRows[idx];
    const globalIndex = startOffset + idx + 1;
    if (!QUIET) {
      process.stdout.write(`Q${String(globalIndex).padStart(3, '0')}/${allQueryRows.length} [${q.language}] ... `);
    }
    const start = Date.now();
    const preferredLanguage = q.language || 'pt';
    let response;
    try {
      response = await streamChat({
        message: q.text,
        preferredLanguage,
        language: preferredLanguage,
        locale: preferredLanguage,
        attachedDocuments: resolvedDocs,
        documentIds,
        ...(conversationId ? { conversationId } : {}),
      });
    } catch (error) {
      response = { httpStatus: 0, error: error instanceof Error ? error.message : String(error), fullText: '', sources: [], answerMode: null, metadata: {}, events: [] };
    }

    if (response.conversationId) conversationId = response.conversationId;
    const responseMetadata =
      response.metadata && typeof response.metadata === 'object'
        ? response.metadata
        : {};
    const rawTelemetry =
      response.assistantTelemetry &&
      typeof response.assistantTelemetry === 'object'
        ? response.assistantTelemetry
        : responseMetadata.telemetry &&
          typeof responseMetadata.telemetry === 'object'
          ? responseMetadata.telemetry
          : null;
    const assistantTelemetry = rawTelemetry
      ? {
          provider: typeof rawTelemetry.provider === 'string' ? rawTelemetry.provider : null,
          model: typeof rawTelemetry.model === 'string' ? rawTelemetry.model : null,
          finishReason:
            typeof rawTelemetry.finishReason === 'string' ? rawTelemetry.finishReason : null,
          promptType: typeof rawTelemetry.promptType === 'string' ? rawTelemetry.promptType : null,
          requestedMaxOutputTokens:
            Number.isFinite(Number(rawTelemetry.requestedMaxOutputTokens))
              ? Number(rawTelemetry.requestedMaxOutputTokens)
              : null,
          usage:
            rawTelemetry.usage && typeof rawTelemetry.usage === 'object'
              ? {
                  promptTokens: Number.isFinite(Number(rawTelemetry.usage.promptTokens))
                    ? Number(rawTelemetry.usage.promptTokens)
                    : null,
                  completionTokens: Number.isFinite(Number(rawTelemetry.usage.completionTokens))
                    ? Number(rawTelemetry.usage.completionTokens)
                    : null,
                  totalTokens: Number.isFinite(Number(rawTelemetry.usage.totalTokens))
                    ? Number(rawTelemetry.usage.totalTokens)
                    : null,
                }
              : null,
        }
      : null;

    const row = {
      index: globalIndex,
      query: q.text,
      expectedLanguage: q.language || 'pt',
      queryType: q.type || null,
      queryTargets: q.targets || [],
      response: String(response.fullText || '').trim(),
      assistantTelemetry,
      conversationId: conversationId || null,
      sources: Array.isArray(response.sources) ? response.sources : [],
      attachments: Array.isArray(response.attachments) ? response.attachments : [],
      answerMode: response.answerMode || null,
      truncation: response.truncation || (Boolean(responseMetadata?.truncation?.occurred || responseMetadata?.truncated === true) ? responseMetadata?.truncation || { occurred: true } : null),
      failureCode: response.failureCode || responseMetadata?.failureCode || null,
      fallbackReasonCode: response.fallbackReasonCode || responseMetadata?.fallbackReasonCode || null,
      responseStatus: response.status || responseMetadata?.status || null,
      traceId: response.traceId || responseMetadata?.traceId || null,
      evidence: response.evidence || responseMetadata?.evidence || null,
      status: response.error || response.httpStatus >= 400 ? 'error' : 'ok',
      errorDetail: response.error || null,
      durationMs: Date.now() - start,
      transport: {
        httpStatus: response.httpStatus || null,
        requestId: null,
        errorBody: response.error || null,
      },
    };
    chunkResults.push(row);
    resultsByIndex.set(row.index, row);
    if (!QUIET) {
      process.stdout.write(`${row.status.toUpperCase()} (${row.durationMs}ms)\n`);
    }

    const mergedResults = [...resultsByIndex.values()].sort((a, b) => Number(a.index) - Number(b.index));
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({
      meta: {
        generatedAt: new Date().toISOString(),
        packFile: PACK_FILE,
        base: BASE,
        account: EMAIL,
        documentsAttached: resolvedDocs,
        totalQueries: allQueryRows.length,
        selectedStartIndex: START_INDEX,
        selectedCount: queryRows.length,
        conversationId: conversationId || null,
        appendMode: APPEND_MODE,
      },
      results: mergedResults,
    }, null, 2));
  }

  const chunkErrors = chunkResults.filter((r) => r.status !== 'ok').length;
  if (!QUIET) {
    console.log(
      `Completed chunk. ok=${chunkResults.length - chunkErrors} error=${chunkErrors} output=${OUT_FILE} conversationId=${conversationId || 'none'}`,
    );
  }
  if (chunkErrors > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
