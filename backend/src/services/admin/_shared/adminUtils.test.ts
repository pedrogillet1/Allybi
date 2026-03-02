import { describe, expect, test } from "@jest/globals";

import { clampLimit, clampNumber, clampInt, bigIntToNumber, ensureNonNegative } from "./clamp";
import {
  normalizeRange,
  parseRange,
  previousWindow,
  rangeToDays,
  rangeToHours,
  formatWindow,
} from "./rangeWindow";
import {
  encodeCursor,
  decodeCursor,
  decodeCursorWithTimestamp,
  buildCursorClause,
  processPage,
  processPageWithTimestamp,
} from "./pagination";
import {
  percentile,
  p50,
  p95,
  p99,
  calculatePercentiles,
  calculateStats,
} from "./percentiles";

// ---------------------------------------------------------------------------
// clamp.ts
// ---------------------------------------------------------------------------
describe("clampLimit", () => {
  test("returns fallback for undefined", () => {
    expect(clampLimit(undefined)).toBe(50);
  });

  test("returns fallback for null", () => {
    expect(clampLimit(null)).toBe(50);
  });

  test("returns fallback for NaN string", () => {
    expect(clampLimit("abc")).toBe(50);
  });

  test("clamps value below minimum to 1", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-10)).toBe(1);
  });

  test("clamps value above maximum to 200", () => {
    expect(clampLimit(999)).toBe(200);
  });

  test("floors fractional values", () => {
    expect(clampLimit(10.9)).toBe(10);
  });

  test("passes through valid value", () => {
    expect(clampLimit(25)).toBe(25);
  });

  test("accepts string that parses to number", () => {
    expect(clampLimit("42")).toBe(42);
  });

  test("uses custom fallback when provided", () => {
    expect(clampLimit(undefined, 20)).toBe(20);
  });

  test("handles Infinity by returning fallback", () => {
    expect(clampLimit(Infinity)).toBe(50);
  });
});

describe("clampNumber", () => {
  test("clamps within range", () => {
    expect(clampNumber(5, 0, 10, 0)).toBe(5);
  });

  test("clamps below min", () => {
    expect(clampNumber(-5, 0, 10, 0)).toBe(0);
  });

  test("clamps above max", () => {
    expect(clampNumber(15, 0, 10, 0)).toBe(10);
  });

  test("returns fallback for null", () => {
    expect(clampNumber(null, 0, 10, 7)).toBe(7);
  });

  test("returns fallback for non-finite value", () => {
    expect(clampNumber(NaN, 0, 10, 5)).toBe(5);
  });
});

describe("clampInt", () => {
  test("floors the clamped value", () => {
    expect(clampInt(7.8, 0, 10, 0)).toBe(7);
  });

  test("returns floored fallback for null", () => {
    expect(clampInt(null, 0, 10, 3)).toBe(3);
  });
});

describe("bigIntToNumber", () => {
  test("converts BigInt to number", () => {
    expect(bigIntToNumber(BigInt(42))).toBe(42);
  });

  test("caps BigInt at max", () => {
    expect(bigIntToNumber(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(100), 1000)).toBe(1000);
  });

  test("converts normal number", () => {
    expect(bigIntToNumber(99)).toBe(99);
  });

  test("returns 0 for NaN", () => {
    expect(bigIntToNumber(NaN)).toBe(0);
  });

  test("caps number at max", () => {
    expect(bigIntToNumber(5000, 100)).toBe(100);
  });
});

describe("ensureNonNegative", () => {
  test("returns positive number as-is", () => {
    expect(ensureNonNegative(10)).toBe(10);
  });

  test("returns 0 for 0", () => {
    expect(ensureNonNegative(0)).toBe(0);
  });

  test("returns fallback for negative", () => {
    expect(ensureNonNegative(-5)).toBe(0);
  });

  test("returns fallback for NaN", () => {
    expect(ensureNonNegative("abc", 7)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// rangeWindow.ts
// ---------------------------------------------------------------------------
describe("normalizeRange", () => {
  test("normalizes known range keys", () => {
    expect(normalizeRange("7d")).toBe("7d");
    expect(normalizeRange("30d")).toBe("30d");
    expect(normalizeRange("90d")).toBe("90d");
    expect(normalizeRange("24h")).toBe("24h");
  });

  test("normalizes alias 1d to 24h", () => {
    expect(normalizeRange("1d")).toBe("24h");
  });

  test("is case-insensitive and trims whitespace", () => {
    expect(normalizeRange("  7D  ")).toBe("7d");
  });

  test("returns fallback for unknown range", () => {
    expect(normalizeRange("2w")).toBe("7d");
    expect(normalizeRange("2w", "30d")).toBe("30d");
  });

  test("returns fallback for non-string input", () => {
    expect(normalizeRange(42)).toBe("7d");
    expect(normalizeRange(null)).toBe("7d");
    expect(normalizeRange(undefined)).toBe("7d");
  });
});

describe("parseRange", () => {
  test("returns a window with from < to", () => {
    const window = parseRange("7d");
    expect(window.from.getTime()).toBeLessThan(window.to.getTime());
  });

  test("7d window spans approximately 7 days", () => {
    const window = parseRange("7d");
    const diffMs = window.to.getTime() - window.from.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  test("24h window spans approximately 1 day", () => {
    const window = parseRange("24h");
    const diffMs = window.to.getTime() - window.from.getTime();
    const diffHours = diffMs / (60 * 60 * 1000);
    expect(diffHours).toBeCloseTo(24, 0);
  });

  test("falls back for invalid input", () => {
    const window = parseRange("invalid");
    const diffMs = window.to.getTime() - window.from.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(7, 0);
  });
});

describe("previousWindow", () => {
  test("previous window ends before the current window starts", () => {
    const prev = previousWindow("7d");
    const current = parseRange("7d");
    // previous window's 'to' should be close to current window's 'from'
    const gapMs = Math.abs(current.from.getTime() - prev.to.getTime());
    // Allow 100ms tolerance for execution time
    expect(gapMs).toBeLessThan(100);
  });
});

describe("rangeToDays", () => {
  test("converts known ranges to days", () => {
    expect(rangeToDays("24h")).toBe(1);
    expect(rangeToDays("7d")).toBe(7);
    expect(rangeToDays("30d")).toBe(30);
    expect(rangeToDays("90d")).toBe(90);
  });

  test("falls back to default for unknown range", () => {
    expect(rangeToDays("unknown")).toBe(7);
  });
});

describe("rangeToHours", () => {
  test("converts 24h range to 24 hours", () => {
    expect(rangeToHours("24h")).toBe(24);
  });

  test("converts 7d range to 168 hours", () => {
    expect(rangeToHours("7d")).toBe(168);
  });
});

describe("formatWindow", () => {
  test("formats dates as ISO strings", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-08T00:00:00Z");
    const result = formatWindow({ from, to });
    expect(result.from).toBe("2026-01-01T00:00:00.000Z");
    expect(result.to).toBe("2026-01-08T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// pagination.ts
// ---------------------------------------------------------------------------
describe("encodeCursor / decodeCursor", () => {
  test("round-trips a simple id", () => {
    const cursor = encodeCursor("abc-123");
    const decoded = decodeCursor(cursor);
    expect(decoded).toBe("abc-123");
  });

  test("decodeCursor returns null for null/undefined/empty", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  test("decodeCursor falls back to raw string for non-base64 input", () => {
    // A non-base64url string that doesn't parse as JSON will be returned raw.
    expect(decodeCursor("raw-id-value")).toBe("raw-id-value");
  });
});

describe("decodeCursorWithTimestamp", () => {
  test("round-trips id and timestamp", () => {
    const ts = new Date("2026-03-01T12:00:00Z");
    const cursor = encodeCursor("item-42", ts);
    const result = decodeCursorWithTimestamp(cursor);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("item-42");
    expect(result!.timestamp).toEqual(ts);
  });

  test("returns null for empty input", () => {
    expect(decodeCursorWithTimestamp(null)).toBeNull();
    expect(decodeCursorWithTimestamp("")).toBeNull();
  });

  test("returns id without timestamp when not encoded", () => {
    const cursor = encodeCursor("no-ts");
    const result = decodeCursorWithTimestamp(cursor);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("no-ts");
    expect(result!.timestamp).toBeUndefined();
  });
});

describe("buildCursorClause", () => {
  test("returns cursor clause for valid cursor", () => {
    const cursor = encodeCursor("my-id");
    const clause = buildCursorClause(cursor);
    expect(clause).toEqual({ cursor: { id: "my-id" }, skip: 1 });
  });

  test("returns empty object for null cursor", () => {
    expect(buildCursorClause(null)).toEqual({});
  });

  test("returns empty object for empty string", () => {
    expect(buildCursorClause("")).toEqual({});
  });
});

describe("processPage", () => {
  test("returns all items and no cursor when under limit", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = processPage(items, 5);
    expect(result.page).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  test("truncates to limit and provides cursor when over limit", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const result = processPage(items, 3);
    expect(result.page).toHaveLength(3);
    expect(result.nextCursor).not.toBeNull();
    // Cursor should decode to the last item of the page
    expect(decodeCursor(result.nextCursor!)).toBe("c");
  });

  test("handles empty array", () => {
    const result = processPage([], 10);
    expect(result.page).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

describe("processPageWithTimestamp", () => {
  test("includes timestamp in cursor", () => {
    const ts = new Date("2026-03-01T00:00:00Z");
    const items = [
      { id: "a", createdAt: ts },
      { id: "b", createdAt: ts },
      { id: "c", createdAt: ts },
    ];
    const result = processPageWithTimestamp(items, 2, (item) => item.createdAt);
    expect(result.page).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
    const decoded = decodeCursorWithTimestamp(result.nextCursor!);
    expect(decoded!.id).toBe("b");
    expect(decoded!.timestamp).toEqual(ts);
  });
});

// ---------------------------------------------------------------------------
// percentiles.ts
// ---------------------------------------------------------------------------
describe("percentile", () => {
  test("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  test("returns single value for single-element array", () => {
    expect(percentile([42], 50)).toBe(42);
  });

  test("returns exact value at boundary", () => {
    expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40, 50], 100)).toBe(50);
  });

  test("interpolates at p50", () => {
    const sorted = [10, 20, 30, 40];
    const result = percentile(sorted, 50);
    // index = 0.5 * 3 = 1.5, interpolate between 20 and 30 => 25
    expect(result).toBe(25);
  });
});

describe("p50", () => {
  test("returns median of odd-length array", () => {
    expect(p50([3, 1, 2])).toBe(2);
  });

  test("returns rounded median of even-length array", () => {
    expect(p50([10, 20, 30, 40])).toBe(25);
  });

  test("returns 0 for empty array", () => {
    expect(p50([])).toBe(0);
  });
});

describe("p95", () => {
  test("returns high percentile", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = p95(values);
    // p95 of [1..100]: index = 0.95 * 99 = 94.05
    // interpolation: 95 + 0.05 * (96 - 95) = 95.05 => rounds to 95
    expect(result).toBe(95);
  });
});

describe("p99", () => {
  test("returns very high percentile", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = p99(values);
    expect(result).toBe(99);
  });
});

describe("calculatePercentiles", () => {
  test("returns all requested percentiles", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = calculatePercentiles(values, [50, 95, 99]);
    expect(result).toHaveProperty("p50");
    expect(result).toHaveProperty("p95");
    expect(result).toHaveProperty("p99");
  });

  test("returns zeros for empty array", () => {
    const result = calculatePercentiles([], [50, 95]);
    expect(result.p50).toBe(0);
    expect(result.p95).toBe(0);
  });
});

describe("calculateStats", () => {
  test("returns full stats for values", () => {
    const stats = calculateStats([10, 20, 30, 40, 50]);
    expect(stats.count).toBe(5);
    expect(stats.sum).toBe(150);
    expect(stats.mean).toBe(30);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(50);
    expect(stats.p50).toBe(30);
  });

  test("returns zeros for empty array", () => {
    const stats = calculateStats([]);
    expect(stats.count).toBe(0);
    expect(stats.sum).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.p50).toBe(0);
    expect(stats.p95).toBe(0);
    expect(stats.p99).toBe(0);
  });

  test("handles single value", () => {
    const stats = calculateStats([42]);
    expect(stats.count).toBe(1);
    expect(stats.mean).toBe(42);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.p50).toBe(42);
  });
});
