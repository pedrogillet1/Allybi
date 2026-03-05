/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { RetrievalEngineService } from "../../src/services/core/retrieval/retrievalEngine.runtime.service";
import type { RetrievalRequest } from "../../src/services/core/retrieval/retrievalEngine.service";
import {
  getBankLoaderInstance,
  initializeBanks,
} from "../../src/services/core/banks/bankLoader.service";

type EvalDomain = "finance" | "legal" | "medical" | "ops";

type ReplayDoc = {
  docId: string;
  title: string;
  filename: string;
  domain: EvalDomain;
  docType: string;
  sectionKey: string;
  keywords: string[];
  content: string;
  tableSpec?: {
    tableId?: string;
    sectionKey?: string;
    header: string[];
    rows: Array<Array<string | number | null>>;
    unitRaw?: string;
    unitNormalized?: string;
    scaleFactor?: string;
    periodTokens?: string[];
    footnotes?: string[];
  };
};

type ReplayCase = {
  id: string;
  query: string;
  domain: EvalDomain;
  operator: string;
  intent: string;
  expectedDocIds: string[];
  expectedSectionKeys?: string[];
  expectedTableIds?: string[];
};

type ReplayFixture = {
  docs: ReplayDoc[];
  cases: ReplayCase[];
};

type ReplayMetrics = {
  totalCases: number;
  compareCases: number;
  nonCompareCases: number;
  top1HitRate: number;
  top1SectionHitRate: number;
  recallAt5: number;
  sectionRecallAt5: number;
  recallAt10: number;
  precisionAtK: number;
  contaminationRate: number;
  compareContaminationRate: number;
  nonCompareContaminationRate: number;
  noEvidenceRate: number;
  tableCases: number;
  tableTop1HitRate: number;
  tableRecallAt5: number;
};

type ReplayMode = "scoped" | "open_world" | "open_world_strict";

const DEFAULT_TOP_K = 1;
const KNOWN_DOMAINS: EvalDomain[] = ["finance", "legal", "medical", "ops"];

function tokenize(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}

function detectQueryDomain(tokens: string[]): EvalDomain | null {
  const known = new Set(KNOWN_DOMAINS);
  for (const token of tokens) {
    const normalized = String(token || "").trim().toLowerCase();
    if (known.has(normalized as EvalDomain)) return normalized as EvalDomain;
  }
  return null;
}

function isCompareQuery(query: string): boolean {
  const normalized = ` ${String(query || "").toLowerCase()} `;
  return (
    normalized.includes(" compare ") ||
    normalized.includes(" versus ") ||
    normalized.includes(" vs ") ||
    normalized.includes(" and ")
  );
}

function loadFixture(fixturePath: string): ReplayFixture {
  const raw = fs.readFileSync(fixturePath, "utf8");
  const parsed = JSON.parse(raw) as ReplayFixture;
  if (!Array.isArray(parsed.docs) || parsed.docs.length === 0) {
    throw new Error("fixture docs missing");
  }
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error("fixture cases missing");
  }
  return parsed;
}

function computeScore(queryTokens: string[], doc: ReplayDoc): number {
  const titleTokens = tokenize(doc.title);
  const fileTokens = tokenize(doc.filename);
  const keywordTokens = tokenize(doc.keywords.join(" "));
  const contentTokens = tokenize(doc.content);
  const queryDomain = detectQueryDomain(queryTokens);
  const docTokens = new Set([
    ...titleTokens,
    ...fileTokens,
    ...keywordTokens,
    ...contentTokens,
  ]);
  const overlap = queryTokens.filter((token) => docTokens.has(token)).length;
  const overlapRatio = overlap / Math.max(1, queryTokens.length);
  const titleOverlap = queryTokens.filter((token) =>
    titleTokens.includes(token),
  ).length;
  const keywordOverlap = queryTokens.filter((token) =>
    keywordTokens.includes(token),
  ).length;
  const sectionBoost = queryTokens.includes(doc.sectionKey.toLowerCase())
    ? 0.12
    : 0;
  const domainBoost = queryDomain === doc.domain
    ? 0.3
    : queryTokens.includes(doc.domain)
      ? 0.15
      : 0;
  const wrongDomainPenalty =
    queryDomain != null && queryDomain !== doc.domain ? 0.3 : 0;
  const score =
    overlapRatio * 0.65 +
    Math.min(1, titleOverlap / 2) * 0.15 +
    Math.min(1, keywordOverlap / 3) * 0.12 +
    sectionBoost +
    domainBoost -
    wrongDomainPenalty;
  return Math.max(0, Math.min(1, score));
}

function asCandidate(
  doc: ReplayDoc,
  query: string,
  score: number,
  source: "semantic" | "lexical" | "structural",
) {
  const tableId = String(doc.tableSpec?.tableId || "").trim();
  const table = doc.tableSpec
    ? {
        header: Array.isArray(doc.tableSpec.header)
          ? doc.tableSpec.header
          : [],
        rows: Array.isArray(doc.tableSpec.rows) ? doc.tableSpec.rows : [],
        unitAnnotation:
          doc.tableSpec.unitRaw || doc.tableSpec.unitNormalized
            ? {
                unitRaw: String(
                  doc.tableSpec.unitRaw || doc.tableSpec.unitNormalized || "",
                ).trim(),
                unitNormalized: String(
                  doc.tableSpec.unitNormalized || doc.tableSpec.unitRaw || "",
                ).trim(),
              }
            : null,
        scaleFactor: String(doc.tableSpec.scaleFactor || "").trim() || null,
        periodTokens: Array.isArray(doc.tableSpec.periodTokens)
          ? doc.tableSpec.periodTokens
          : null,
        footnotes: Array.isArray(doc.tableSpec.footnotes)
          ? doc.tableSpec.footnotes
          : null,
        warnings: tableId ? [`table_id:${tableId}`] : undefined,
      }
    : undefined;
  return {
    docId: doc.docId,
    location: {
      page: 1,
      sectionKey: doc.sectionKey,
    },
    snippet: `${query} :: ${doc.content}`,
    score,
    table,
    locationKey: `d:${doc.docId}|p:1|sec:${doc.sectionKey}|c:${source}`,
    chunkId: `${doc.docId}-${source}`,
  };
}

function buildRequest(
  evalCase: ReplayCase,
  allowedDocIds?: string[],
  mode: ReplayMode = "scoped",
): RetrievalRequest {
  const enrichedQuery = `${evalCase.domain} ${evalCase.query}`.trim();
  const singleExpectedDocId =
    evalCase.operator !== "compare" && evalCase.expectedDocIds.length === 1
      ? evalCase.expectedDocIds[0]
      : null;
  return {
    query: enrichedQuery,
    env: "dev",
    signals: {
      intentFamily: evalCase.intent,
      operator: evalCase.operator,
      domainHint: evalCase.domain,
      explicitDocDomains: [evalCase.domain],
      explicitDocLock: Boolean(singleExpectedDocId),
      explicitDocRef: Boolean(singleExpectedDocId),
      activeDocId: singleExpectedDocId,
      resolvedDocId: singleExpectedDocId,
      hardScopeActive: Boolean(singleExpectedDocId),
      singleDocIntent: evalCase.operator !== "compare",
      allowedDocumentIds: Array.isArray(allowedDocIds)
        ? allowedDocIds
        : undefined,
      allowExpansion: false,
      corpusSearchAllowed:
        mode !== "scoped" && evalCase.operator === "compare",
    },
  };
}

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function normalizeValueList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function resolveExpectedSectionKeys(
  evalCase: ReplayCase,
  docsById: Map<string, ReplayDoc>,
): string[] {
  const explicit = normalizeValueList(evalCase.expectedSectionKeys);
  if (explicit.length > 0) return explicit;
  const inferred = evalCase.expectedDocIds
    .map((docId) => docsById.get(docId))
    .filter(Boolean)
    .map((doc) => String(doc?.sectionKey || "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(inferred));
}

function resolveExpectedTableIds(
  evalCase: ReplayCase,
  docsById: Map<string, ReplayDoc>,
): string[] {
  const explicit = normalizeValueList(evalCase.expectedTableIds);
  if (explicit.length > 0) return explicit;
  return [];
}

function resolveEvidenceTableId(item: any): string | null {
  if (!item || item.evidenceType !== "table" || !item.table) return null;
  const warnings = Array.isArray(item.table?.warnings) ? item.table.warnings : [];
  for (const warning of warnings) {
    const raw = String(warning || "").trim();
    if (!raw.toLowerCase().startsWith("table_id:")) continue;
    const id = raw.slice("table_id:".length).trim().toLowerCase();
    if (id) return id;
  }
  const section = String(
    item.location?.sectionKey || item.location?.section || "__none__",
  )
    .trim()
    .toLowerCase();
  const docId = String(item.docId || "").trim().toLowerCase();
  if (!docId) return null;
  return `${docId}::${section || "__none__"}::table1`;
}

export async function runRetrievalReplayEval(opts?: {
  fixturePath?: string;
  k?: number;
  mode?: ReplayMode;
}): Promise<{
  generatedAt: string;
  fixturePath: string;
  k: number;
  mode: ReplayMode;
  metrics: ReplayMetrics;
  thresholds: {
    minTop1HitRate: number;
    minTop1SectionHitRate: number;
    minRecallAt5: number;
    minSectionRecallAt5: number;
    minRecallAt10: number;
    minPrecisionAtK: number;
    maxContaminationRate: number;
    maxCompareContaminationRate: number;
    maxNonCompareContaminationRate: number;
    maxNoEvidenceRate: number;
    minTableTop1HitRate: number;
    minTableRecallAt5: number;
  };
  passed: boolean;
  failures: string[];
  perCase: Array<{
    id: string;
    operator: string;
    topDocId: string | null;
    topDocHit: boolean;
    expectedDocIds: string[];
    topSectionKey: string | null;
    topSectionHit: boolean;
    expectedSectionKeys: string[];
    topKSectionKeys: string[];
    topTableId: string | null;
    topTableHit: boolean;
    expectedTableIds: string[];
    topKTableIds: string[];
    topKDocIds: string[];
    top5DocIds: string[];
    top10DocIds: string[];
    contaminationCount: number;
    contaminatedDocIds: string[];
    evidenceCount: number;
  }>;
}> {
  const fixturePath =
    opts?.fixturePath ||
    path.resolve(
      __dirname,
      "../../src/tests/retrieval/replay-fixtures/retrieval-replay.fixture.json",
    );
  const fixture = loadFixture(fixturePath);
  const mode: ReplayMode = (() => {
    if (opts?.mode === "open_world_strict") return "open_world_strict";
    if (opts?.mode === "open_world") return "open_world";
    return "scoped";
  })();
  const effectiveTopK = Math.max(
    1,
    Number.isFinite(Number(opts?.k)) ? Math.floor(Number(opts?.k)) : DEFAULT_TOP_K,
  );

  await initializeBanks({
    env: "dev",
    rootDir: path.resolve(__dirname, "../../src/data_banks"),
    strict: false,
    validateSchemas: false,
    allowEmptyChecksumsInNonProd: true,
    enableHotReload: false,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });
  const bankLoader = getBankLoaderInstance();
  const docsById = new Map(fixture.docs.map((doc) => [doc.docId, doc]));

  const docStore = {
    async listDocs() {
      return fixture.docs.map((doc) => ({
        docId: doc.docId,
        title: doc.title,
        filename: doc.filename,
        mimeType: "application/pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }));
    },
    async getDocMeta(docId: string) {
      const doc = docsById.get(docId);
      if (!doc) return null;
      return {
        docId: doc.docId,
        title: doc.title,
        filename: doc.filename,
        mimeType: "application/pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    },
  };

  function rankDocs(query: string, docIds?: string[]): ReplayDoc[] {
    const allowed = new Set((docIds || []).map((id) => String(id || "").trim()));
    const queryTokens = uniqueTokens(tokenize(query));
    const all = fixture.docs
      .filter((doc) => allowed.size === 0 || allowed.has(doc.docId))
      .map((doc) => ({ doc, score: computeScore(queryTokens, doc) }))
      .sort((a, b) => b.score - a.score);
    return all.map((entry) => entry.doc);
  }

  const semanticIndex = {
    async search(opts: { query: string; docIds?: string[]; k: number }) {
      const queryTokens = uniqueTokens(tokenize(opts.query));
      const compareLift = isCompareQuery(opts.query) ? 0.22 : 0;
      return rankDocs(opts.query, opts.docIds)
        .slice(0, Math.max(opts.k, effectiveTopK) + 1)
        .map((doc) => {
          const score = Math.max(
            0.2,
            Math.min(1, computeScore(queryTokens, doc) + compareLift),
          );
          return asCandidate(doc, opts.query, score, "semantic");
        });
    },
  };

  const lexicalIndex = {
    async search(opts: { query: string; docIds?: string[]; k: number }) {
      const queryTokens = uniqueTokens(tokenize(opts.query));
      const compareLift = isCompareQuery(opts.query) ? 0.18 : 0;
      return rankDocs(opts.query, opts.docIds)
        .slice(0, Math.max(opts.k, effectiveTopK) + 1)
        .map((doc) => {
          const score = Math.max(
            0.15,
            Math.min(1, computeScore(queryTokens, doc) - 0.07 + compareLift),
          );
          return asCandidate(doc, opts.query, score, "lexical");
        });
    },
  };

  const structuralIndex = {
    async search(opts: {
      query: string;
      docIds?: string[];
      k: number;
      anchors: string[];
    }) {
      const anchors = new Set(
        (opts.anchors || []).map((anchor) => String(anchor || "").toLowerCase()),
      );
      const queryTokens = uniqueTokens(tokenize(opts.query));
      const compareLift = isCompareQuery(opts.query) ? 0.16 : 0;
      return rankDocs(opts.query, opts.docIds)
        .slice(0, Math.max(opts.k, effectiveTopK) + 1)
        .map((doc) => {
          const anchorBoost = anchors.has(doc.sectionKey.toLowerCase()) ? 0.08 : 0;
          const score = Math.max(
            0.12,
            Math.min(1, computeScore(queryTokens, doc) - 0.1 + anchorBoost + compareLift),
          );
          return asCandidate(
            doc,
            opts.query,
            score,
            "structural",
          );
        });
    },
  };

  const engine = new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    lexicalIndex as any,
    structuralIndex as any,
  );

  const perCase: Array<{
    id: string;
    operator: string;
    topDocId: string | null;
    topDocHit: boolean;
    expectedDocIds: string[];
    topSectionKey: string | null;
    topSectionHit: boolean;
    expectedSectionKeys: string[];
    topKSectionKeys: string[];
    topTableId: string | null;
    topTableHit: boolean;
    expectedTableIds: string[];
    topKTableIds: string[];
    topKDocIds: string[];
    top5DocIds: string[];
    top10DocIds: string[];
    contaminationCount: number;
    contaminatedDocIds: string[];
    evidenceCount: number;
  }> = [];

  let top1Hits = 0;
  let top1SectionHits = 0;
  let recallAt5Hits = 0;
  let sectionRecallAt5Hits = 0;
  let recallAt10Hits = 0;
  let compareCases = 0;
  let nonCompareCases = 0;
  let compareContaminationCases = 0;
  let nonCompareContaminationCases = 0;
  let relevantTopK = 0;
  let totalTopK = 0;
  let contaminationCount = 0;
  let noEvidence = 0;
  let sectionCases = 0;
  let tableCases = 0;
  let tableTop1Hits = 0;
  let tableRecallAt5Hits = 0;

  for (const evalCase of fixture.cases) {
    const expectedSet = new Set(evalCase.expectedDocIds);
    const distractor = evalCase.operator === "compare"
      ? null
      : fixture.docs.find(
          (doc) => doc.domain === evalCase.domain && !expectedSet.has(doc.docId),
        );
    const scopedDocIds = distractor
      ? [...evalCase.expectedDocIds, distractor.docId]
      : [...evalCase.expectedDocIds];
    const openWorldDomainDocIds = fixture.docs
      .filter((doc) => doc.domain === evalCase.domain)
      .map((doc) => doc.docId);
    const allowedDocIds = mode === "scoped"
      ? scopedDocIds
      : mode === "open_world"
        ? openWorldDomainDocIds
        : evalCase.operator === "compare"
          ? evalCase.expectedDocIds
          : undefined;
    const pack = await engine.retrieve(buildRequest(evalCase, allowedDocIds, mode));
    const top1 = pack.evidence.slice(0, 1).map((item) => item.docId);
    const topK = pack.evidence.slice(0, effectiveTopK).map((item) => item.docId);
    const top5 = pack.evidence.slice(0, 5).map((item) => item.docId);
    const top10 = pack.evidence.slice(0, 10).map((item) => item.docId);
    const expected = new Set(evalCase.expectedDocIds);
    const expectedSectionKeys = resolveExpectedSectionKeys(evalCase, docsById);
    const expectedSectionSet = new Set(expectedSectionKeys);
    const topKSectionKeys = Array.from(
      new Set(
        pack.evidence
          .slice(0, effectiveTopK)
          .map((item) =>
            String(item.location?.sectionKey || item.location?.section || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
    const top5SectionKeys = Array.from(
      new Set(
        pack.evidence
          .slice(0, 5)
          .map((item) =>
            String(item.location?.sectionKey || item.location?.section || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
    const topSectionKey = topKSectionKeys[0] || null;
    const topSectionHit = Boolean(
      topSectionKey && expectedSectionSet.has(topSectionKey),
    );
    if (expectedSectionKeys.length > 0) {
      sectionCases += 1;
      if (topSectionHit) top1SectionHits += 1;
      if (top5SectionKeys.some((sectionKey) => expectedSectionSet.has(sectionKey))) {
        sectionRecallAt5Hits += 1;
      }
    }
    const expectedTableIds = resolveExpectedTableIds(evalCase, docsById);
    const expectedTableSet = new Set(expectedTableIds);
    const topKTableIds = Array.from(
      new Set(
        pack.evidence
          .slice(0, effectiveTopK)
          .map((item) => resolveEvidenceTableId(item))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const top5TableIds = Array.from(
      new Set(
        pack.evidence
          .slice(0, 5)
          .map((item) => resolveEvidenceTableId(item))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const topTableId = topKTableIds[0] || null;
    const topTableHit = Boolean(topTableId && expectedTableSet.has(topTableId));
    if (expectedTableIds.length > 0) {
      tableCases += 1;
      if (topTableHit) tableTop1Hits += 1;
      if (top5TableIds.some((tableId) => expectedTableSet.has(tableId))) {
        tableRecallAt5Hits += 1;
      }
    }
    const topDocId = top1[0] || null;
    const topDocHit = Boolean(topDocId && expected.has(topDocId));
    if (topDocHit) top1Hits += 1;
    if (top5.some((docId) => expected.has(docId))) recallAt5Hits += 1;
    if (top10.some((docId) => expected.has(docId))) recallAt10Hits += 1;
    if (topK.length === 0) noEvidence += 1;
    const relevant = topK.filter((docId) => expected.has(docId)).length;
    const contaminatedDocIds = topK.filter((docId) => !expected.has(docId));
    const contamination = contaminatedDocIds.length;
    relevantTopK += relevant;
    totalTopK += Math.max(1, topK.length);
    contaminationCount += contamination > 0 ? 1 : 0;
    if (evalCase.operator === "compare") {
      compareCases += 1;
      if (contamination > 0) compareContaminationCases += 1;
    } else {
      nonCompareCases += 1;
      if (contamination > 0) nonCompareContaminationCases += 1;
    }
    perCase.push({
      id: evalCase.id,
      operator: evalCase.operator,
      topDocId,
      topDocHit,
      expectedDocIds: evalCase.expectedDocIds,
      topSectionKey,
      topSectionHit,
      expectedSectionKeys,
      topKSectionKeys,
      topTableId,
      topTableHit,
      expectedTableIds,
      topKTableIds,
      topKDocIds: topK,
      top5DocIds: top5,
      top10DocIds: top10,
      contaminationCount: contamination,
      contaminatedDocIds,
      evidenceCount: pack.evidence.length,
    });
  }

  const metrics: ReplayMetrics = {
    totalCases: fixture.cases.length,
    compareCases,
    nonCompareCases,
    top1HitRate: round(top1Hits / Math.max(1, fixture.cases.length)),
    top1SectionHitRate: round(top1SectionHits / Math.max(1, sectionCases)),
    recallAt5: round(recallAt5Hits / Math.max(1, fixture.cases.length)),
    sectionRecallAt5: round(sectionRecallAt5Hits / Math.max(1, sectionCases)),
    recallAt10: round(recallAt10Hits / Math.max(1, fixture.cases.length)),
    precisionAtK: round(relevantTopK / Math.max(1, totalTopK)),
    contaminationRate: round(contaminationCount / Math.max(1, fixture.cases.length)),
    compareContaminationRate: round(
      compareContaminationCases / Math.max(1, compareCases),
    ),
    nonCompareContaminationRate: round(
      nonCompareContaminationCases / Math.max(1, nonCompareCases),
    ),
    noEvidenceRate: round(noEvidence / Math.max(1, fixture.cases.length)),
    tableCases,
    tableTop1HitRate: round(tableTop1Hits / Math.max(1, tableCases)),
    tableRecallAt5: round(tableRecallAt5Hits / Math.max(1, tableCases)),
  };

  const thresholds = {
    minTop1HitRate: 0.95,
    minTop1SectionHitRate: 0.95,
    minRecallAt5: 0.95,
    minSectionRecallAt5: 0.95,
    minRecallAt10: 0.95,
    minPrecisionAtK: 0.85,
    maxContaminationRate: 0.05,
    maxCompareContaminationRate: 0,
    maxNonCompareContaminationRate: 0,
    maxNoEvidenceRate: 0.05,
    minTableTop1HitRate: 0.9,
    minTableRecallAt5: 0.9,
  };

  const failures: string[] = [];
  if (metrics.top1HitRate < thresholds.minTop1HitRate) {
    failures.push("TOP1_HIT_RATE_BELOW_THRESHOLD");
  }
  if (sectionCases > 0 && metrics.top1SectionHitRate < thresholds.minTop1SectionHitRate) {
    failures.push("TOP1_SECTION_HIT_RATE_BELOW_THRESHOLD");
  }
  if (metrics.recallAt5 < thresholds.minRecallAt5) {
    failures.push("RECALL_AT_5_BELOW_THRESHOLD");
  }
  if (sectionCases > 0 && metrics.sectionRecallAt5 < thresholds.minSectionRecallAt5) {
    failures.push("SECTION_RECALL_AT_5_BELOW_THRESHOLD");
  }
  if (metrics.recallAt10 < thresholds.minRecallAt10) {
    failures.push("RECALL_AT_10_BELOW_THRESHOLD");
  }
  if (metrics.precisionAtK < thresholds.minPrecisionAtK) {
    failures.push("PRECISION_AT_K_BELOW_THRESHOLD");
  }
  if (metrics.contaminationRate > thresholds.maxContaminationRate) {
    failures.push("CONTAMINATION_RATE_ABOVE_THRESHOLD");
  }
  if (metrics.compareContaminationRate > thresholds.maxCompareContaminationRate) {
    failures.push("COMPARE_CONTAMINATION_RATE_ABOVE_THRESHOLD");
  }
  if (
    metrics.nonCompareContaminationRate >
    thresholds.maxNonCompareContaminationRate
  ) {
    failures.push("NON_COMPARE_CONTAMINATION_RATE_ABOVE_THRESHOLD");
  }
  if (metrics.noEvidenceRate > thresholds.maxNoEvidenceRate) {
    failures.push("NO_EVIDENCE_RATE_ABOVE_THRESHOLD");
  }
  if (tableCases > 0 && metrics.tableTop1HitRate < thresholds.minTableTop1HitRate) {
    failures.push("TABLE_TOP1_HIT_RATE_BELOW_THRESHOLD");
  }
  if (tableCases > 0 && metrics.tableRecallAt5 < thresholds.minTableRecallAt5) {
    failures.push("TABLE_RECALL_AT_5_BELOW_THRESHOLD");
  }

  return {
    generatedAt: new Date().toISOString(),
    fixturePath,
    k: effectiveTopK,
    mode,
    metrics,
    thresholds,
    passed: failures.length === 0,
    failures,
    perCase,
  };
}

function parseFixturePathArg(argv: string[]): string | undefined {
  const prefixed = argv.find((arg) => arg.startsWith("--fixture="));
  if (prefixed) return String(prefixed.split("=", 2)[1] || "").trim();
  const idx = argv.indexOf("--fixture");
  if (idx >= 0) return String(argv[idx + 1] || "").trim();
  return undefined;
}

function parseTopKArg(argv: string[]): number | undefined {
  const prefixed = argv.find((arg) => arg.startsWith("--k="));
  if (prefixed) return Number(String(prefixed.split("=", 2)[1] || "").trim());
  const idx = argv.indexOf("--k");
  if (idx >= 0) return Number(String(argv[idx + 1] || "").trim());
  return undefined;
}

function parseModeArg(argv: string[]): ReplayMode | undefined {
  const prefixed = argv.find((arg) => arg.startsWith("--mode="));
  const raw = prefixed
    ? String(prefixed.split("=", 2)[1] || "").trim().toLowerCase()
    : (() => {
        const idx = argv.indexOf("--mode");
        if (idx >= 0) return String(argv[idx + 1] || "").trim().toLowerCase();
        return "";
      })();
  if (raw === "open_world" || raw === "open-world" || raw === "openworld") {
    return "open_world";
  }
  if (
    raw === "open_world_strict" ||
    raw === "open-world-strict" ||
    raw === "openworldstrict"
  ) {
    return "open_world_strict";
  }
  if (raw === "scoped") return "scoped";
  return undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  const fixturePath = parseFixturePathArg(argv);
  const k = parseTopKArg(argv);
  const mode = parseModeArg(argv);
  const report = await runRetrievalReplayEval({
    fixturePath: fixturePath || undefined,
    k,
    mode,
  });
  console.log(JSON.stringify(report, null, 2));
  const outputPath = path.resolve(
    __dirname,
    "../../reports/cert/retrieval-replay-eval.json",
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (strict && !report.passed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void main().catch((error) => {
    console.error("[retrieval_eval_replay] failed:", error);
    process.exitCode = 1;
  });
}
