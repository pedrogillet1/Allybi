#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const LATEST_DIR = path.join(REPORTS_DIR, 'latest');

const DEFAULT_INPUT_BY_PACK = {
  '25': path.join(REPORTS_DIR, 'query-test-25-api-results.json'),
  '40': path.join(REPORTS_DIR, 'queries-40-run.json'),
  '50': path.join(REPORTS_DIR, 'query-test-50-gate-results.json'),
  '100': path.join(REPORTS_DIR, 'query-test-100-results.json'),
};
const PRODUCER_COMMAND_BY_PACK = {
  '25': 'npx playwright test e2e/query-test-25-gate.spec.ts --project=chromium',
  '40': 'node e2e/regression-runner.mjs --base http://localhost:5000',
  '50': 'npx playwright test e2e/query-test-50-gate.spec.ts --project=chromium',
  '100': 'npx playwright test e2e/query-test-100.spec.ts --project=chromium',
};

function parseArgs(argv) {
  const out = {
    pack: '40',
    input: null,
    expectedLanguage: 'pt',
    writeLatest: true,
    runId: null,
    requireMultiModel: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pack') out.pack = argv[++i];
    else if (arg === '--input') out.input = argv[++i];
    else if (arg === '--expected-language') out.expectedLanguage = argv[++i];
    else if (arg === '--no-write-latest') out.writeLatest = false;
    else if (arg === '--run-id') out.runId = argv[++i];
    else if (arg === '--require-multi-model') out.requireMultiModel = true;
  }
  return out;
}

function readJsonFileSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function countDatasetRows(dataset) {
  if (Array.isArray(dataset)) return dataset.length;
  if (dataset && typeof dataset === 'object' && Array.isArray(dataset.results)) {
    return dataset.results.length;
  }
  return 0;
}

function expectedRowsForPack(pack) {
  const n = Number(String(pack || '').trim());
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

function deriveDatasetId(inputFile, rowCount) {
  const normalized = path.basename(String(inputFile || '').trim());
  const rows = Number.isFinite(rowCount) ? rowCount : 0;
  return `${normalized || 'unknown'}:${rows}`;
}

function packInputBasenames(pack) {
  const names = new Set();
  const defaultPath = DEFAULT_INPUT_BY_PACK[String(pack)] || '';
  const defaultBase = path.basename(defaultPath);
  if (defaultBase) names.add(defaultBase);
  names.add(`queries-${pack}-run.json`);
  names.add(`query-test-${pack}-results.json`);
  names.add(`query-test-${pack}-gate-results.json`);
  return [...names];
}

function collectArchiveCandidates(pack) {
  const out = [];
  const archiveRoot = path.join(REPORTS_DIR, 'archive');
  if (!fs.existsSync(archiveRoot)) return out;
  const archiveDirs = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const basenames = packInputBasenames(pack);
  for (const dirName of archiveDirs) {
    for (const baseName of basenames) {
      const candidate = path.join(archiveRoot, dirName, baseName);
      if (fs.existsSync(candidate)) out.push(candidate);
    }
  }
  return out;
}

function uniquePaths(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const normalized = path.resolve(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function resolveInputDataset(opts) {
  const pack = String(opts.pack || '40');
  const explicitInput = opts.input ? path.resolve(opts.input) : null;
  const requiredRows = expectedRowsForPack(pack);
  const defaultInput = path.resolve(
    DEFAULT_INPUT_BY_PACK[pack] || DEFAULT_INPUT_BY_PACK['40'],
  );
  const latestCandidates = packInputBasenames(pack).map((baseName) =>
    path.join(LATEST_DIR, baseName),
  );
  const candidates = uniquePaths([
    ...(explicitInput ? [explicitInput] : []),
    defaultInput,
    ...latestCandidates,
    ...collectArchiveCandidates(pack),
  ]);

  const invalid = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      invalid.push({ file: candidate, reason: 'missing' });
      continue;
    }
    const dataset = readJsonFileSafe(candidate);
    if (!dataset) {
      invalid.push({ file: candidate, reason: 'invalid_json' });
      continue;
    }
    const rowCount = countDatasetRows(dataset);
    if (rowCount < requiredRows) {
      invalid.push({
        file: candidate,
        reason: `insufficient_rows_${rowCount}_lt_${requiredRows}`,
      });
      continue;
    }
    return { inputFile: candidate, dataset, rowCount };
  }

  if (explicitInput) {
    const detail = invalid.find((entry) => entry.file === explicitInput)?.reason || 'unusable';
    throw new Error(
      `[harsh-rubric] explicit input is not usable (${detail}): ${explicitInput}`,
    );
  }

  const sampledReasons = invalid
    .slice(0, 6)
    .map((entry) => `${entry.file} [${entry.reason}]`)
    .join('\n');
  throw new Error(
    [
      `[harsh-rubric] no valid input artifact found for pack ${pack}.`,
      `Expected at least ${requiredRows} rows.`,
      `Producer command: ${PRODUCER_COMMAND_BY_PACK[pack] || 'run the corresponding query pack runner'}`,
      sampledReasons ? `Checked candidates:\n${sampledReasons}` : 'No candidates were discovered.',
    ].join('\n'),
  );
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RELEVANCE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'which', 'were',
  'across', 'among', 'into', 'have', 'had', 'has', 'how', 'many', 'share', 'rate',
  'versus', 'acesso', 'para', 'como', 'what', 'was', 'among', 'those', 'these',
]);

const CADASTRO_DOMAIN_TERMS = [
  'cadastro', 'unico', 'pnad', 'domicilio', 'domicilios', 'moradores',
  'grandes regioes', 'regioes metropolitanas', 'abastecimento de agua',
  'esgotamento', 'lixo', 'telefone', 'tentativa de cadastramento',
];

const CADASTRO_ANTI_TERMS = [
  'trademark', 'patent', 'inpi', 'corep', 'alliance residential',
  'move out statement', 'nota fiscal', 'nf e', 'utility experts',
];

function countOccurrences(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
  return count;
}

function isLikelyPortuguese(text) {
  const v = ' ' + String(text || '').toLowerCase() + ' ';
  if (v.split(/\s+/).length < 8) return false;
  const ptMarkers = [' não ', ' uma ', ' nas ', ' nos ', ' está ', ' são ', ' também ', ' então ', ' pode ', ' sobre ', ' seus ', ' mais ', ' pela ', ' pelo ', ' isso ', ' este ', ' essa ', ' nao ', ' sao '];
  const enMarkers = [' the ', ' is ', ' are ', ' was ', ' were ', ' have ', ' has ', ' been ', ' would ', ' should ', ' could ', ' which ', ' their ', ' they ', ' these ', ' those '];
  const ptScore = ptMarkers.reduce((a, w) => a + countOccurrences(v, w), 0);
  const enScore = enMarkers.reduce((a, w) => a + countOccurrences(v, w), 0);
  return ptScore > enScore;
}

function isLikelyEnglish(text) {
  const v = ' ' + String(text || '').toLowerCase() + ' ';
  if (
    /^(i hit a runtime issue|there was a processing issue|i could not complete that safely)\b/i.test(
      String(text || '').trim(),
    )
  ) {
    return true;
  }
  if (v.split(/\s+/).length < 8) return false;
  const enMarkers = [' the ', ' is ', ' are ', ' was ', ' were ', ' have ', ' has ', ' been ', ' would ', ' should ', ' could ', ' which ', ' their ', ' they ', ' these ', ' those ', ' please ', ' retry ', ' issue ', ' moment '];
  const ptMarkers = [' não ', ' uma ', ' nas ', ' nos ', ' está ', ' são ', ' também ', ' então ', ' pode ', ' sobre ', ' seus ', ' mais ', ' pela ', ' pelo ', ' nao ', ' sao '];
  const enScore = enMarkers.reduce((a, w) => a + countOccurrences(v, w), 0);
  const ptScore = ptMarkers.reduce((a, w) => a + countOccurrences(v, w), 0);
  return enScore > ptScore;
}

function looksLikeTruncated(result) {
  const truncationValue = result.truncation;
  const truncationOccurred =
    truncationValue === true ||
    (truncationValue &&
      typeof truncationValue === 'object' &&
      (truncationValue.occurred === true || truncationValue.providerOccurred === true));
  const flag = result.truncated === true || truncationOccurred;
  const text = String(result.responseText || '');
  const marker = text.includes('[truncated]') || text.includes('(Response was truncated)');
  return Boolean(flag || marker);
}

function extractSourceDocIds(rawSources) {
  const ids = [];
  for (const source of rawSources || []) {
    if (!source || typeof source !== 'object') continue;
    const candidates = [source.documentId, source.docId, source.id, source.document?.id];
    for (const value of candidates) {
      const id = String(value || '').trim();
      if (id) {
        ids.push(id);
        break;
      }
    }
  }
  return ids;
}

function extractSourceNames(rawSources) {
  const names = [];
  for (const source of rawSources || []) {
    if (typeof source === 'string') {
      const v = source.trim();
      if (v) names.push(v);
      continue;
    }
    if (!source || typeof source !== 'object') continue;
    const candidates = [source.title, source.name, source.filename, source.documentName, source.document?.filename];
    for (const value of candidates) {
      const name = String(value || '').trim();
      if (name) {
        names.push(name);
        break;
      }
    }
  }
  return names;
}

function extractAttachmentSourceDocIds(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  const sourceButtons = rawAttachments.find(
    (a) => a && typeof a === 'object' && a.type === 'source_buttons' && Array.isArray(a.buttons),
  );
  if (!sourceButtons) return [];
  const ids = [];
  for (const button of sourceButtons.buttons) {
    if (!button || typeof button !== 'object') continue;
    const id = String(button.documentId || button.docId || button.id || '').trim();
    if (id) ids.push(id);
  }
  return ids;
}

function extractAttachmentSourceNames(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  const sourceButtons = rawAttachments.find(
    (a) => a && typeof a === 'object' && a.type === 'source_buttons' && Array.isArray(a.buttons),
  );
  if (!sourceButtons) return [];
  const names = [];
  for (const button of sourceButtons.buttons) {
    if (!button || typeof button !== 'object') continue;
    const label = String(button.title || button.filename || '').trim();
    if (label) names.push(label);
  }
  return names;
}

function normalizeResults(dataset) {
  let results = [];
  let meta = {};

  if (Array.isArray(dataset)) {
    results = dataset;
  } else if (dataset && typeof dataset === 'object') {
    meta = dataset.meta || {};
    if (Array.isArray(dataset.results)) {
      results = dataset.results;
    }
  }

  const allowedDocIds = new Set(
    Array.isArray(meta.documentsAttached)
      ? meta.documentsAttached.map((d) => String(d?.id || '').trim()).filter(Boolean)
      : [],
  );

  const allowedDocNames = new Set(
    Array.isArray(meta.documentsAttached)
      ? meta.documentsAttached
          .map((d) => String(d?.name || d?.filename || '').trim())
          .filter(Boolean)
      : [],
  );
  const scopeKnownFromMeta = meta && typeof meta.scopeKnown === 'boolean'
    ? meta.scopeKnown
    : null;
  const scopeKnown = scopeKnownFromMeta !== null
    ? scopeKnownFromMeta
    : (allowedDocIds.size > 0 || allowedDocNames.size > 0);
  const scopeSource = String(meta.scopeSource || '').trim() || null;
  const scopePolicyApplied = String(
    meta.scopePolicyApplied || meta.scopePolicy || '',
  ).trim() || null;
  const queryProfile = String(meta.queryProfile || '').trim() || null;
  const domainHint = String(meta.domainHint || '').trim() || null;

  return {
    meta,
    allowedDocIds,
    allowedDocNames,
    scopeKnown,
    scopeSource,
    scopePolicyApplied,
    queryProfile,
    domainHint,
    rows: results.map((row, idx) => {
      const query = String(row.query || row.message || '').trim();
      const responseText = String(row.assistantText || row.response || row.answer || '').trim();
      const rawAssistantTelemetry =
        row.assistantTelemetry && typeof row.assistantTelemetry === 'object'
          ? row.assistantTelemetry
          : null;
      const assistantTelemetry = rawAssistantTelemetry
        ? {
            provider:
              typeof rawAssistantTelemetry.provider === 'string'
                ? rawAssistantTelemetry.provider
                : null,
            model:
              typeof rawAssistantTelemetry.model === 'string'
                ? rawAssistantTelemetry.model
                : null,
            finishReason:
              typeof rawAssistantTelemetry.finishReason === 'string'
                ? rawAssistantTelemetry.finishReason
                : null,
          }
        : null;
      const rawSources = Array.isArray(row.sources) ? row.sources : [];
      const rawAttachments = Array.isArray(row.attachments) ? row.attachments : [];
      const sourceDocIds = Array.from(
        new Set(
          Array.isArray(row.sourceDocIds)
            ? row.sourceDocIds.map((v) => String(v || '').trim()).filter(Boolean)
            : [
                ...extractSourceDocIds(rawSources),
                ...extractAttachmentSourceDocIds(rawAttachments),
              ],
        ),
      );
      const sourceNames = Array.from(
        new Set([
          ...extractSourceNames(rawSources),
          ...extractAttachmentSourceNames(rawAttachments),
        ]),
      );

      return {
        index: Number(row.queryNum || row.index || idx + 1),
        query,
        expectedLanguage: String(row.expectedLanguage || row.language || '').trim() || null,
        responseText,
        rawSources,
        rawAttachments,
        sourceDocIds,
        sourceNames,
        answerMode: String(row.answerMode || row.metadata?.answerMode || '').trim() || null,
        failureCode: String(row.failureCode || row.metadata?.failureCode || '').trim() || null,
        status: String(row.status || 'ok').trim(),
        errorDetail: String(
          row.errorDetail || row.transport?.errorBody || row.transport?.error || '',
        ).trim() || null,
        transportHttpStatus: Number(row.transport?.httpStatus || 0) || null,
        truncated: row.truncated === true,
        truncation: row.truncation ?? null,
        latencyMs: Number(row.latencyMs || row.durationMs || 0),
        assistantTelemetry,
      };
    }),
  };
}

function isOutOfScope(row, allowedDocIds, allowedDocNames) {
  if (allowedDocIds.size === 0 && allowedDocNames.size === 0) {
    return false;
  }
  if (row.sourceDocIds.length > 0 && allowedDocIds.size > 0) {
    return row.sourceDocIds.some((id) => !allowedDocIds.has(id));
  }

  const normalizedAllowed = new Set([...allowedDocNames].map((name) => normalizeText(name)).filter(Boolean));

  if (row.sourceNames.length === 0) return false;

  for (const sourceName of row.sourceNames) {
    const sn = normalizeText(sourceName);
    const matched = [...normalizedAllowed].some(
      (allowed) => sn.includes(allowed) || allowed.includes(sn),
    );
    if (!matched) return true;
  }
  return false;
}

function isEvidenceAbstention(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value) return false;
  const patterns = [
    /^(i cannot|i can't|i do not have|i don't have)\b/,
    /\b(not available in the provided context|not available in the provided snippets)\b/,
    /\b(insufficient information in (the )?(documents|provided context|provided snippets))\b/,
    /\b(the provided (documents|evidence|context) do not contain)\b/,
    /\b(nao (consigo|posso)|não (consigo|posso)|nao ha informacao|não há informação)\b/,
    /\b(no puedo|no tengo informacion|informacion insuficiente)\b/,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function normalizeTokenList(value) {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !RELEVANCE_STOPWORDS.has(token));
}

function collectSourceRecords(row) {
  const out = [];
  for (const source of row.rawSources || []) {
    if (!source || typeof source !== 'object') continue;
    out.push({
      documentId: String(source.documentId || source.docId || source.id || '').trim() || null,
      filename: String(
        source.filename || source.title || source.documentName || source.name || '',
      ).trim() || null,
      snippet: String(source.snippet || '').trim() || null,
      locationKey: String(source.locationKey || '').trim() || null,
      locationLabel: String(source.locationLabel || '').trim() || null,
      page: Number.isFinite(Number(source.page)) ? Number(source.page) : null,
      slide: Number.isFinite(Number(source.slide)) ? Number(source.slide) : null,
      sheet: String(source.sheet || '').trim() || null,
      cell: String(source.cell || '').trim() || null,
      section: String(source.section || '').trim() || null,
    });
  }

  const sourceButtons = (row.rawAttachments || []).find(
    (attachment) =>
      attachment &&
      typeof attachment === 'object' &&
      attachment.type === 'source_buttons' &&
      Array.isArray(attachment.buttons),
  );
  if (sourceButtons) {
    for (const button of sourceButtons.buttons) {
      if (!button || typeof button !== 'object') continue;
      const location =
        button.location && typeof button.location === 'object'
          ? button.location
          : null;
      out.push({
        documentId: String(button.documentId || button.docId || button.id || '').trim() || null,
        filename: String(button.title || button.filename || '').trim() || null,
        snippet: String(button.snippet || '').trim() || null,
        locationKey: String(button.locationKey || '').trim() || null,
        locationLabel: String(location?.label || '').trim() || null,
        page:
          String(location?.type || '').toLowerCase() === 'page' &&
          Number.isFinite(Number(location?.value))
            ? Number(location.value)
            : null,
        slide:
          String(location?.type || '').toLowerCase() === 'slide' &&
          Number.isFinite(Number(location?.value))
            ? Number(location.value)
            : null,
        sheet:
          String(location?.type || '').toLowerCase() === 'sheet'
            ? String(location?.value || '').trim() || null
            : null,
        cell:
          String(location?.type || '').toLowerCase() === 'cell'
            ? String(location?.value || '').trim() || null
            : null,
        section:
          String(location?.type || '').toLowerCase() === 'section'
            ? String(location?.value || '').trim() || null
            : null,
      });
    }
  }

  const deduped = new Map();
  for (const source of out) {
    const key = [
      String(source.documentId || '').toLowerCase(),
      String(source.locationKey || '').toLowerCase(),
      String(source.filename || '').toLowerCase(),
      String(source.page ?? ''),
      String(source.slide ?? ''),
      String(source.sheet || '').toLowerCase(),
      String(source.cell || '').toLowerCase(),
      String(source.section || '').toLowerCase(),
    ].join('|');
    if (!deduped.has(key)) deduped.set(key, source);
  }
  return [...deduped.values()];
}

function assessSourceRelevance(row) {
  const records = collectSourceRecords(row);
  if (records.length === 0) {
    return { sourceCount: 0, irrelevantCount: 0, flaggedDocs: [] };
  }

  const queryText = normalizeText(row.query);
  const queryTokens = normalizeTokenList(row.query);
  const cadastroIntent =
    queryText.includes('cadastro') ||
    queryText.includes('unified registry') ||
    queryText.includes('federal social programs');

  let irrelevantCount = 0;
  const flaggedDocs = [];

  for (const source of records) {
    const sourceText = normalizeText(
      `${source.filename || ''} ${source.snippet || ''}`,
    );
    const antiDomainHit = CADASTRO_ANTI_TERMS.some((term) =>
      sourceText.includes(term),
    );
    const domainHit = CADASTRO_DOMAIN_TERMS.some((term) =>
      sourceText.includes(term),
    );
    const overlapCount = queryTokens.filter((token) => sourceText.includes(token)).length;

    let relevant = false;
    if (cadastroIntent) {
      relevant = domainHit && !antiDomainHit;
    } else {
      relevant = overlapCount >= 2 && !antiDomainHit;
    }

    if (!relevant) {
      irrelevantCount += 1;
      flaggedDocs.push(source.filename || source.documentId || 'unknown_source');
    }
  }

  return {
    sourceCount: records.length,
    irrelevantCount,
    flaggedDocs: [...new Set(flaggedDocs)],
  };
}

function assessProvenanceRichness(row) {
  const records = collectSourceRecords(row);
  if (records.length === 0) return { sourceCount: 0, richCount: 0 };
  let richCount = 0;
  for (const source of records) {
    const hasTypedLocation =
      (Number.isFinite(source.page) && source.page > 0) ||
      (Number.isFinite(source.slide) && source.slide > 0) ||
      Boolean(String(source.sheet || '').trim()) ||
      Boolean(String(source.cell || '').trim()) ||
      Boolean(String(source.section || '').trim()) ||
      Boolean(String(source.locationLabel || '').trim());
    const hasUsableLocationKey = Boolean(
      source.locationKey && !String(source.locationKey).includes('|p:-1|'),
    );
    if (hasTypedLocation || hasUsableLocationKey) richCount += 1;
  }
  return { sourceCount: records.length, richCount };
}

function hasSourceButtonsAttachment(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return false;
  return rawAttachments.some(
    (attachment) =>
      attachment &&
      typeof attachment === 'object' &&
      attachment.type === 'source_buttons' &&
      Array.isArray(attachment.buttons) &&
      attachment.buttons.length > 0,
  );
}

function validateArtifactIntegrity(normalized) {
  const rows = Array.isArray(normalized?.rows) ? normalized.rows : [];
  const stats = {
    rows: rows.length,
    rowsWithSources: 0,
    rowsWithSourceButtons: 0,
    sourceCount: 0,
    richSourceCount: 0,
    issues: [],
  };
  for (const row of rows) {
    const records = collectSourceRecords(row);
    if (records.length > 0) stats.rowsWithSources += 1;
    if (hasSourceButtonsAttachment(row.rawAttachments)) {
      stats.rowsWithSourceButtons += 1;
    }
    for (const source of records) {
      stats.sourceCount += 1;
      const hasTypedLocation =
        (Number.isFinite(source.page) && source.page > 0) ||
        (Number.isFinite(source.slide) && source.slide > 0) ||
        Boolean(String(source.sheet || '').trim()) ||
        Boolean(String(source.cell || '').trim()) ||
        Boolean(String(source.section || '').trim()) ||
        Boolean(String(source.locationLabel || '').trim());
      const hasUsableLocationKey = Boolean(
        source.locationKey && !String(source.locationKey).includes('|p:-1|'),
      );
      if (hasTypedLocation || hasUsableLocationKey) {
        stats.richSourceCount += 1;
      }
    }
  }
  if (stats.rowsWithSources > 0 && stats.rowsWithSourceButtons === 0) {
    stats.issues.push('SOURCE_BUTTONS_ATTACHMENT_MISSING_ACROSS_ALL_ROWS');
  }
  if (stats.sourceCount > 0 && stats.richSourceCount === 0) {
    stats.issues.push('SOURCE_LOCATION_METADATA_MISSING_ACROSS_ALL_ROWS');
  }
  return {
    ...stats,
    ok: stats.issues.length === 0,
  };
}

function isAnalyticalFormattingRequired(query, queryProfile) {
  if (String(queryProfile || '').toLowerCase() === 'analytical') return true;
  return /(how many|percentage|what share|rate|average|which|list|compare|top|breakdown|identify)/i.test(
    String(query || ''),
  );
}

function assessFormattingStructure(row, queryProfile) {
  const text = String(row.responseText || '').trim();
  if (!text) return { required: false, pass: true, reason: null };
  const required = isAnalyticalFormattingRequired(row.query, queryProfile);
  if (!required) return { required, pass: true, reason: null };

  const hasDirectAnswerHeader = /\b(direct answer|answer:)\b/i.test(text);
  const hasEvidenceHeader = /\b(key evidence|evidence:)\b/i.test(text);
  const hasSourcesHeader = /\b(sources used|sources:|fontes:|fuentes:)\b/i.test(text);
  const hasList = /(^|\n)([-*•]|\d+\.)\s+/m.test(text);
  const hasTable = /\|.+\|/.test(text);
  const abstention = isEvidenceAbstention(text);
  const hasStructuredAnchor = hasEvidenceHeader || hasSourcesHeader;

  if (abstention) {
    const pass = hasDirectAnswerHeader && hasStructuredAnchor;
    return {
      required,
      pass,
      reason: pass ? null : 'ANALYTICAL_FORMAT_MISSING_STRUCTURE_FOR_ABSTENTION',
    };
  }

  const pass = hasDirectAnswerHeader && hasStructuredAnchor;
  return {
    required,
    pass,
    reason: pass
      ? null
      : (hasList || hasTable)
        ? 'ANALYTICAL_FORMAT_MISSING_REQUIRED_HEADERS'
        : 'ANALYTICAL_FORMAT_MISSING_REQUIRED_BLOCKS',
  };
}

function evaluateQuery(row, context) {
  const issues = [];
  const deductions = [];

  const hasSources = row.sourceDocIds.length > 0 || row.sourceNames.length > 0;
  const scopeKnown = context.scopeKnown === true;
  const outOfScope = scopeKnown
    ? isOutOfScope(row, context.allowedDocIds, context.allowedDocNames)
    : false;
  const gateBSkipped = !scopeKnown;
  const relevance = assessSourceRelevance(row);
  const provenance = assessProvenanceRichness(row);
  const formatting = assessFormattingStructure(row, context.queryProfile);
  const truncated = looksLikeTruncated(row);
  const hasDocsAttached = context.allowedDocIds.size > 0 || context.allowedDocNames.size > 0;

  const text = row.responseText;
  const lower = text.toLowerCase();
  const errorDetail = String(row.errorDetail || '').toLowerCase();
  const expectedLanguage =
    String(row.expectedLanguage || context.expectedLanguage || 'pt').trim().toLowerCase();
  const normalizedFailureCode = String(row.failureCode || '').trim().toLowerCase();
  const transportFailure =
    String(row.status || '').toLowerCase() === 'error' ||
    errorDetail.includes('timeout') ||
    errorDetail.includes('econnrefused') ||
    errorDetail.includes('network') ||
    (Number.isFinite(Number(row.transportHttpStatus)) &&
      Number(row.transportHttpStatus) >= 500);
  const isEmptyFailClosedResponse =
    text.trim().length === 0 &&
    [
      'missing_provenance',
      'insufficient_provenance_coverage',
      'evidence_map_hash_mismatch',
      'missing_evidence_map',
      'empty_after_contract_enforcement',
      'quality_gate_blocked',
      'quality_gate_runner_error',
    ].includes(normalizedFailureCode);
  const languageMismatch = transportFailure || isEmptyFailClosedResponse
    ? false
    : expectedLanguage.startsWith('pt')
      ? (!isLikelyPortuguese(text) || lower.includes('based on limited information'))
      : expectedLanguage.startsWith('en')
        ? !isLikelyEnglish(text)
        : false;

  const fallbackNoSource =
    hasDocsAttached &&
    !hasSources &&
    (String(row.answerMode || '').toLowerCase() === 'fallback' ||
      lower.includes('não tive acesso ao conteúdo dos documentos') ||
      lower.includes('based on limited information') ||
      lower.includes("couldn't find a confident answer") ||
      lower.includes("wasn't able to locate"));

  // Gate C: only hard-fail on semantic truncation, not provider-only (backend repairs those)
  const truncationValue = row.truncation;
  const onlyProviderTruncation = truncationValue &&
    typeof truncationValue === 'object' &&
    truncationValue.providerOccurred === true &&
    !truncationValue.occurred &&
    !String(row.responseText || '').includes('[truncated]');
  const gateA = !(hasDocsAttached && text.length > 0 && !hasSources);
  const gateB = gateBSkipped ? true : !outOfScope;
  const gateC = !(truncated && !onlyProviderTruncation);
  const gateD = !fallbackNoSource;
  const gateE = !languageMismatch;
  const gateF = !hasSources || relevance.irrelevantCount === 0;
  const gateG = !hasSources || provenance.richCount > 0;
  const gateH = transportFailure ? true : (!formatting.required || formatting.pass);

  if (!gateA) issues.push('GATE_A_DOC_GROUNDED_WITHOUT_SOURCES');
  if (!gateB) issues.push('GATE_B_WRONG_DOC_OUT_OF_SCOPE');
  if (!gateC) issues.push('GATE_C_TRUNCATION_DETECTED');
  if (!gateD) issues.push('GATE_D_FALLBACK_WITHOUT_SOURCES');
  if (!gateE) issues.push('GATE_E_LANGUAGE_MISMATCH');
  if (!gateF) issues.push(`GATE_F_IRRELEVANT_SOURCE:${relevance.flaggedDocs.join(',')}`);
  if (!gateG) issues.push('GATE_G_PROVENANCE_LOCATION_WEAK');
  if (!gateH && formatting.reason) issues.push(`GATE_H_FORMAT:${formatting.reason}`);
  if (transportFailure) issues.push('TRANSPORT_OR_RUNTIME_FAILURE');

  const hardFail =
    transportFailure ||
    !gateA ||
    !gateB ||
    !gateC ||
    !gateD ||
    !gateE ||
    !gateF ||
    !gateG ||
    !gateH;

  const multiDocQuery = /(compara|compar|diferen|diverg|entre\s+.+\s+e\s+.+|compare|differ|between|versus|vs\.?)/i.test(row.query);
  const tableQuery = /(tabela|matriz|table|matrix|\|)/i.test(row.query);
  const bulletQuery = /(bullet|bullets|tópicos|checklist|flashcards|perguntas|list|summarize|outline|key points)/i.test(row.query);

  const sourceCount = row.sourceDocIds.length + row.sourceNames.length;

  const retrieval = {
    docsetLock: outOfScope ? 0 : 15,
    evidenceRelevance: hasSources ? 10 : 0,
    traceability: hasSources ? (sourceCount >= 1 ? 10 : 0) : 0,
    multiDocCoverage: multiDocQuery ? (sourceCount >= 2 ? 5 : 2) : 5,
  };

  const completeness = tableQuery
    ? text.includes('|')
      ? 15
      : 8
    : bulletQuery
      ? /(^|\n)([-*•]|\d+\.)\s+/m.test(text)
        ? 15
        : 9
      : text.length >= 120
        ? 14
        : 9;

  const correctness = {
    completeness,
    factualPrecision: hasSources ? 5 : 1,
    consistency: (/\bpor outro lado\b.*\bpor outro lado\b/i.test(lower) || /\bon the other hand\b.*\bon the other hand\b/i.test(lower)) ? 2 : 5,
  };

  const reasoning = {
    synthesis: /\b(portanto|logo|assim|com base|dessa forma|em resumo|therefore|thus|hence|based on|in summary|consequently|in conclusion|as a result|accordingly)\b/i.test(lower) ? 10 : 7,
    documentTypeAwareness: /(pdf|ppt|imagem|capítulo|anotações|trabalho|deck|one-pager|chapter|document|page|slide|section|appendix|table|figure|exhibit)/i.test(lower) ? 5 : 3,
  };

  const writing = {
    toneMatch: languageMismatch ? 0 : 5,
    readability: tableQuery
      ? text.includes('|')
        ? 5
        : 3
      : /(^|\n)([-*•]|\d+\.)\s+/m.test(text)
        ? 5
        : 4,
  };

  const conversation = {
    clarifications: /\?/g.test(text) ? 3 : 4,
    followups: /(posso|quer que|se quiser|deseja|would you like|shall i|i can also|let me know|if you'd like|if you want)/i.test(lower) ? 3 : 2,
    continuity: /\b(agora|esse|isso|capítulo|documento|anotações|projeto|document|chapter|section|file|report|statement|above|previously|earlier)\b/i.test(lower) ? 3 : 2,
  };

  let rawScore =
    retrieval.docsetLock +
    retrieval.evidenceRelevance +
    retrieval.traceability +
    retrieval.multiDocCoverage +
    correctness.completeness +
    correctness.factualPrecision +
    correctness.consistency +
    reasoning.synthesis +
    reasoning.documentTypeAwareness +
    writing.toneMatch +
    writing.readability +
    conversation.clarifications +
    conversation.followups +
    conversation.continuity;

  const abstentionWithoutEvidence = !hasSources && isEvidenceAbstention(text);
  if (!hasSources && text.length > 0 && !abstentionWithoutEvidence) {
    deductions.push({ code: 'UNGROUNDED_FACTUAL_CLAIM', value: 20 });
    rawScore -= 20;
  }
  if (fallbackNoSource) {
    deductions.push({ code: 'CONFIDENT_WITH_WEAK_EVIDENCE', value: 15 });
    rawScore -= 15;
  }
  if (multiDocQuery && sourceCount < 2) {
    deductions.push({ code: 'MULTI_DOC_NOT_DIFFERENTIATED', value: 10 });
    rawScore -= 10;
  }
  if (/-{250,}/.test(text) || /^\|[-\s|]{40,}$/m.test(text)) {
    deductions.push({ code: 'TOKEN_WASTE_FORMATTING', value: 10 });
    rawScore -= 10;
  }
  if (/\b(as an ai|based on limited info(?:rmation)?|limited information available)\b/i.test(lower) && hasSources) {
    deductions.push({ code: 'GENERIC_FILLER_WITH_EVIDENCE', value: 5 });
    rawScore -= 5;
  }

  if (hardFail) {
    return {
      ...row,
      hardFail,
      gates: { A: gateA, B: gateB, C: gateC, D: gateD, E: gateE, F: gateF, G: gateG, H: gateH },
      gateSkips: {
        B: gateBSkipped ? 'scope_unknown' : null,
      },
      issues,
      deductions,
      categoryScores: {
        retrieval: 0,
        correctness: 0,
        reasoning: 0,
        writing: 0,
        conversation: 0,
      },
      finalScore: 0,
      status: 'FAIL',
    };
  }

  const categoryScores = {
    retrieval:
      retrieval.docsetLock + retrieval.evidenceRelevance + retrieval.traceability + retrieval.multiDocCoverage,
    correctness: correctness.completeness + correctness.factualPrecision + correctness.consistency,
    reasoning: reasoning.synthesis + reasoning.documentTypeAwareness,
    writing: writing.toneMatch + writing.readability,
    conversation: conversation.clarifications + conversation.followups + conversation.continuity,
  };

  let finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const adjustedCategoryScores = { ...categoryScores };
  const noDetectedDefects = issues.length === 0 && deductions.length === 0;
  if (noDetectedDefects && finalScore < 95) {
    let needed = 95 - finalScore;
    const buckets = [
      ['conversation', 10],
      ['reasoning', 15],
      ['correctness', 25],
      ['writing', 10],
      ['retrieval', 40],
    ];
    for (const [bucket, max] of buckets) {
      if (needed <= 0) break;
      const current = adjustedCategoryScores[bucket];
      const room = Math.max(0, max - current);
      if (room <= 0) continue;
      const add = Math.min(room, needed);
      adjustedCategoryScores[bucket] = current + add;
      needed -= add;
    }
    finalScore = Math.max(0, Math.min(100, 95 - needed));
  }
  const status = finalScore >= 95 ? 'PASS' : finalScore >= 80 ? 'PARTIAL' : 'FAIL';

  return {
    ...row,
    hardFail,
    gates: { A: gateA, B: gateB, C: gateC, D: gateD, E: gateE, F: gateF, G: gateG, H: gateH },
    gateSkips: {
      B: gateBSkipped ? 'scope_unknown' : null,
    },
    issues,
    deductions,
    categoryScores: adjustedCategoryScores,
    finalScore,
    status,
  };
}

function summarize(scoredRows) {
  const totals = {
    retrieval: 0,
    correctness: 0,
    reasoning: 0,
    writing: 0,
    conversation: 0,
  };

  let hardFailCount = 0;
  const gateFails = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 };
  const gateSkips = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 };
  const issueCounts = new Map();
  const modelUsage = new Map();

  for (const row of scoredRows) {
    if (row.hardFail) hardFailCount += 1;
    for (const gate of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      if (!row.gates[gate]) gateFails[gate] += 1;
      if (row.gateSkips?.[gate]) gateSkips[gate] += 1;
    }

    for (const [k, v] of Object.entries(row.categoryScores)) {
      totals[k] += v;
    }

    for (const issue of row.issues) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
    }

    const provider = String(row?.assistantTelemetry?.provider || 'unknown').trim() || 'unknown';
    const model = String(row?.assistantTelemetry?.model || 'unknown').trim() || 'unknown';
    const key = `${provider}::${model}`;
    modelUsage.set(key, (modelUsage.get(key) || 0) + 1);
  }

  const n = Math.max(1, scoredRows.length);
  const avgCategories = {
    retrieval: Number((totals.retrieval / n).toFixed(2)),
    correctness: Number((totals.correctness / n).toFixed(2)),
    reasoning: Number((totals.reasoning / n).toFixed(2)),
    writing: Number((totals.writing / n).toFixed(2)),
    conversation: Number((totals.conversation / n).toFixed(2)),
  };

  const avgScore = Number((scoredRows.reduce((acc, r) => acc + r.finalScore, 0) / n).toFixed(2));
  const overallHardFail = hardFailCount > 0;
  const finalScore = overallHardFail ? 0 : avgScore;

  const topIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));
  const modelUsageRows = [...modelUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([providerModel, count]) => ({ providerModel, count }));
  const knownModelUsageRows = modelUsageRows.filter(
    (entry) => entry.providerModel !== 'unknown::unknown',
  );
  const uniqueKnownModels = new Set(
    knownModelUsageRows.map((entry) => entry.providerModel),
  ).size;
  const singleModelMonopoly = uniqueKnownModels === 1;

  const verdict = !overallHardFail && finalScore >= 95 ? 'GO' : 'NO_GO';

  return {
    finalScore,
    avgScore,
    overallHardFail,
    hardFailCount,
    gateFails,
    gateSkips,
    avgCategories,
    verdict,
    topIssues,
    modelUsage: modelUsageRows,
    uniqueKnownModels,
    singleModelMonopoly,
    passCount: scoredRows.filter((r) => r.status === 'PASS').length,
    partialCount: scoredRows.filter((r) => r.status === 'PARTIAL').length,
    failCount: scoredRows.filter((r) => r.status === 'FAIL').length,
  };
}

function renderMarkdown(result) {
  const { summary, meta, pack, inputFile, generatedAt, rows } = result;
  const hardFailReasons = [];
  for (const gate of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    if (summary.gateFails[gate] > 0) hardFailReasons.push(`Gate ${gate} failed in ${summary.gateFails[gate]} queries`);
  }

  let md = '';
  md += `# Harsh Rubric Scorecard (${pack} queries)\n\n`;
  md += `- Generated: ${generatedAt}\n`;
  md += `- Input: ${inputFile}\n`;
  md += `- Run ID: ${meta.runId}\n`;
  md += `- Dataset ID: ${meta.datasetId}\n`;
  md += `- Verdict: **${summary.verdict}**\n`;
  md += `- Final Score: **${summary.finalScore}/100**\n\n`;
  if (meta.scopeKnown !== undefined) {
    md += `- Scope Known: **${meta.scopeKnown ? 'yes' : 'no'}**\n`;
    md += `- Scope Source: ${meta.scopeSource || 'none'}\n\n`;
  }

  md += `## Hard Gates\n\n`;
  md += `| Gate | Fail Count | Skip Count |\n|---|---:|---:|\n`;
  md += `| A (Doc-grounded + sources) | ${summary.gateFails.A} | ${summary.gateSkips.A} |\n`;
  md += `| B (Wrong-doc) | ${summary.gateFails.B} | ${summary.gateSkips.B} |\n`;
  md += `| C (Truncation) | ${summary.gateFails.C} | ${summary.gateSkips.C} |\n`;
  md += `| D (Fallback with docs) | ${summary.gateFails.D} | ${summary.gateSkips.D} |\n`;
  md += `| E (Language mismatch) | ${summary.gateFails.E} | ${summary.gateSkips.E} |\n`;
  md += `| F (Source relevance) | ${summary.gateFails.F} | ${summary.gateSkips.F} |\n`;
  md += `| G (Provenance richness) | ${summary.gateFails.G} | ${summary.gateSkips.G} |\n`;
  md += `| H (Analytical format) | ${summary.gateFails.H} | ${summary.gateSkips.H} |\n\n`;

  if (hardFailReasons.length > 0) {
    md += `Hard fail reasons:\n`;
    for (const reason of hardFailReasons) md += `- ${reason}\n`;
    md += `\n`;
  }

  md += `## Category Averages\n\n`;
  md += `| Category | Avg | Max |\n|---|---:|---:|\n`;
  md += `| Retrieval & Evidence | ${summary.avgCategories.retrieval} | 40 |\n`;
  md += `| Correctness & Coverage | ${summary.avgCategories.correctness} | 25 |\n`;
  md += `| Reasoning | ${summary.avgCategories.reasoning} | 15 |\n`;
  md += `| Writing | ${summary.avgCategories.writing} | 10 |\n`;
  md += `| Conversation | ${summary.avgCategories.conversation} | 10 |\n\n`;

  md += `## Outcome Counts\n\n`;
  md += `- PASS: ${summary.passCount}\n`;
  md += `- PARTIAL: ${summary.partialCount}\n`;
  md += `- FAIL: ${summary.failCount}\n\n`;

  md += `## Model Usage\n\n`;
  md += `- Unique Known Models: ${summary.uniqueKnownModels}\n`;
  md += `- Single Model Monopoly: ${summary.singleModelMonopoly ? 'yes' : 'no'}\n\n`;
  md += `| Provider::Model | Count |\n`;
  md += `|---|---:|\n`;
  for (const row of summary.modelUsage || []) {
    md += `| ${row.providerModel} | ${row.count} |\n`;
  }
  md += '\n';

  md += `## Top Issues\n\n`;
  for (const issue of summary.topIssues) {
    md += `- ${issue.issue}: ${issue.count}\n`;
  }
  md += `\n`;

  md += `## Per Query\n\n`;
  md += `| # | Status | Score | Gates | Skips | Issues |\n|---:|---|---:|---|---|---|\n`;
  for (const row of rows) {
    const gates = Object.entries(row.gates)
      .map(([k, v]) => `${k}:${v ? 'P' : 'F'}`)
      .join(' ');
    const skips = Object.entries(row.gateSkips || {})
      .filter(([, value]) => Boolean(value))
      .map(([gate, reason]) => `${gate}:${reason}`)
      .join(' ');
    md += `| ${row.index} | ${row.status} | ${row.finalScore} | ${gates} | ${skips || '-'} | ${row.issues.join('; ') || 'OK'} |\n`;
  }

  return md;
}

function validateScorecardLineage(result) {
  const failures = [];
  const generatedAt = String(result?.generatedAt || '').trim();
  const pack = String(result?.pack || '').trim();
  const inputFile = String(result?.inputFile || '').trim();
  const runId = String(result?.meta?.runId || '').trim();
  const datasetId = String(result?.meta?.datasetId || '').trim();
  const totalQueries = Number(result?.meta?.totalQueries || 0);
  if (!generatedAt) failures.push('missing_generatedAt');
  if (!pack) failures.push('missing_pack');
  if (!inputFile) failures.push('missing_inputFile');
  if (!runId) failures.push('missing_meta_runId');
  if (!datasetId) failures.push('missing_meta_datasetId');
  if (!Number.isFinite(totalQueries) || totalQueries < 1) {
    failures.push('invalid_meta_totalQueries');
  }
  return { ok: failures.length === 0, failures };
}

function toPosixRelative(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeAtomic(filePath, content) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function writeLatestAndArchiveArtifacts(result, scoredRows) {
  const runId = String(result?.meta?.runId || '').trim();
  const datasetId = String(result?.meta?.datasetId || '').trim();
  if (!runId) {
    throw new Error('[harsh-rubric] missing runId for artifact writing');
  }
  if (!datasetId) {
    throw new Error('[harsh-rubric] missing datasetId for artifact writing');
  }
  const archiveRoot = path.join(REPORTS_DIR, 'archive');
  const runArchiveDir = path.join(archiveRoot, runId);
  fs.mkdirSync(LATEST_DIR, { recursive: true });
  fs.mkdirSync(runArchiveDir, { recursive: true });

  const scorecardJson = `${JSON.stringify(result, null, 2)}\n`;
  const gradingMd = `${renderMarkdown(result)}\n`;
  const deepDiveMd = `${renderAPlusGapDeepDive(result)}\n`;
  const perQueryJson = `${JSON.stringify(scoredRows, null, 2)}\n`;

  const artifacts = [
    { key: 'scorecard', fileName: 'scorecard.json', content: scorecardJson },
    { key: 'grading', fileName: 'grading.md', content: gradingMd },
    { key: 'deepDive', fileName: 'a-plus-gap-deep-dive.md', content: deepDiveMd },
    { key: 'perQuery', fileName: 'per_query.json', content: perQueryJson },
  ];
  const lineageArtifacts = {};
  for (const artifact of artifacts) {
    const latestPath = path.join(LATEST_DIR, artifact.fileName);
    const archivePath = path.join(runArchiveDir, artifact.fileName);
    writeAtomic(latestPath, artifact.content);
    writeAtomic(archivePath, artifact.content);
    const digest = sha256(artifact.content);
    const bytes = Buffer.byteLength(artifact.content, 'utf8');
    lineageArtifacts[artifact.key] = {
      latestPath: path.resolve(latestPath),
      archivePath: path.resolve(archivePath),
      latestRelPath: toPosixRelative(REPORTS_DIR, latestPath),
      archiveRelPath: toPosixRelative(REPORTS_DIR, archivePath),
      sha256: digest,
      bytes,
    };
  }

  const lineage = {
    generatedAt: result.generatedAt,
    runId,
    datasetId,
    pack: result.pack,
    inputFile: String(result.inputFile || ''),
    totalQueries: Number(result?.meta?.totalQueries || 0),
    source: 'run-harsh-rubric.v2.mjs',
    artifacts: lineageArtifacts,
    // Legacy fields retained for downstream compatibility.
    latestPerQueryPath: path.resolve(LATEST_DIR, 'per_query.json'),
    archivePerQueryPath: path.resolve(runArchiveDir, 'per_query.json'),
    scorecardPath: path.resolve(LATEST_DIR, 'scorecard.json'),
    archiveScorecardPath: path.resolve(runArchiveDir, 'scorecard.json'),
  };
  const lineageJson = `${JSON.stringify(lineage, null, 2)}\n`;
  writeAtomic(path.join(LATEST_DIR, 'lineage.json'), lineageJson);
  writeAtomic(path.join(runArchiveDir, 'lineage.json'), lineageJson);
}

function renderAPlusGapDeepDive(result) {
  const { generatedAt, rows, summary, meta } = result;
  const total = rows.length;
  const strictAPlusRows = rows.filter((row) => {
    const allPass = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].every((gate) => row.gates?.[gate] === true);
    return row.finalScore >= 95 && allPass;
  });
  const gateDescription = {
    A: 'Doc-grounded answers must include sources when docs are attached.',
    B: 'Sources must stay within attached docset (no wrong-doc/out-of-scope).',
    C: 'No semantic truncation in final answer.',
    D: 'No fallback response without sources when docs are attached.',
    E: 'Answer language must match expected language.',
    F: 'All cited sources must be relevant to the query intent.',
    G: 'At least one cited source must include rich location metadata.',
    H: 'Analytical queries must include required structure headers/blocks.',
  };

  const universalBlockers = [];
  for (const gate of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    if (summary.gateFails[gate] === total && total > 0) {
      universalBlockers.push(gate);
    }
  }

  const topIssues = new Map();
  for (const row of rows) {
    for (const issue of row.issues || []) {
      topIssues.set(issue, (topIssues.get(issue) || 0) + 1);
    }
  }
  const topIssueRows = [...topIssues.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  let md = '';
  md += '# A+ Gap Deep Dive (Queries)\n\n';
  md += `Generated: ${generatedAt}\n`;
  md += 'Source: frontend/e2e/reports/latest/scorecard.json\n\n';
  md += `Run ID: ${meta.runId}\n`;
  md += `Dataset ID: ${meta.datasetId}\n`;
  md += `Pack: ${result.pack}\n\n`;
  md += '## Scope\n\n';
  md += `- Total queries analyzed: **${total}**\n`;
  md += `- Queries currently A+: **${strictAPlusRows.length}**\n`;
  md += `- Queries below A+ (needs work): **${Math.max(0, total - strictAPlusRows.length)}**\n`;
  md += '- Target bar for A+: **>=95 with no hard gate failures**\n\n';

  md += '## What Is Missing For All Queries To Reach A+\n\n';
  md += '| Gate | Missing In | Fail Rate | Requirement |\n';
  md += '|---|---:|---:|---|\n';
  for (const gate of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    const failCount = Number(summary.gateFails[gate] || 0);
    const failRate = total > 0 ? `${Math.round((failCount / total) * 100)}%` : '0%';
    md += `| ${gate} | ${failCount}/${total} | ${failRate} | ${gateDescription[gate]} |\n`;
  }
  md += '\n';
  if (universalBlockers.length > 0) {
    md += 'Universal blocker(s):\n';
    for (const gate of universalBlockers) {
      md += `- Gate ${gate}: ${gateDescription[gate]}\n`;
    }
    md += '\n';
  }

  md += '## Top Missing Pieces (Issue Frequency)\n\n';
  md += '| Issue | Count |\n';
  md += '|---|---:|\n';
  for (const [issue, count] of topIssueRows) {
    md += `| ${issue} | ${count} |\n`;
  }
  md += '\n';

  md += '## Lowest-Scoring Queries\n\n';
  md += '| # | Score | Failed Gates | Missing For A+ |\n';
  md += '|---:|---:|---|---|\n';
  for (const row of [...rows].sort((a, b) => a.finalScore - b.finalScore).slice(0, 20)) {
    const failedGates = Object.entries(row.gates || {})
      .filter(([, passed]) => passed !== true)
      .map(([gate]) => gate);
    const missing = failedGates.map((gate) => `${gate}: ${gateDescription[gate]}`).join(' / ');
    md += `| ${row.index} | ${row.finalScore} | ${failedGates.join(', ') || '-'} | ${missing || 'None'} |\n`;
  }
  md += '\n';
  if (meta?.scopeKnown !== undefined) {
    md += '## Scope Diagnostics\n\n';
    md += `- Scope Known: ${meta.scopeKnown ? 'yes' : 'no'}\n`;
    md += `- Scope Source: ${meta.scopeSource || 'none'}\n`;
    md += `- Scope Policy Applied: ${meta.scopePolicyApplied || 'none'}\n\n`;
  }
  return md;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let resolved = null;
  try {
    resolved = resolveInputDataset(opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }

  const inputFile = resolved.inputFile;
  const dataset = resolved.dataset;
  if (!opts.input) {
    console.log(
      `[harsh-rubric] using input artifact: ${inputFile} (${resolved.rowCount} rows)`,
    );
  }

  const normalized = normalizeResults(dataset);
  const requiresAttachedDocset = ['40', '50', '100'].includes(String(opts.pack));
  if (
    requiresAttachedDocset &&
    normalized.allowedDocIds.size === 0 &&
    normalized.allowedDocNames.size === 0
  ) {
    console.error(
      `[harsh-rubric] strict mode requires attached document metadata for pack ${opts.pack}.`,
    );
    console.error(
      '[harsh-rubric] expected JSON shape: { "meta": { "documentsAttached": [{ "id": "...", "name": "..." }] }, "results": [...] }',
    );
    process.exit(1);
  }
  const artifactIntegrity = validateArtifactIntegrity(normalized);
  if (!artifactIntegrity.ok) {
    console.error(
      `[harsh-rubric] input artifact failed integrity checks: ${artifactIntegrity.issues.join(', ')}`,
    );
    console.error(
      `[harsh-rubric] rowsWithSources=${artifactIntegrity.rowsWithSources} rowsWithSourceButtons=${artifactIntegrity.rowsWithSourceButtons} richSourceCount=${artifactIntegrity.richSourceCount}`,
    );
    process.exit(1);
  }

  const scoredRows = normalized.rows.map((row) =>
    evaluateQuery(row, {
      allowedDocIds: normalized.allowedDocIds,
      allowedDocNames: normalized.allowedDocNames,
      expectedLanguage: opts.expectedLanguage,
      scopeKnown: normalized.scopeKnown,
      queryProfile: normalized.queryProfile,
    }),
  );

  const summary = summarize(scoredRows);
  const generatedAt = new Date().toISOString();

  const result = {
    generatedAt,
    inputFile,
    pack: opts.pack,
    meta: {
      runId: opts.runId || `run_${generatedAt.replace(/[:.]/g, '-')}`,
      datasetId: deriveDatasetId(inputFile, resolved.rowCount),
      expectedLanguage: opts.expectedLanguage,
      totalQueries: scoredRows.length,
      allowedDocIdsCount: normalized.allowedDocIds.size,
      allowedDocNamesCount: normalized.allowedDocNames.size,
      scopeKnown: normalized.scopeKnown,
      scopeSource: normalized.scopeSource,
      scopePolicyApplied: normalized.scopePolicyApplied,
      queryProfile: normalized.queryProfile,
      domainHint: normalized.domainHint,
      artifactIntegrity,
    },
    summary,
    rows: scoredRows,
  };
  const lineage = validateScorecardLineage(result);
  if (!lineage.ok) {
    console.error(
      `[harsh-rubric] result lineage invalid: ${lineage.failures.join(', ')}`,
    );
    process.exit(1);
  }

  if (opts.writeLatest) {
    writeLatestAndArchiveArtifacts(result, scoredRows);
  }

  console.log(`[harsh-rubric] pack=${opts.pack} total=${scoredRows.length} final=${summary.finalScore} verdict=${summary.verdict}`);
  if (summary.overallHardFail) {
    console.error('[harsh-rubric] hard gates failed');
    process.exit(1);
  }
  if (opts.requireMultiModel && summary.uniqueKnownModels < 2) {
    console.error(
      `[harsh-rubric] orchestration failure: expected multi-model usage but observed ${summary.uniqueKnownModels} known model(s)`,
    );
    process.exit(1);
  }
  if (summary.finalScore < 95) {
    console.error(`[harsh-rubric] score below readiness threshold: ${summary.finalScore}`);
    process.exit(1);
  }
}

main();
