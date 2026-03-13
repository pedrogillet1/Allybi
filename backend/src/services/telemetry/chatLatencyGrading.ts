import {
  calculateStats,
  p95,
  p99,
} from "../admin/_shared/percentiles";

export type LatencyBucket =
  | "global"
  | "navigation"
  | "single_doc"
  | "multi_doc"
  | "general";

export type LatencyGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export type LatencySample = {
  ackMs?: number | null;
  ttft?: number | null;
  firstUsefulContentMs?: number | null;
  totalMs?: number | null;
  streamStarted?: boolean;
  firstTokenReceived?: boolean;
  streamEnded?: boolean;
  wasAborted?: boolean;
  clientDisconnected?: boolean;
  chunksSent?: number | null;
  answerMode?: string | null;
  operatorFamily?: string | null;
  distinctDocs?: number | null;
  retrievalAdequate?: boolean;
  navOpenRequested?: boolean;
  navWhereRequested?: boolean;
  navDiscoverRequested?: boolean;
};

type LatencyThresholds = {
  ackP95Target: number;
  ttftP95APlus: number;
  ttftP95A: number;
  ttftP95B: number;
  ttftP95C: number;
  ttftP95D: number;
  totalP95APlus: number;
  totalP95A: number;
  totalP95B: number;
  totalP95C: number;
  totalP95D: number;
  totalP99Target: number;
  deltaBefore1200Target: number;
};

export type LatencyStats = {
  count: number;
  ackMs: ReturnType<typeof calculateStats>;
  ttftMs: ReturnType<typeof calculateStats>;
  firstUsefulContentMs: ReturnType<typeof calculateStats>;
  totalMs: ReturnType<typeof calculateStats>;
  deltaBefore1200Rate: number;
  streamStartRate: number;
  abortRate: number;
  disconnectRate: number;
  consistencyRatio: number;
};

export type LatencyGradeResult = {
  bucket: LatencyBucket;
  count: number;
  grade: LatencyGrade;
  score: number;
  stats: LatencyStats;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toPositive(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function ratio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

function scoreByThreshold(
  actual: number,
  target: number,
  hardFail: number,
  weight: number,
): number {
  if (!actual || actual <= 0) return 0;
  if (actual <= target) return weight;
  if (actual >= hardFail) return 0;
  const progress = 1 - (actual - target) / Math.max(hardFail - target, 1);
  return Math.round(clamp(progress, 0, 1) * weight * 100) / 100;
}

function bucketThresholds(bucket: LatencyBucket): LatencyThresholds {
  if (bucket === "navigation") {
    return {
      ackP95Target: 150,
      ttftP95APlus: 400,
      ttftP95A: 600,
      ttftP95B: 1000,
      ttftP95C: 1600,
      ttftP95D: 2500,
      totalP95APlus: 900,
      totalP95A: 1500,
      totalP95B: 3000,
      totalP95C: 5000,
      totalP95D: 8000,
      totalP99Target: 2000,
      deltaBefore1200Target: 0.98,
    };
  }
  if (bucket === "single_doc") {
    return {
      ackP95Target: 150,
      ttftP95APlus: 1000,
      ttftP95A: 1300,
      ttftP95B: 2000,
      ttftP95C: 3000,
      ttftP95D: 5000,
      totalP95APlus: 7500,
      totalP95A: 9000,
      totalP95B: 12000,
      totalP95C: 16000,
      totalP95D: 22000,
      totalP99Target: 12000,
      deltaBefore1200Target: 0.95,
    };
  }
  if (bucket === "multi_doc") {
    return {
      ackP95Target: 150,
      ttftP95APlus: 1300,
      ttftP95A: 1600,
      ttftP95B: 2200,
      ttftP95C: 3200,
      ttftP95D: 5200,
      totalP95APlus: 11000,
      totalP95A: 13000,
      totalP95B: 15000,
      totalP95C: 18000,
      totalP95D: 24000,
      totalP99Target: 15000,
      deltaBefore1200Target: 0.9,
    };
  }
  return {
    ackP95Target: 150,
    ttftP95APlus: 900,
    ttftP95A: 1300,
    ttftP95B: 2000,
    ttftP95C: 3000,
    ttftP95D: 5000,
    totalP95APlus: 7000,
    totalP95A: 9000,
    totalP95B: 12000,
    totalP95C: 16000,
    totalP95D: 22000,
    totalP99Target: 12000,
    deltaBefore1200Target: 0.95,
  };
}

export function classifyLatencyBucket(sample: LatencySample): LatencyBucket {
  const answerMode = String(sample.answerMode || "")
    .trim()
    .toLowerCase();
  const operatorFamily = String(sample.operatorFamily || "")
    .trim()
    .toLowerCase();
  const wantsNav =
    Boolean(sample.navOpenRequested) ||
    Boolean(sample.navWhereRequested) ||
    Boolean(sample.navDiscoverRequested) ||
    answerMode.startsWith("nav") ||
    answerMode.includes("listing") ||
    operatorFamily.includes("open") ||
    operatorFamily.includes("locate") ||
    operatorFamily.includes("discover") ||
    operatorFamily.includes("list");
  if (wantsNav) return "navigation";

  const distinctDocs = Number(sample.distinctDocs || 0);
  const compareLike =
    answerMode.includes("compare") ||
    answerMode.includes("delta") ||
    operatorFamily.includes("compare");
  if (compareLike || distinctDocs > 1) return "multi_doc";

  const docGrounded =
    distinctDocs === 1 ||
    Boolean(sample.retrievalAdequate) ||
    answerMode.includes("doc") ||
    answerMode.includes("grounded");
  if (docGrounded) return "single_doc";

  return "general";
}

function buildStats(samples: LatencySample[]): LatencyStats {
  const ackValues = samples
    .map((sample) => toPositive(sample.ackMs))
    .filter((value): value is number => value !== null);
  const ttftValues = samples
    .map((sample) => toPositive(sample.ttft))
    .filter((value): value is number => value !== null);
  const usefulValues = samples
    .map((sample) => toPositive(sample.firstUsefulContentMs))
    .filter((value): value is number => value !== null);
  const totalValues = samples
    .map((sample) => toPositive(sample.totalMs))
    .filter((value): value is number => value !== null);

  const streamed = samples.filter((sample) => sample.streamStarted);
  const deltaBefore1200 = streamed.filter((sample) => {
    const ttft = toPositive(sample.ttft);
    return ttft !== null && ttft <= 1200 && sample.firstTokenReceived;
  });
  const aborted = streamed.filter((sample) => sample.wasAborted);
  const disconnected = streamed.filter((sample) => sample.clientDisconnected);

  const totalP50 = calculateStats(totalValues).p50 || 0;
  const totalP95 = p95(totalValues);
  return {
    count: samples.length,
    ackMs: calculateStats(ackValues),
    ttftMs: calculateStats(ttftValues),
    firstUsefulContentMs: calculateStats(usefulValues),
    totalMs: calculateStats(totalValues),
    deltaBefore1200Rate: ratio(deltaBefore1200.length, streamed.length),
    streamStartRate: ratio(streamed.length, samples.length),
    abortRate: ratio(aborted.length, streamed.length),
    disconnectRate: ratio(disconnected.length, streamed.length),
    consistencyRatio:
      totalP50 > 0 ? Math.round((totalP95 / totalP50) * 100) / 100 : 0,
  };
}

export function gradeLatency(
  samples: LatencySample[],
  bucket: LatencyBucket = "global",
): LatencyGradeResult {
  const stats = buildStats(samples);
  const thresholds = bucketThresholds(bucket);

  const ttftP95 = stats.ttftMs.p95;
  const totalP95 = stats.totalMs.p95;
  const totalP99 = p99(
    samples
      .map((sample) => toPositive(sample.totalMs))
      .filter((value): value is number => value !== null),
  );

  let grade: LatencyGrade = "F";
  if (
    stats.ackMs.p95 <= thresholds.ackP95Target &&
    ttftP95 <= thresholds.ttftP95APlus &&
    stats.firstUsefulContentMs.p95 <=
      Math.max(thresholds.ttftP95APlus * 2, thresholds.ttftP95APlus + 800) &&
    totalP95 <= thresholds.totalP95APlus &&
    totalP99 <= thresholds.totalP99Target &&
    stats.deltaBefore1200Rate >= thresholds.deltaBefore1200Target
  ) {
    grade = "A+";
  } else if (ttftP95 <= thresholds.ttftP95A && totalP95 <= thresholds.totalP95A) {
    grade = "A";
  } else if (ttftP95 <= thresholds.ttftP95B && totalP95 <= thresholds.totalP95B) {
    grade = "B";
  } else if (ttftP95 <= thresholds.ttftP95C && totalP95 <= thresholds.totalP95C) {
    grade = "C";
  } else if (ttftP95 <= thresholds.ttftP95D && totalP95 <= thresholds.totalP95D) {
    grade = "D";
  }

  const consistencyScore = (() => {
    if (!stats.consistencyRatio) return 0;
    if (stats.consistencyRatio <= 2.5) return 15;
    if (stats.consistencyRatio >= 6) return 0;
    return Math.round(
      clamp(1 - (stats.consistencyRatio - 2.5) / 3.5, 0, 1) * 1500,
    ) / 100;
  })();
  const streamingHealthScore = (() => {
    const streamStartScore = clamp(stats.streamStartRate / 0.95, 0, 1) * 4;
    const deltaScore =
      clamp(stats.deltaBefore1200Rate / thresholds.deltaBefore1200Target, 0, 1) *
      4;
    const abortPenalty = clamp(stats.abortRate / 0.1, 0, 1) * 2;
    return Math.round(clamp(streamStartScore + deltaScore - abortPenalty, 0, 10) * 100) / 100;
  })();
  const score =
    scoreByThreshold(stats.ttftMs.p95, thresholds.ttftP95APlus, thresholds.ttftP95D, 40) +
    scoreByThreshold(stats.totalMs.p95, thresholds.totalP95APlus, thresholds.totalP95D, 35) +
    consistencyScore +
    streamingHealthScore;

  return {
    bucket,
    count: samples.length,
    grade,
    score: Math.round(clamp(score, 0, 100) * 100) / 100,
    stats,
  };
}

export function buildLatencyBuckets(samples: LatencySample[]): Record<string, LatencyGradeResult> {
  const byBucket: Record<LatencyBucket, LatencySample[]> = {
    global: samples,
    navigation: [],
    single_doc: [],
    multi_doc: [],
    general: [],
  };
  for (const sample of samples) {
    byBucket[classifyLatencyBucket(sample)].push(sample);
  }
  return {
    global: gradeLatency(byBucket.global, "global"),
    navigation: gradeLatency(byBucket.navigation, "navigation"),
    single_doc: gradeLatency(byBucket.single_doc, "single_doc"),
    multi_doc: gradeLatency(byBucket.multi_doc, "multi_doc"),
    general: gradeLatency(byBucket.general, "general"),
  };
}
