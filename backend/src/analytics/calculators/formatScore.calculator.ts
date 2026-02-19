// file: src/analytics/calculators/formatScore.calculator.ts
// Answer format quality score calculator - pure function, no DB/IO

export type QueryQualityEvent = {
  ts: string;
  domain?: string;
  intent?: string;
  topScore?: number;
  weakEvidence?: boolean;
  citationsCount?: number;
  fallbackUsed?: boolean;
};

export type ScoreContributions = {
  citationsBonus: number; // +0.25 if citationsCount >= 1
  topScoreBonus: number; // +0.25 if topScore >= 0.80
  weakEvidencePenalty: number; // -0.35 if weakEvidence true
  fallbackPenalty: number; // -0.15 if fallbackUsed true
  rawScore: number; // Sum before clamping
  finalScore: number; // Clamped [0, 1]
};

export type DomainScore = {
  domain: string;
  avgScore: number | null;
  count: number;
};

export type FormatScoreResult = {
  avgScore: number | null;
  distribution: Array<{ bucket: string; count: number }>;
  byDomain: DomainScore[];
  explain: {
    rubric: Record<string, number>;
    clampMin: 0;
    clampMax: 1;
  };
};

// Rubric constants
const RUBRIC = {
  citationsBonus: 0.25, // citationsCount >= 1
  topScoreBonus: 0.25, // topScore >= 0.80
  weakEvidencePenalty: -0.35, // weakEvidence true
  fallbackPenalty: -0.15, // fallbackUsed true
  baseScore: 0.5, // Starting point
};

/**
 * Calculate format score for a single query
 *
 * Base score: 0.5
 * + 0.25 if citationsCount >= 1
 * + 0.25 if topScore >= 0.80
 * - 0.35 if weakEvidence true
 * - 0.15 if fallbackUsed true
 * Clamped to [0, 1]
 */
export function calculateSingleScore(
  query: QueryQualityEvent,
): ScoreContributions {
  let score = RUBRIC.baseScore;

  const citationsBonus =
    (query.citationsCount ?? 0) >= 1 ? RUBRIC.citationsBonus : 0;
  const topScoreBonus = (query.topScore ?? 0) >= 0.8 ? RUBRIC.topScoreBonus : 0;
  const weakEvidencePenalty =
    query.weakEvidence === true ? RUBRIC.weakEvidencePenalty : 0;
  const fallbackPenalty =
    query.fallbackUsed === true ? RUBRIC.fallbackPenalty : 0;

  const rawScore =
    score +
    citationsBonus +
    topScoreBonus +
    weakEvidencePenalty +
    fallbackPenalty;
  const finalScore = Math.max(0, Math.min(1, rawScore));

  return {
    citationsBonus,
    topScoreBonus,
    weakEvidencePenalty,
    fallbackPenalty,
    rawScore,
    finalScore,
  };
}

/**
 * Get score bucket label for distribution
 */
function getScoreBucket(score: number): string {
  if (score >= 0.9) return "0.9-1.0";
  if (score >= 0.8) return "0.8-0.9";
  if (score >= 0.7) return "0.7-0.8";
  if (score >= 0.6) return "0.6-0.7";
  if (score >= 0.5) return "0.5-0.6";
  if (score >= 0.4) return "0.4-0.5";
  if (score >= 0.3) return "0.3-0.4";
  if (score >= 0.2) return "0.2-0.3";
  if (score >= 0.1) return "0.1-0.2";
  return "0.0-0.1";
}

/**
 * Calculate format score statistics from query quality events
 *
 * @param queries - Array of query quality events
 * @returns Format score statistics including average, distribution, and domain breakdown
 */
export function calculateFormatScore(
  queries: QueryQualityEvent[],
): FormatScoreResult {
  const emptyResult: FormatScoreResult = {
    avgScore: null,
    distribution: [],
    byDomain: [],
    explain: {
      rubric: {
        baseScore: RUBRIC.baseScore,
        citationsBonus: RUBRIC.citationsBonus,
        topScoreBonus: RUBRIC.topScoreBonus,
        weakEvidencePenalty: RUBRIC.weakEvidencePenalty,
        fallbackPenalty: RUBRIC.fallbackPenalty,
      },
      clampMin: 0,
      clampMax: 1,
    },
  };

  if (!queries || queries.length === 0) {
    return emptyResult;
  }

  // Calculate scores and aggregate
  const scores: number[] = [];
  const domainScores = new Map<string, number[]>();
  const bucketCounts = new Map<string, number>();

  // Initialize all buckets with 0
  const buckets = [
    "0.0-0.1",
    "0.1-0.2",
    "0.2-0.3",
    "0.3-0.4",
    "0.4-0.5",
    "0.5-0.6",
    "0.6-0.7",
    "0.7-0.8",
    "0.8-0.9",
    "0.9-1.0",
  ];
  for (const bucket of buckets) {
    bucketCounts.set(bucket, 0);
  }

  for (const query of queries) {
    const { finalScore } = calculateSingleScore(query);
    scores.push(finalScore);

    // Domain breakdown
    const domain = query.domain || "unknown";
    if (!domainScores.has(domain)) {
      domainScores.set(domain, []);
    }
    domainScores.get(domain)!.push(finalScore);

    // Distribution bucket
    const bucket = getScoreBucket(finalScore);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }

  // Calculate overall average
  const sum = scores.reduce((acc, s) => acc + s, 0);
  const avgScore =
    scores.length > 0 ? Math.round((sum / scores.length) * 1000) / 1000 : null;

  // Build distribution array (in order)
  const distribution = buckets.map((bucket) => ({
    bucket,
    count: bucketCounts.get(bucket) ?? 0,
  }));

  // Build domain breakdown
  const byDomain: DomainScore[] = [];
  for (const [domain, domScores] of Array.from(domainScores.entries())) {
    const domSum = domScores.reduce((acc, s) => acc + s, 0);
    byDomain.push({
      domain,
      avgScore:
        domScores.length > 0
          ? Math.round((domSum / domScores.length) * 1000) / 1000
          : null,
      count: domScores.length,
    });
  }

  // Sort by count descending
  byDomain.sort((a, b) => b.count - a.count);

  return {
    avgScore,
    distribution,
    byDomain,
    explain: emptyResult.explain,
  };
}

// Test vectors
// Input: [
//   { ts: "2024-01-15T10:00:00Z", domain: "finance", citationsCount: 2, topScore: 0.85, weakEvidence: false, fallbackUsed: false },
//   { ts: "2024-01-15T10:01:00Z", domain: "finance", citationsCount: 0, topScore: 0.5, weakEvidence: true, fallbackUsed: false }
// ]
// Query 1: base(0.5) + citations(0.25) + topScore(0.25) - weak(0) - fallback(0) = 1.0
// Query 2: base(0.5) + citations(0) + topScore(0) - weak(0.35) - fallback(0) = 0.15
// Expected avgScore: (1.0 + 0.15) / 2 = 0.575
