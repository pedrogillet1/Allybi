#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
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

const DEFAULT_ALLOWED_DOC_NAME_PATTERNS = [
  'anotações_aula_2',
  'capítulo_8__framework_scrum',
  'trabalho_projeto',
  'oba_marketing',
  'trabalho_final',
  'guarda_bens_self_storage',
  'scrum',
  'marketing',
  'self storage',
];

function parseArgs(argv) {
  const out = {
    pack: '40',
    input: null,
    expectedLanguage: 'pt',
    writeLatest: true,
    runId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pack') out.pack = argv[++i];
    else if (arg === '--input') out.input = argv[++i];
    else if (arg === '--expected-language') out.expectedLanguage = argv[++i];
    else if (arg === '--no-write-latest') out.writeLatest = false;
    else if (arg === '--run-id') out.runId = argv[++i];
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

function isLikelyPortuguese(text) {
  const v = String(text || '').toLowerCase();
  const ptWords = [' de ', ' para ', ' com ', ' não ', ' que ', ' uma ', ' os ', ' as ', ' nos ', ' nas '];
  const enWords = [' the ', ' with ', ' based on ', ' this ', ' that ', ' for ', ' as an ai ', ' limited information '];
  const ptCount = ptWords.reduce((acc, w) => acc + (v.includes(w) ? 1 : 0), 0);
  const enCount = enWords.reduce((acc, w) => acc + (v.includes(w) ? 1 : 0), 0);
  return ptCount >= enCount;
}

function isLikelyEnglish(text) {
  const v = String(text || '').toLowerCase();
  const enWords = [' the ', ' with ', ' this ', ' that ', ' for ', ' and ', ' from ', ' are '];
  const ptWords = [' de ', ' para ', ' com ', ' não ', ' que ', ' uma ', ' os ', ' as '];
  const enCount = enWords.reduce((acc, w) => acc + (v.includes(w) ? 1 : 0), 0);
  const ptCount = ptWords.reduce((acc, w) => acc + (v.includes(w) ? 1 : 0), 0);
  return enCount >= ptCount;
}

function looksLikeTruncated(result) {
  const truncationValue = result.truncation;
  const truncationOccurred =
    truncationValue === true ||
    (truncationValue &&
      typeof truncationValue === 'object' &&
      truncationValue.occurred === true);
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

  return {
    meta,
    allowedDocIds,
    allowedDocNames,
    rows: results.map((row, idx) => {
      const query = String(row.query || row.message || '').trim();
      const responseText = String(row.assistantText || row.response || row.answer || '').trim();
      const rawSources = Array.isArray(row.sources) ? row.sources : [];
      const sourceDocIds = Array.isArray(row.sourceDocIds)
        ? row.sourceDocIds.map((v) => String(v || '').trim()).filter(Boolean)
        : extractSourceDocIds(rawSources);
      const sourceNames = extractSourceNames(rawSources);

      return {
        index: Number(row.queryNum || row.index || idx + 1),
        query,
        expectedLanguage: String(row.expectedLanguage || row.language || '').trim() || null,
        responseText,
        rawSources,
        sourceDocIds,
        sourceNames,
        answerMode: String(row.answerMode || row.metadata?.answerMode || '').trim() || null,
        failureCode: String(row.failureCode || row.metadata?.failureCode || '').trim() || null,
        status: String(row.status || 'ok').trim(),
        truncated: row.truncated === true,
        truncation: row.truncation ?? null,
        latencyMs: Number(row.latencyMs || row.durationMs || 0),
      };
    }),
  };
}

function isOutOfScope(row, allowedDocIds, allowedDocNames) {
  if (row.sourceDocIds.length > 0 && allowedDocIds.size > 0) {
    return row.sourceDocIds.some((id) => !allowedDocIds.has(id));
  }

  const normalizedAllowed = new Set([...allowedDocNames].map((name) => normalizeText(name)).filter(Boolean));
  if (normalizedAllowed.size === 0) {
    for (const pattern of DEFAULT_ALLOWED_DOC_NAME_PATTERNS) {
      normalizedAllowed.add(normalizeText(pattern));
    }
  }

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

function evaluateQuery(row, context) {
  const issues = [];
  const deductions = [];

  const hasSources = row.sourceDocIds.length > 0 || row.sourceNames.length > 0;
  const outOfScope = isOutOfScope(row, context.allowedDocIds, context.allowedDocNames);
  const truncated = looksLikeTruncated(row);
  const hasDocsAttached = context.allowedDocIds.size > 0 || context.allowedDocNames.size > 0;

  const text = row.responseText;
  const lower = text.toLowerCase();
  const expectedLanguage =
    String(row.expectedLanguage || context.expectedLanguage || 'pt').trim().toLowerCase();
  const languageMismatch = expectedLanguage.startsWith('pt')
    ? (!isLikelyPortuguese(text) || lower.includes('based on limited information'))
    : expectedLanguage.startsWith('en')
      ? !isLikelyEnglish(text)
      : false;

  const fallbackNoSource =
    hasDocsAttached &&
    !hasSources &&
    (String(row.answerMode || '').toLowerCase() === 'fallback' ||
      lower.includes('não tive acesso ao conteúdo dos documentos') ||
      lower.includes('based on limited information'));

  const gateA = !(hasDocsAttached && text.length > 0 && !hasSources);
  const gateB = !outOfScope;
  const gateC = !truncated;
  const gateD = !fallbackNoSource;
  const gateE = !languageMismatch;

  if (!gateA) issues.push('GATE_A_DOC_GROUNDED_WITHOUT_SOURCES');
  if (!gateB) issues.push('GATE_B_WRONG_DOC_OUT_OF_SCOPE');
  if (!gateC) issues.push('GATE_C_TRUNCATION_DETECTED');
  if (!gateD) issues.push('GATE_D_FALLBACK_WITHOUT_SOURCES');
  if (!gateE) issues.push('GATE_E_LANGUAGE_MISMATCH');

  const hardFail = !gateA || !gateB || !gateC || !gateD || !gateE;

  const multiDocQuery = /(compara|compar|diferen|diverg|entre\s+.+\s+e\s+.+)/i.test(row.query);
  const tableQuery = /(tabela|matriz|\|)/i.test(row.query);
  const bulletQuery = /(bullet|bullets|tópicos|checklist|flashcards|perguntas)/i.test(row.query);

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
    consistency: /\bpor outro lado\b.*\bpor outro lado\b/i.test(lower) ? 2 : 5,
  };

  const reasoning = {
    synthesis: /\b(portanto|logo|assim|com base|dessa forma|em resumo)\b/i.test(lower) ? 10 : 7,
    documentTypeAwareness: /(pdf|ppt|imagem|capítulo|anotações|trabalho|deck|one-pager)/i.test(lower) ? 5 : 3,
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
    followups: /(posso|quer que|se quiser|deseja)/i.test(lower) ? 3 : 2,
    continuity: /\b(agora|esse|isso|capítulo|documento|anotações|projeto)\b/i.test(lower) ? 3 : 2,
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

  if (!hasSources && text.length > 0) {
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
      gates: { A: gateA, B: gateB, C: gateC, D: gateD, E: gateE },
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

  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const status = finalScore >= 95 ? 'PASS' : finalScore >= 80 ? 'PARTIAL' : 'FAIL';

  return {
    ...row,
    hardFail,
    gates: { A: gateA, B: gateB, C: gateC, D: gateD, E: gateE },
    issues,
    deductions,
    categoryScores,
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
  const gateFails = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const issueCounts = new Map();

  for (const row of scoredRows) {
    if (row.hardFail) hardFailCount += 1;
    for (const gate of ['A', 'B', 'C', 'D', 'E']) {
      if (!row.gates[gate]) gateFails[gate] += 1;
    }

    for (const [k, v] of Object.entries(row.categoryScores)) {
      totals[k] += v;
    }

    for (const issue of row.issues) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
    }
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

  const verdict = !overallHardFail && finalScore >= 95 ? 'GO' : 'NO_GO';

  return {
    finalScore,
    avgScore,
    overallHardFail,
    hardFailCount,
    gateFails,
    avgCategories,
    verdict,
    topIssues,
    passCount: scoredRows.filter((r) => r.status === 'PASS').length,
    partialCount: scoredRows.filter((r) => r.status === 'PARTIAL').length,
    failCount: scoredRows.filter((r) => r.status === 'FAIL').length,
  };
}

function renderMarkdown(result) {
  const { summary, meta, pack, inputFile, generatedAt, rows } = result;
  const hardFailReasons = [];
  for (const gate of ['A', 'B', 'C', 'D', 'E']) {
    if (summary.gateFails[gate] > 0) hardFailReasons.push(`Gate ${gate} failed in ${summary.gateFails[gate]} queries`);
  }

  let md = '';
  md += `# Harsh Rubric Scorecard (${pack} queries)\n\n`;
  md += `- Generated: ${generatedAt}\n`;
  md += `- Input: ${inputFile}\n`;
  md += `- Run ID: ${meta.runId}\n`;
  md += `- Verdict: **${summary.verdict}**\n`;
  md += `- Final Score: **${summary.finalScore}/100**\n\n`;

  md += `## Hard Gates\n\n`;
  md += `| Gate | Fail Count |\n|---|---:|\n`;
  md += `| A (Doc-grounded + sources) | ${summary.gateFails.A} |\n`;
  md += `| B (Wrong-doc) | ${summary.gateFails.B} |\n`;
  md += `| C (Truncation) | ${summary.gateFails.C} |\n`;
  md += `| D (Fallback with docs) | ${summary.gateFails.D} |\n`;
  md += `| E (Language mismatch) | ${summary.gateFails.E} |\n\n`;

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

  md += `## Top Issues\n\n`;
  for (const issue of summary.topIssues) {
    md += `- ${issue.issue}: ${issue.count}\n`;
  }
  md += `\n`;

  md += `## Per Query\n\n`;
  md += `| # | Status | Score | Gates | Issues |\n|---:|---|---:|---|---|\n`;
  for (const row of rows) {
    const gates = Object.entries(row.gates)
      .map(([k, v]) => `${k}:${v ? 'P' : 'F'}`)
      .join(' ');
    md += `| ${row.index} | ${row.status} | ${row.finalScore} | ${gates} | ${row.issues.join('; ') || 'OK'} |\n`;
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

  const scoredRows = normalized.rows.map((row) =>
    evaluateQuery(row, {
      allowedDocIds: normalized.allowedDocIds,
      allowedDocNames: normalized.allowedDocNames,
      expectedLanguage: opts.expectedLanguage,
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
      expectedLanguage: opts.expectedLanguage,
      totalQueries: scoredRows.length,
      allowedDocIdsCount: normalized.allowedDocIds.size,
      allowedDocNamesCount: normalized.allowedDocNames.size,
    },
    summary,
    rows: scoredRows,
  };

  if (opts.writeLatest) {
    fs.mkdirSync(LATEST_DIR, { recursive: true });
    fs.writeFileSync(path.join(LATEST_DIR, 'scorecard.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(LATEST_DIR, 'grading.md'), renderMarkdown(result));
    fs.writeFileSync(path.join(LATEST_DIR, 'per_query.json'), JSON.stringify(scoredRows, null, 2));
  }

  console.log(`[harsh-rubric] pack=${opts.pack} total=${scoredRows.length} final=${summary.finalScore} verdict=${summary.verdict}`);
  if (summary.overallHardFail) {
    console.error('[harsh-rubric] hard gates failed');
    process.exit(1);
  }
  if (summary.finalScore < 95) {
    console.error(`[harsh-rubric] score below readiness threshold: ${summary.finalScore}`);
    process.exit(1);
  }
}

main();
