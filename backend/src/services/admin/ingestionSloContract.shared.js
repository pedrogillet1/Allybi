"use strict";

function round2(value) {
  return Math.round(value * 100) / 100;
}

function p95(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function toPositiveNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isIngestionFailureStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === "fail" || normalized === "queue_fail" || normalized.endsWith("_fail");
}

function summarizeIngestionSloEvents(events) {
  const durations = [];
  const rssSeries = [];
  const bucketMap = new Map();

  for (const event of events || []) {
    const status = normalizeStatus(event?.status);
    const mimeType = String(event?.mimeType || "unknown").trim().toLowerCase();
    const meta = asRecord(event?.meta);
    const sizeBucket =
      String(meta?.sizeBucket || "unknown").trim().toLowerCase() || "unknown";
    const key = `${mimeType}||${sizeBucket}`;

    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        count: 0,
        failures: 0,
        latencies: [],
        peakRssMb: [],
      });
    }
    const bucket = bucketMap.get(key);
    bucket.count += 1;
    if (isIngestionFailureStatus(status)) bucket.failures += 1;

    if (typeof event?.durationMs === "number" && event.durationMs > 0) {
      bucket.latencies.push(event.durationMs);
      durations.push(event.durationMs);
    }

    const peakRss = toPositiveNumber(meta?.peakRssMb);
    if (peakRss !== null) {
      bucket.peakRssMb.push(peakRss);
      rssSeries.push(peakRss);
    }
  }

  const byMimeSize = Array.from(bucketMap.entries())
    .map(([key, bucket]) => {
      const [mimeType, sizeBucket] = key.split("||");
      return {
        mimeType,
        sizeBucket,
        count: bucket.count,
        p95LatencyMs: p95(bucket.latencies),
        p95PeakRssMb: p95(bucket.peakRssMb),
        failureRate:
          bucket.count > 0 ? round2((bucket.failures / bucket.count) * 100) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    docsProcessed: Array.isArray(events) ? events.length : 0,
    p95LatencyMs: p95(durations),
    p95PeakRssMb: p95(rssSeries),
    byMimeSize,
  };
}

function evaluateIngestionSloMetrics(metrics, thresholds) {
  const failures = [];
  const docsProcessed = Number(metrics?.docsProcessed || 0);
  const p95LatencyMs = Number(metrics?.p95LatencyMs || 0);
  const p95PeakRssMb = Number(metrics?.p95PeakRssMb || 0);
  const byMimeSize = Array.isArray(metrics?.byMimeSize) ? metrics.byMimeSize : [];

  const minDocsProcessed = Math.max(
    0,
    Number(thresholds?.minDocsProcessed ?? 1),
  );
  const maxGlobalP95LatencyMs = Math.max(
    1,
    Number(thresholds?.maxGlobalP95LatencyMs || 1),
  );
  const maxGlobalFailureRatePct = Math.max(
    0,
    Number(thresholds?.maxGlobalFailureRatePct || 0),
  );
  const hasGlobalRssThreshold =
    typeof thresholds?.maxGlobalP95PeakRssMb === "number" &&
    Number.isFinite(thresholds.maxGlobalP95PeakRssMb) &&
    thresholds.maxGlobalP95PeakRssMb > 0;

  if (docsProcessed < minDocsProcessed) {
    failures.push(
      `INSUFFICIENT_SAMPLE: docsProcessed=${docsProcessed} < ${minDocsProcessed}`,
    );
  }
  if (p95LatencyMs > maxGlobalP95LatencyMs) {
    failures.push(
      `GLOBAL_P95_EXCEEDED: ${p95LatencyMs} > ${maxGlobalP95LatencyMs}`,
    );
  }
  if (hasGlobalRssThreshold && p95PeakRssMb > thresholds.maxGlobalP95PeakRssMb) {
    failures.push(
      `GLOBAL_P95_PEAK_RSS_EXCEEDED: ${p95PeakRssMb} > ${thresholds.maxGlobalP95PeakRssMb}`,
    );
  }

  let weightedFailure = 0;
  for (const bucket of byMimeSize) {
    const count = Number(bucket?.count || 0);
    const failureRate = Number(bucket?.failureRate || 0);
    weightedFailure += count * (failureRate / 100);
  }
  const globalFailureRatePct =
    docsProcessed > 0 ? round2((weightedFailure / docsProcessed) * 100) : 0;
  if (globalFailureRatePct > maxGlobalFailureRatePct) {
    failures.push(
      `GLOBAL_FAILURE_RATE_EXCEEDED: ${globalFailureRatePct}% > ${maxGlobalFailureRatePct}%`,
    );
  }

  const p95ByKey = thresholds?.maxBucketP95LatencyMsByKey || {};
  for (const [key, max] of Object.entries(p95ByKey)) {
    const [mimeType, sizeBucket] = key.split("||");
    const bucket = byMimeSize.find(
      (entry) =>
        entry.mimeType === String(mimeType || "").toLowerCase() &&
        entry.sizeBucket === String(sizeBucket || "").toLowerCase(),
    );
    if (!bucket) continue;
    if (bucket.p95LatencyMs > Number(max)) {
      failures.push(`BUCKET_P95_EXCEEDED:${key}: ${bucket.p95LatencyMs} > ${max}`);
    }
  }

  const failureRateByKey = thresholds?.maxBucketFailureRatePctByKey || {};
  for (const [key, max] of Object.entries(failureRateByKey)) {
    const [mimeType, sizeBucket] = key.split("||");
    const bucket = byMimeSize.find(
      (entry) =>
        entry.mimeType === String(mimeType || "").toLowerCase() &&
        entry.sizeBucket === String(sizeBucket || "").toLowerCase(),
    );
    if (!bucket) continue;
    if (bucket.failureRate > Number(max)) {
      failures.push(
        `BUCKET_FAILURE_RATE_EXCEEDED:${key}: ${bucket.failureRate}% > ${max}%`,
      );
    }
  }

  const rssByKey = thresholds?.maxBucketP95PeakRssMbByKey || {};
  for (const [key, max] of Object.entries(rssByKey)) {
    const [mimeType, sizeBucket] = key.split("||");
    const bucket = byMimeSize.find(
      (entry) =>
        entry.mimeType === String(mimeType || "").toLowerCase() &&
        entry.sizeBucket === String(sizeBucket || "").toLowerCase(),
    );
    if (!bucket) continue;
    if (bucket.p95PeakRssMb > Number(max)) {
      failures.push(
        `BUCKET_P95_PEAK_RSS_EXCEEDED:${key}: ${bucket.p95PeakRssMb} > ${max}`,
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    globalFailureRatePct,
  };
}

module.exports = {
  isIngestionFailureStatus,
  summarizeIngestionSloEvents,
  evaluateIngestionSloMetrics,
};
