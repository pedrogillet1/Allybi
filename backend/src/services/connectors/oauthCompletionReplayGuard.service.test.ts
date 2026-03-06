import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockCreate = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    connectorIdentityMap: {
      create: (...args: any[]) => mockCreate(...args),
    },
  },
}));

import {
  consumeOAuthCompletionPayloadOnce,
  resetOAuthCompletionReplayCacheForTests,
} from "./oauthCompletionReplayGuard.service";

describe("oauthCompletionReplayGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetOAuthCompletionReplayCacheForTests();
  });

  test("accepts first completion and rejects replay via durable unique violation", async () => {
    mockCreate.mockResolvedValueOnce({ id: "row-1" });
    mockCreate.mockRejectedValueOnce({
      code: "P2002",
      message: "Unique constraint",
    });

    const first = await consumeOAuthCompletionPayloadOnce({
      userId: "user-1",
      provider: "gmail",
      nonce: "nonce-1",
      expMs: Date.now() + 5 * 60_000,
    });
    resetOAuthCompletionReplayCacheForTests();
    const second = await consumeOAuthCompletionPayloadOnce({
      userId: "user-1",
      provider: "gmail",
      nonce: "nonce-1",
      expMs: Date.now() + 5 * 60_000,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  test("returns false for malformed input", async () => {
    const out = await consumeOAuthCompletionPayloadOnce({
      userId: "",
      provider: "gmail",
      nonce: "",
      expMs: Number.NaN,
    } as any);
    expect(out).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
