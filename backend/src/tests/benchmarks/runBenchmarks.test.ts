import { describe, test, expect } from "@jest/globals";
import {
  percentile,
  calculateLatencyMetrics,
  calculateLatencyByRoute,
  type ApiPerfEvent,
} from "../../../tools/analytics/calculators/latency.calculator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(route: string, latencyMs: number | undefined): ApiPerfEvent {
  return { ts: "2026-01-01T00:00:00Z", route, statusCode: 200, latencyMs };
}

// ---------------------------------------------------------------------------
// percentile()
// ---------------------------------------------------------------------------

describe("percentile()", () => {
  test("returns null for empty array", () => {
    expect(percentile([], 50)).toBeNull();
  });

  test("returns the sole element for a single-element array", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  test("returns null for out-of-range percentile values", () => {
    expect(percentile([1, 2, 3], -1)).toBeNull();
    expect(percentile([1, 2, 3], 101)).toBeNull();
  });

  test("computes p50 / p100 on a known sorted array", () => {
    // [10, 20, 30, 40, 50]
    // p50 index = 0.5 * 4 = 2  →  sortedValues[2] = 30
    // p100 index = 4            →  sortedValues[4] = 50
    const arr = [10, 20, 30, 40, 50];
    expect(percentile(arr, 50)).toBe(30);
    expect(percentile(arr, 0)).toBe(10);
    expect(percentile(arr, 100)).toBe(50);
  });

  test("uses linear interpolation for fractional indices", () => {
    // [0, 100]  p50 → index 0.5 → 0 * 0.5 + 100 * 0.5 = 50
    expect(percentile([0, 100], 50)).toBe(50);
    // [0, 50, 100]  p25 → index 0.5 → 0 * 0.5 + 50 * 0.5 = 25
    expect(percentile([0, 50, 100], 25)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// calculateLatencyMetrics()
// ---------------------------------------------------------------------------

describe("calculateLatencyMetrics()", () => {
  test("returns empty result for empty event array", () => {
    const result = calculateLatencyMetrics([], { field: "latencyMs" });
    expect(result).toEqual({
      count: 0,
      avgMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    });
  });

  test("computes correct stats for a small known dataset", () => {
    // comment in calculator states expected output for [100, 200, 150]:
    // count: 3, avgMs: 150, p50Ms: 150, p95Ms: ~195, p99Ms: ~199
    const events: ApiPerfEvent[] = [
      makeEvent("/api/chat", 100),
      makeEvent("/api/chat", 200),
      makeEvent("/api/chat", 150),
    ];
    const result = calculateLatencyMetrics(events, { field: "latencyMs" });
    expect(result.count).toBe(3);
    expect(result.avgMs).toBe(150);
    expect(result.p50Ms).toBe(150);
    expect(result.p95Ms).toBeCloseTo(195, 0);
    expect(result.p99Ms).toBeCloseTo(199, 0);
  });

  test("skips events where the chosen field is undefined or negative", () => {
    const events: ApiPerfEvent[] = [
      makeEvent("/api/chat", undefined),
      makeEvent("/api/chat", -10),
      makeEvent("/api/chat", 300),
    ];
    const result = calculateLatencyMetrics(events, { field: "latencyMs" });
    expect(result.count).toBe(1);
    expect(result.avgMs).toBe(300);
  });

  test("filters by routePrefix when provided", () => {
    const events: ApiPerfEvent[] = [
      makeEvent("/api/chat", 100),
      makeEvent("/api/admin/stats", 500),
      makeEvent("/api/chat", 200),
    ];
    const result = calculateLatencyMetrics(events, {
      field: "latencyMs",
      routePrefix: "/api/chat",
    });
    expect(result.count).toBe(2);
    expect(result.avgMs).toBe(150);
  });

  test("handles all-same values — p50/p95/p99 equal avgMs", () => {
    const events = Array.from({ length: 20 }, () =>
      makeEvent("/api/ping", 250),
    );
    const result = calculateLatencyMetrics(events, { field: "latencyMs" });
    expect(result.count).toBe(20);
    expect(result.avgMs).toBe(250);
    expect(result.p50Ms).toBe(250);
    expect(result.p95Ms).toBe(250);
    expect(result.p99Ms).toBe(250);
  });

  test("handles large spread — p99 is close to the maximum", () => {
    // 99 events at 10 ms, 1 event at 10 000 ms
    const events: ApiPerfEvent[] = [
      ...Array.from({ length: 99 }, () => makeEvent("/api/fast", 10)),
      makeEvent("/api/fast", 10000),
    ];
    const result = calculateLatencyMetrics(events, { field: "latencyMs" });
    expect(result.count).toBe(100);
    // p50 should be solidly within the bulk (10 ms)
    expect(result.p50Ms).toBe(10);
    // p99 should be noticeably above the bulk but below or at the outlier
    expect(result.p99Ms!).toBeGreaterThan(100);
    expect(result.p99Ms!).toBeLessThanOrEqual(10000);
  });
});

// ---------------------------------------------------------------------------
// calculateLatencyByRoute()
// ---------------------------------------------------------------------------

describe("calculateLatencyByRoute()", () => {
  test("returns empty array for empty events", () => {
    expect(calculateLatencyByRoute([], { field: "latencyMs" })).toEqual([]);
  });

  test("groups events by route and computes per-route metrics", () => {
    const events: ApiPerfEvent[] = [
      makeEvent("/api/chat", 100),
      makeEvent("/api/chat", 200),
      makeEvent("/api/docs", 50),
    ];
    const results = calculateLatencyByRoute(events, { field: "latencyMs" });

    expect(results).toHaveLength(2);

    const chat = results.find((r) => r.route === "/api/chat");
    const docs = results.find((r) => r.route === "/api/docs");

    expect(chat).toBeDefined();
    expect(chat!.count).toBe(2);
    expect(chat!.avgMs).toBe(150);

    expect(docs).toBeDefined();
    expect(docs!.count).toBe(1);
    expect(docs!.avgMs).toBe(50);
  });

  test("sorts results by count descending", () => {
    const events: ApiPerfEvent[] = [
      makeEvent("/api/rare", 10),
      makeEvent("/api/common", 20),
      makeEvent("/api/common", 30),
      makeEvent("/api/common", 40),
    ];
    const results = calculateLatencyByRoute(events, { field: "latencyMs" });
    expect(results[0].route).toBe("/api/common");
    expect(results[0].count).toBe(3);
    expect(results[1].route).toBe("/api/rare");
    expect(results[1].count).toBe(1);
  });
});
