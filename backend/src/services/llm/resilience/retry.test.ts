import { withRetry, isRetryableError } from "./retry";

describe("withRetry", () => {
  it("should return result on first success", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const { result, attempts } = await withRetry(fn, { maxRetries: 2 });
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and succeed", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");

    const { result, attempts } = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should throw last error when retries exhausted", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 }),
    ).rejects.toThrow("always fails");

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should stop retrying when shouldRetry returns false", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("fatal"));

    await expect(
      withRetry(fn, {
        maxRetries: 5,
        baseDelayMs: 1,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow("fatal");

    expect(fn).toHaveBeenCalledTimes(1); // no retries
  });
});

describe("isRetryableError", () => {
  it("should return true for HTTP 429", () => {
    expect(isRetryableError({ status: 429, message: "rate limited" })).toBe(true);
  });

  it("should return true for HTTP 500", () => {
    expect(isRetryableError({ status: 500, message: "server error" })).toBe(true);
  });

  it("should return true for HTTP 503", () => {
    expect(isRetryableError({ status: 503, message: "unavailable" })).toBe(true);
  });

  it("should return false for HTTP 400", () => {
    expect(isRetryableError({ status: 400, message: "bad request" })).toBe(false);
  });

  it("should return false for HTTP 401", () => {
    expect(isRetryableError({ status: 401, message: "unauthorized" })).toBe(false);
  });

  it("should return false for CircuitOpenError", () => {
    const err = new Error("circuit open");
    (err as any).name = "CircuitOpenError";
    expect(isRetryableError(err)).toBe(false);
  });

  it("should return false for AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isRetryableError(err)).toBe(false);
  });

  it("should return true for TypeError (network failure)", () => {
    expect(isRetryableError(new TypeError("fetch failed"))).toBe(true);
  });

  it("should return true for ECONNRESET", () => {
    const err = new Error("connection reset");
    (err as any).code = "ECONNRESET";
    expect(isRetryableError(err)).toBe(true);
  });

  it("should return true for ETIMEDOUT", () => {
    const err = new Error("timed out");
    (err as any).code = "ETIMEDOUT";
    expect(isRetryableError(err)).toBe(true);
  });

  it("should return true for status in JSON message", () => {
    const err = new Error(JSON.stringify({ code: "GEMINI_HTTP_ERROR", status: 503, body: "overloaded" }));
    expect(isRetryableError(err)).toBe(true);
  });

  it("should return false for null/undefined", () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});
