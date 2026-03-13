import { DOCUMENT_UNDERSTANDING_ONTOLOGY } from "./ontology";
import { normalizeDocumentUnderstandingOutput } from "./normalization";
import { postProcessDocumentUnderstandingOutput } from "./postProcessing";
import { validateDocumentUnderstandingOutput } from "./validation";
import type {
  CalibrationMetrics,
  CanonicalOntology,
  DocumentUnderstandingOutput,
  EvaluationCase,
  EvaluationFailure,
  EvaluationMetrics,
  EvaluationOptions,
  EvaluationReport,
  LabelScore,
  TablePrediction,
  ThresholdProfile,
} from "./types";

export const DOCUMENT_UNDERSTANDING_THRESHOLD_PROFILES: Record<string, ThresholdProfile> = {
  strict: {
    docTypeMacroF1Min: 0.94,
    docTypePerMajorMin: 0.88,
    sectionSpanF1Min: 0.9,
    sectionIoUMin: 0.78,
    tableTypeAccuracyMin: 0.92,
    tableRecallMin: 0.94,
    abstentionPrecisionMin: 0.92,
    robustnessRatioMin: 0.92,
  },
  default: {
    docTypeMacroF1Min: 0.92,
    docTypePerMajorMin: 0.85,
    sectionSpanF1Min: 0.88,
    sectionIoUMin: 0.75,
    tableTypeAccuracyMin: 0.9,
    tableRecallMin: 0.93,
    abstentionPrecisionMin: 0.9,
    robustnessRatioMin: 0.9,
  },
  relaxed: {
    docTypeMacroF1Min: 0.86,
    docTypePerMajorMin: 0.75,
    sectionSpanF1Min: 0.8,
    sectionIoUMin: 0.66,
    tableTypeAccuracyMin: 0.82,
    tableRecallMin: 0.85,
    abstentionPrecisionMin: 0.82,
    robustnessRatioMin: 0.82,
  },
};

interface ScoredPair {
  gold: DocumentUnderstandingOutput;
  predicted: DocumentUnderstandingOutput;
  track: string;
}

function hasError(issues: Array<{ severity: "error" | "warning" }>): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function f1(precision: number, recall: number): number {
  if (precision <= 0 || recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function expandPageRange(start: number, end: number): number[] {
  const out: number[] = [];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return out;
  const s = Math.max(1, Math.floor(start));
  const e = Math.max(s, Math.floor(end));
  const maxPagesToExpand = 5000;
  for (let page = s; page <= e && out.length < maxPagesToExpand; page += 1) {
    out.push(page);
  }
  return out;
}

function setIntersectionSize<T>(left: Set<T>, right: Set<T>): number {
  let count = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) {
    if (large.has(value)) count += 1;
  }
  return count;
}

function getBBoxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;

  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const intersectionW = Math.max(0, ix2 - ix1);
  const intersectionH = Math.max(0, iy2 - iy1);
  const intersection = intersectionW * intersectionH;

  const areaA = Math.max(0, a.w) * Math.max(0, a.h);
  const areaB = Math.max(0, b.w) * Math.max(0, b.h);
  const union = areaA + areaB - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function computeDocTypeMetrics(
  pairs: ScoredPair[],
  majorLabels: string[],
): {
  accuracy: number;
  macroF1: number;
  perLabel: LabelScore[];
  perMajorLabel: LabelScore[];
} {
  const labels = new Set<string>();
  let correct = 0;

  for (const pair of pairs) {
    labels.add(pair.gold.doc_type.label);
    labels.add(pair.predicted.doc_type.label);
    if (pair.gold.doc_type.label === pair.predicted.doc_type.label) {
      correct += 1;
    }
  }

  const perLabel: LabelScore[] = [];
  for (const label of labels) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;

    for (const pair of pairs) {
      const gold = pair.gold.doc_type.label;
      const predicted = pair.predicted.doc_type.label;
      if (gold === label) support += 1;
      if (gold === label && predicted === label) tp += 1;
      if (gold !== label && predicted === label) fp += 1;
      if (gold === label && predicted !== label) fn += 1;
    }

    const precision = safeDivide(tp, tp + fp);
    const recall = safeDivide(tp, tp + fn);
    perLabel.push({
      label,
      support,
      tp,
      fp,
      fn,
      precision,
      recall,
      f1: f1(precision, recall),
    });
  }

  perLabel.sort((a, b) => a.label.localeCompare(b.label));

  const perLabelMap = new Map(perLabel.map((entry) => [entry.label, entry]));
  const perMajorLabel = majorLabels.map((label) => {
    const existing = perLabelMap.get(label);
    if (existing) return existing;
    return {
      label,
      support: 0,
      tp: 0,
      fp: 0,
      fn: 0,
      precision: 0,
      recall: 0,
      f1: 0,
    };
  });

  const supportedMajor = perMajorLabel.filter((entry) => entry.support > 0);
  const f1Base =
    supportedMajor.length > 0
      ? supportedMajor
      : perLabel.length > 0
        ? perLabel
        : perMajorLabel;
  const macroF1 =
    f1Base.length > 0
      ? f1Base.reduce((sum, entry) => sum + entry.f1, 0) / f1Base.length
      : 0;

  return {
    accuracy: safeDivide(correct, pairs.length),
    macroF1,
    perLabel,
    perMajorLabel,
  };
}

function computeSectionMetrics(pairs: ScoredPair[]) {
  let tpPages = 0;
  let fpPages = 0;
  let fnPages = 0;

  for (const pair of pairs) {
    const goldByLabel = new Map<string, Set<number>>();
    const predictedByLabel = new Map<string, Set<number>>();

    for (const section of pair.gold.sections) {
      const pages = expandPageRange(section.page_start, section.page_end);
      if (!goldByLabel.has(section.label)) goldByLabel.set(section.label, new Set());
      const target = goldByLabel.get(section.label)!;
      for (const page of pages) target.add(page);
    }

    for (const section of pair.predicted.sections) {
      const pages = expandPageRange(section.page_start, section.page_end);
      if (!predictedByLabel.has(section.label)) predictedByLabel.set(section.label, new Set());
      const target = predictedByLabel.get(section.label)!;
      for (const page of pages) target.add(page);
    }

    const labels = new Set<string>([
      ...goldByLabel.keys(),
      ...predictedByLabel.keys(),
    ]);

    for (const label of labels) {
      const goldPages = goldByLabel.get(label) || new Set<number>();
      const predictedPages = predictedByLabel.get(label) || new Set<number>();
      const tp = setIntersectionSize(goldPages, predictedPages);
      const fp = predictedPages.size - tp;
      const fn = goldPages.size - tp;
      tpPages += tp;
      fpPages += fp;
      fnPages += fn;
    }
  }

  const precision = safeDivide(tpPages, tpPages + fpPages);
  const recall = safeDivide(tpPages, tpPages + fnPages);
  return {
    precision,
    recall,
    spanF1: f1(precision, recall),
    iou: safeDivide(tpPages, tpPages + fpPages + fnPages),
    tpPages,
    fpPages,
    fnPages,
  };
}

function matchTables(
  goldTables: TablePrediction[],
  predictedTables: TablePrediction[],
  minIoU: number,
): { matched: number; matchedType: number } {
  let matched = 0;
  let matchedType = 0;
  const usedPred = new Set<number>();

  for (const gold of goldTables) {
    let bestIndex = -1;
    let bestIoU = 0;

    for (let i = 0; i < predictedTables.length; i += 1) {
      if (usedPred.has(i)) continue;
      const predicted = predictedTables[i];
      if (predicted.page !== gold.page) continue;
      const iou = getBBoxIoU(gold.bbox, predicted.bbox);
      if (iou > bestIoU) {
        bestIoU = iou;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestIoU >= minIoU) {
      matched += 1;
      usedPred.add(bestIndex);
      if (predictedTables[bestIndex].label === gold.label) {
        matchedType += 1;
      }
    }
  }

  return { matched, matchedType };
}

function computeTableMetrics(pairs: ScoredPair[], minIoU: number) {
  let totalGold = 0;
  let totalPredicted = 0;
  let matched = 0;
  let matchedType = 0;

  for (const pair of pairs) {
    const thisGold = pair.gold.tables || [];
    const thisPredicted = pair.predicted.tables || [];
    totalGold += thisGold.length;
    totalPredicted += thisPredicted.length;

    const result = matchTables(thisGold, thisPredicted, minIoU);
    matched += result.matched;
    matchedType += result.matchedType;
  }

  return {
    detectionRecall: safeDivide(matched, totalGold),
    detectionPrecision: safeDivide(matched, totalPredicted),
    typeAccuracy: safeDivide(matchedType, matched),
    matched,
    matchedType,
    totalGold,
    totalPredicted,
  };
}

function computeCalibration(pairs: ScoredPair[], binsCount: number): CalibrationMetrics {
  const bins = Array.from({ length: binsCount }, (_, index) => ({
    start: index / binsCount,
    end: (index + 1) / binsCount,
    count: 0,
    confidenceTotal: 0,
    accuracyTotal: 0,
  }));

  for (const pair of pairs) {
    const confidence = pair.predicted.doc_type.confidence;
    const accuracy = pair.predicted.doc_type.label === pair.gold.doc_type.label ? 1 : 0;
    const bucket = Math.min(
      binsCount - 1,
      Math.max(0, Math.floor(confidence * binsCount)),
    );
    bins[bucket].count += 1;
    bins[bucket].confidenceTotal += confidence;
    bins[bucket].accuracyTotal += accuracy;
  }

  let ece = 0;
  const total = pairs.length;
  const summarizedBins = bins.map((bin) => {
    const avgConfidence = safeDivide(bin.confidenceTotal, bin.count);
    const avgAccuracy = safeDivide(bin.accuracyTotal, bin.count);
    if (bin.count > 0 && total > 0) {
      ece += (bin.count / total) * Math.abs(avgAccuracy - avgConfidence);
    }
    return {
      start: bin.start,
      end: bin.end,
      count: bin.count,
      avgConfidence,
      avgAccuracy,
    };
  });

  return {
    ece,
    bins: summarizedBins,
  };
}

function computeAbstentionMetrics(pairs: ScoredPair[]) {
  const unknownSet = new Set(["unknown", "other"]);
  let unknownPredictions = 0;
  let correctUnknownPredictions = 0;

  for (const pair of pairs) {
    const predictedUnknown = unknownSet.has(pair.predicted.doc_type.label);
    if (!predictedUnknown) continue;
    unknownPredictions += 1;
    if (unknownSet.has(pair.gold.doc_type.label)) {
      correctUnknownPredictions += 1;
    }
  }

  return {
    unknownPredictions,
    abstentionPrecision:
      unknownPredictions > 0
        ? correctUnknownPredictions / unknownPredictions
        : 1,
    abstentionCoverage: safeDivide(unknownPredictions, pairs.length),
  };
}

function computeMetrics(
  pairs: ScoredPair[],
  ontology: CanonicalOntology,
  tableIoUThreshold: number,
  calibrationBins: number,
): EvaluationMetrics {
  return {
    docType: computeDocTypeMetrics(pairs, ontology.majorDocTypeLabels),
    sections: computeSectionMetrics(pairs),
    tables: computeTableMetrics(pairs, tableIoUThreshold),
    calibration: computeCalibration(pairs, calibrationBins),
    abstention: computeAbstentionMetrics(pairs),
  };
}

function buildThresholdFailures(
  metrics: EvaluationMetrics,
  byTrack: Record<string, EvaluationMetrics>,
  thresholds: ThresholdProfile,
): EvaluationFailure[] {
  const failures: EvaluationFailure[] = [];

  if (metrics.docType.macroF1 < thresholds.docTypeMacroF1Min) {
    failures.push({
      code: "DOC_TYPE_MACRO_F1_BELOW_THRESHOLD",
      message: `docType macro-F1 ${metrics.docType.macroF1.toFixed(4)} < ${thresholds.docTypeMacroF1Min.toFixed(4)}`,
    });
  }

  for (const major of metrics.docType.perMajorLabel) {
    if (major.support <= 0) continue;
    if (major.f1 < thresholds.docTypePerMajorMin) {
      failures.push({
        code: "DOC_TYPE_PER_MAJOR_BELOW_THRESHOLD",
        message: `docType ${major.label} F1 ${major.f1.toFixed(4)} < ${thresholds.docTypePerMajorMin.toFixed(4)}`,
      });
    }
  }

  if (metrics.sections.spanF1 < thresholds.sectionSpanF1Min) {
    failures.push({
      code: "SECTION_SPAN_F1_BELOW_THRESHOLD",
      message: `section span-F1 ${metrics.sections.spanF1.toFixed(4)} < ${thresholds.sectionSpanF1Min.toFixed(4)}`,
    });
  }

  if (metrics.sections.iou < thresholds.sectionIoUMin) {
    failures.push({
      code: "SECTION_IOU_BELOW_THRESHOLD",
      message: `section IoU ${metrics.sections.iou.toFixed(4)} < ${thresholds.sectionIoUMin.toFixed(4)}`,
    });
  }

  if (metrics.tables.typeAccuracy < thresholds.tableTypeAccuracyMin) {
    failures.push({
      code: "TABLE_TYPE_ACCURACY_BELOW_THRESHOLD",
      message: `table type accuracy ${metrics.tables.typeAccuracy.toFixed(4)} < ${thresholds.tableTypeAccuracyMin.toFixed(4)}`,
    });
  }

  if (metrics.tables.detectionRecall < thresholds.tableRecallMin) {
    failures.push({
      code: "TABLE_RECALL_BELOW_THRESHOLD",
      message: `table recall ${metrics.tables.detectionRecall.toFixed(4)} < ${thresholds.tableRecallMin.toFixed(4)}`,
    });
  }

  if (metrics.abstention.abstentionPrecision < thresholds.abstentionPrecisionMin) {
    failures.push({
      code: "ABSTENTION_PRECISION_BELOW_THRESHOLD",
      message: `abstention precision ${metrics.abstention.abstentionPrecision.toFixed(4)} < ${thresholds.abstentionPrecisionMin.toFixed(4)}`,
    });
  }

  const tracks = Object.keys(byTrack).filter((name) => name !== "default");
  for (const trackName of tracks) {
    const track = byTrack[trackName];
    const docTypeRatio = safeDivide(track.docType.macroF1, metrics.docType.macroF1 || 1);
    const sectionRatio = safeDivide(track.sections.spanF1, metrics.sections.spanF1 || 1);
    const tableRatio = safeDivide(track.tables.detectionRecall, metrics.tables.detectionRecall || 1);

    if (metrics.docType.macroF1 > 0 && docTypeRatio < thresholds.robustnessRatioMin) {
      failures.push({
        code: "ROBUSTNESS_DOC_TYPE_RATIO_BELOW_THRESHOLD",
        message: `track=${trackName} docType ratio ${docTypeRatio.toFixed(4)} < ${thresholds.robustnessRatioMin.toFixed(4)}`,
      });
    }

    if (metrics.sections.spanF1 > 0 && sectionRatio < thresholds.robustnessRatioMin) {
      failures.push({
        code: "ROBUSTNESS_SECTION_RATIO_BELOW_THRESHOLD",
        message: `track=${trackName} section ratio ${sectionRatio.toFixed(4)} < ${thresholds.robustnessRatioMin.toFixed(4)}`,
      });
    }

    if (metrics.tables.detectionRecall > 0 && tableRatio < thresholds.robustnessRatioMin) {
      failures.push({
        code: "ROBUSTNESS_TABLE_RATIO_BELOW_THRESHOLD",
        message: `track=${trackName} table ratio ${tableRatio.toFixed(4)} < ${thresholds.robustnessRatioMin.toFixed(4)}`,
      });
    }
  }

  return failures;
}

export function evaluateDocumentUnderstanding(
  cases: EvaluationCase[],
  options: EvaluationOptions = {},
  ontology: CanonicalOntology = DOCUMENT_UNDERSTANDING_ONTOLOGY,
): EvaluationReport {
  const thresholdProfile =
    options.thresholdProfile || DOCUMENT_UNDERSTANDING_THRESHOLD_PROFILES.default;
  const tableIoUThreshold = Number.isFinite(options.tableIoUThreshold)
    ? Number(options.tableIoUThreshold)
    : 0.5;
  const calibrationBins = Number.isFinite(options.calibrationBins)
    ? Math.max(2, Number(options.calibrationBins))
    : 10;
  const confidenceAbstainThreshold = Number.isFinite(options.confidenceAbstainThreshold)
    ? Number(options.confidenceAbstainThreshold)
    : 0.65;

  const scoredPairs: ScoredPair[] = [];
  const invalidCases: EvaluationReport["invalidCases"] = [];

  for (const entry of cases) {
    const normalizedGold = normalizeDocumentUnderstandingOutput(entry.gold, {}, ontology);
    const postProcessedPrediction = postProcessDocumentUnderstandingOutput(
      entry.predicted,
      {
        confidence_abstain_threshold: confidenceAbstainThreshold,
      },
      ontology,
    );

    const goldValidation = validateDocumentUnderstandingOutput(normalizedGold);
    if (hasError(goldValidation.issues)) {
      invalidCases.push({
        document_id: normalizedGold.document_id || entry.gold.document_id,
        side: "gold",
        issues: goldValidation.issues,
      });
      continue;
    }

    if (hasError(postProcessedPrediction.issues)) {
      invalidCases.push({
        document_id: postProcessedPrediction.output.document_id || entry.predicted.document_id,
        side: "predicted",
        issues: postProcessedPrediction.issues,
      });
      continue;
    }

    const track =
      entry.track ||
      normalizedGold.meta.eval_track ||
      postProcessedPrediction.output.meta.eval_track ||
      "default";

    scoredPairs.push({
      gold: normalizedGold,
      predicted: postProcessedPrediction.output,
      track,
    });
  }

  const metrics = computeMetrics(scoredPairs, ontology, tableIoUThreshold, calibrationBins);
  const byTrack: Record<string, EvaluationMetrics> = {};

  const tracks = new Set(scoredPairs.map((pair) => pair.track));
  tracks.add("default");

  for (const track of tracks) {
    const subset = track === "default" ? scoredPairs : scoredPairs.filter((pair) => pair.track === track);
    byTrack[track] = computeMetrics(subset, ontology, tableIoUThreshold, calibrationBins);
  }

  const failures = buildThresholdFailures(metrics, byTrack, thresholdProfile);

  return {
    totalCases: cases.length,
    scoredCases: scoredPairs.length,
    droppedCases: cases.length - scoredPairs.length,
    invalidCases,
    metrics,
    byTrack,
    passed: failures.length === 0,
    failures,
    thresholdProfile,
  };
}
