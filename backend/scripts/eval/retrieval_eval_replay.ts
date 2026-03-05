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
};

type ReplayCase = {
  id: string;
  query: string;
  domain: EvalDomain;
  operator: string;
  intent: string;
  expectedDocIds: string[];
};

type ReplayFixture = {
  docs: ReplayDoc[];
  cases: ReplayCase[];
};

type ReplayMetrics = {
  totalCases: number;
  top1HitRate: number;
  precisionAtK: number;
  contaminationRate: number;
  noEvidenceRate: number;
};

const TOP_K = 1;

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
  const domainBoost = queryTokens.includes(doc.domain) ? 0.08 : 0;
  const score =
    overlapRatio * 0.65 +
    Math.min(1, titleOverlap / 2) * 0.15 +
    Math.min(1, keywordOverlap / 3) * 0.12 +
    sectionBoost +
    domainBoost;
  return Math.max(0, Math.min(1, score));
}

function asCandidate(
  doc: ReplayDoc,
  query: string,
  score: number,
  source: "semantic" | "lexical" | "structural",
) {
  return {
    docId: doc.docId,
    location: {
      page: 1,
      sectionKey: doc.sectionKey,
    },
    snippet: `${query} :: ${doc.content}`,
    score,
    locationKey: `d:${doc.docId}|p:1|sec:${doc.sectionKey}|c:${source}`,
    chunkId: `${doc.docId}-${source}`,
  };
}

function buildRequest(
  evalCase: ReplayCase,
  allowedDocIds: string[],
): RetrievalRequest {
  return {
    query: evalCase.query,
    env: "dev",
    signals: {
      intentFamily: evalCase.intent,
      operator: evalCase.operator,
      domainHint: evalCase.domain,
      explicitDocDomains: [evalCase.domain],
      allowedDocumentIds: allowedDocIds,
      allowExpansion: false,
      corpusSearchAllowed: false,
    },
  };
}

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export async function runRetrievalReplayEval(opts?: {
  fixturePath?: string;
}): Promise<{
  generatedAt: string;
  fixturePath: string;
  metrics: ReplayMetrics;
  thresholds: {
    minTop1HitRate: number;
    minPrecisionAtK: number;
    maxContaminationRate: number;
    maxNoEvidenceRate: number;
  };
  passed: boolean;
  failures: string[];
  perCase: Array<{
    id: string;
    topDocId: string | null;
    topDocHit: boolean;
    expectedDocIds: string[];
    topKDocIds: string[];
    contaminationCount: number;
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
      return rankDocs(opts.query, opts.docIds)
        .slice(0, Math.max(opts.k, TOP_K) + 2)
        .map((doc) => {
          const score = Math.max(0.82, computeScore(queryTokens, doc));
          return asCandidate(doc, opts.query, score, "semantic");
        });
    },
  };

  const lexicalIndex = {
    async search(opts: { query: string; docIds?: string[]; k: number }) {
      const queryTokens = uniqueTokens(tokenize(opts.query));
      return rankDocs(opts.query, opts.docIds)
        .slice(0, Math.max(opts.k, TOP_K) + 2)
        .map((doc) => {
          const score = Math.max(0.72, computeScore(queryTokens, doc) - 0.05);
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
      return rankDocs(opts.query, opts.docIds)
        .slice(0, Math.max(opts.k, TOP_K) + 2)
        .map((doc) => {
          const anchorBoost = anchors.has(doc.sectionKey.toLowerCase()) ? 0.08 : 0;
          const score = Math.max(
            0.68,
            computeScore(queryTokens, doc) - 0.1 + anchorBoost,
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
    topDocId: string | null;
    topDocHit: boolean;
    expectedDocIds: string[];
    topKDocIds: string[];
    contaminationCount: number;
    evidenceCount: number;
  }> = [];

  let top1Hits = 0;
  let relevantTopK = 0;
  let totalTopK = 0;
  let contaminationCount = 0;
  let noEvidence = 0;

  for (const evalCase of fixture.cases) {
    const expectedSet = new Set(evalCase.expectedDocIds);
    const distractor = fixture.docs.find(
      (doc) => doc.domain === evalCase.domain && !expectedSet.has(doc.docId),
    );
    const scopedDocIds = distractor
      ? [...evalCase.expectedDocIds, distractor.docId]
      : [...evalCase.expectedDocIds];
    const pack = await engine.retrieve(buildRequest(evalCase, scopedDocIds));
    const topK = pack.evidence.slice(0, TOP_K).map((item) => item.docId);
    const expected = new Set(evalCase.expectedDocIds);
    const topDocId = topK[0] || null;
    const topDocHit = Boolean(topDocId && expected.has(topDocId));
    if (topDocHit) top1Hits += 1;
    if (topK.length === 0) noEvidence += 1;
    const relevant = topK.filter((docId) => expected.has(docId)).length;
    const contamination = topK.filter((docId) => !expected.has(docId)).length;
    relevantTopK += relevant;
    totalTopK += Math.max(1, topK.length);
    contaminationCount += contamination > 0 ? 1 : 0;
    perCase.push({
      id: evalCase.id,
      topDocId,
      topDocHit,
      expectedDocIds: evalCase.expectedDocIds,
      topKDocIds: topK,
      contaminationCount: contamination,
      evidenceCount: pack.evidence.length,
    });
  }

  const metrics: ReplayMetrics = {
    totalCases: fixture.cases.length,
    top1HitRate: round(top1Hits / Math.max(1, fixture.cases.length)),
    precisionAtK: round(relevantTopK / Math.max(1, totalTopK)),
    contaminationRate: round(contaminationCount / Math.max(1, fixture.cases.length)),
    noEvidenceRate: round(noEvidence / Math.max(1, fixture.cases.length)),
  };

  const thresholds = {
    minTop1HitRate: 0.9,
    minPrecisionAtK: 0.75,
    maxContaminationRate: 0.2,
    maxNoEvidenceRate: 0.1,
  };

  const failures: string[] = [];
  if (metrics.top1HitRate < thresholds.minTop1HitRate) {
    failures.push("TOP1_HIT_RATE_BELOW_THRESHOLD");
  }
  if (metrics.precisionAtK < thresholds.minPrecisionAtK) {
    failures.push("PRECISION_AT_K_BELOW_THRESHOLD");
  }
  if (metrics.contaminationRate > thresholds.maxContaminationRate) {
    failures.push("CONTAMINATION_RATE_ABOVE_THRESHOLD");
  }
  if (metrics.noEvidenceRate > thresholds.maxNoEvidenceRate) {
    failures.push("NO_EVIDENCE_RATE_ABOVE_THRESHOLD");
  }

  return {
    generatedAt: new Date().toISOString(),
    fixturePath,
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

async function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  const fixturePath = parseFixturePathArg(argv);
  const report = await runRetrievalReplayEval({
    fixturePath: fixturePath || undefined,
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
