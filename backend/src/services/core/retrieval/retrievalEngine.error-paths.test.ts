import { describe, expect, test, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// We test the `runWithTimeout` pattern used inside RetrievalEngineService.
//
// The actual function is a private closure embedded in a large class method,
// so we replicate the *exact* pattern here and verify its error-handling
// behaviour in isolation.  Any refactor to the real function should keep these
// tests green.
// ---------------------------------------------------------------------------

const makeRunWithTimeout = (
  timeoutMs: number,
  warnFn: (...args: unknown[]) => void,
) => {
  return async <T>(
    operation: Promise<T>,
    fallback: T,
    label: string,
  ): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    const guarded = operation.catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : String(err);
      warnFn("[retrieval-engine] %s failed", label, {
        error: message,
      });
      return fallback;
    });
    const timed = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        warnFn(
          "[retrieval-engine] %s timed out after %dms",
          label,
          timeoutMs,
        );
        resolve(fallback);
      }, timeoutMs);
    });
    const output = await Promise.race([guarded, timed]);
    if (timer) clearTimeout(timer);
    return output;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a promise that never resolves (for timeout tests). */
const neverResolves = <T>(): Promise<T> =>
  new Promise<T>(() => {
    /* intentionally left hanging */
  });

/** Creates a promise that rejects after a microtask tick. */
const rejectWith = (err: unknown): Promise<never> =>
  Promise.reject(err);

/** Creates a promise that resolves after `ms` milliseconds. */
const delayedResolve = <T>(value: T, ms: number): Promise<T> =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("retrievalEngine – runWithTimeout error paths", () => {
  let warnFn: jest.Mock;

  beforeEach(() => {
    warnFn = jest.fn();
  });

  // -----------------------------------------------------------------------
  // 1. Happy path – operation succeeds before timeout
  // -----------------------------------------------------------------------
  test("successful operation returns its result and logs no warnings", async () => {
    const runWithTimeout = makeRunWithTimeout(5_000, warnFn);
    const result = await runWithTimeout(
      Promise.resolve({ hits: [1, 2, 3] }),
      { hits: [] },
      "semantic-search",
    );

    expect(result).toEqual({ hits: [1, 2, 3] });
    expect(warnFn).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 2. Operation throws an Error – returns fallback + logs the message
  // -----------------------------------------------------------------------
  test("rejected operation returns fallback and logs warning with error message", async () => {
    const runWithTimeout = makeRunWithTimeout(5_000, warnFn);
    const result = await runWithTimeout(
      rejectWith(new Error("ECONNREFUSED")),
      [] as string[],
      "lexical-search",
    );

    expect(result).toEqual([]);
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(warnFn).toHaveBeenCalledWith(
      "[retrieval-engine] %s failed",
      "lexical-search",
      { error: "ECONNREFUSED" },
    );
  });

  // -----------------------------------------------------------------------
  // 3. Timeout fires before operation resolves – returns fallback + logs
  // -----------------------------------------------------------------------
  test("timed-out operation returns fallback and logs timeout warning", async () => {
    // Use a very short timeout so the test completes fast.
    const runWithTimeout = makeRunWithTimeout(50, warnFn);
    const result = await runWithTimeout(
      neverResolves<number[]>(),
      [],
      "structural-search",
    );

    expect(result).toEqual([]);
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(warnFn).toHaveBeenCalledWith(
      "[retrieval-engine] %s timed out after %dms",
      "structural-search",
      50,
    );
  });

  // -----------------------------------------------------------------------
  // 4. Mixed partial failure – one call succeeds, another fails
  // -----------------------------------------------------------------------
  test("parallel calls: one succeeds and one fails independently", async () => {
    const runWithTimeout = makeRunWithTimeout(5_000, warnFn);

    const [semanticResult, lexicalResult] = await Promise.all([
      runWithTimeout(
        Promise.resolve([{ id: "doc-1", score: 0.92 }]),
        [],
        "semantic-search",
      ),
      runWithTimeout(
        rejectWith(new Error("index offline")),
        [],
        "lexical-search",
      ),
    ]);

    // Semantic succeeded normally
    expect(semanticResult).toEqual([{ id: "doc-1", score: 0.92 }]);

    // Lexical fell back
    expect(lexicalResult).toEqual([]);

    // Only the failing call logged a warning
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(warnFn).toHaveBeenCalledWith(
      "[retrieval-engine] %s failed",
      "lexical-search",
      { error: "index offline" },
    );
  });

  // -----------------------------------------------------------------------
  // 5. Error with no `.message` property (thrown string)
  // -----------------------------------------------------------------------
  test("non-Error rejection (string) is stringified cleanly in the log", async () => {
    const runWithTimeout = makeRunWithTimeout(5_000, warnFn);
    const result = await runWithTimeout(
      rejectWith("socket hang up"),
      "N/A",
      "semantic-search",
    );

    expect(result).toBe("N/A");
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(warnFn).toHaveBeenCalledWith(
      "[retrieval-engine] %s failed",
      "semantic-search",
      { error: "socket hang up" },
    );
  });

  // -----------------------------------------------------------------------
  // 6. Fast rejection beats the timeout – only the failure warning is logged
  // -----------------------------------------------------------------------
  test("fast rejection resolves before timeout fires", async () => {
    const runWithTimeout = makeRunWithTimeout(200, warnFn);
    const result = await runWithTimeout(
      rejectWith(new Error("bad gateway")),
      0,
      "vector-lookup",
    );

    expect(result).toBe(0);

    // Only the rejection warning, not a timeout warning
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(warnFn).toHaveBeenCalledWith(
      "[retrieval-engine] %s failed",
      "vector-lookup",
      { error: "bad gateway" },
    );
  });

  // -----------------------------------------------------------------------
  // 7. Operation succeeds just before timeout – no warning logged
  // -----------------------------------------------------------------------
  test("slow but successful operation that completes before timeout", async () => {
    const runWithTimeout = makeRunWithTimeout(200, warnFn);
    const result = await runWithTimeout(
      delayedResolve("found-it", 30),
      "fallback",
      "slow-search",
    );

    expect(result).toBe("found-it");
    expect(warnFn).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 8. Rejection with undefined error
  // -----------------------------------------------------------------------
  test("rejection with undefined error logs 'undefined' string", async () => {
    const runWithTimeout = makeRunWithTimeout(5_000, warnFn);
    const result = await runWithTimeout(
      rejectWith(undefined),
      "safe-default",
      "edge-case-search",
    );

    expect(result).toBe("safe-default");
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(warnFn).toHaveBeenCalledWith(
      "[retrieval-engine] %s failed",
      "edge-case-search",
      { error: "undefined" },
    );
  });
});
