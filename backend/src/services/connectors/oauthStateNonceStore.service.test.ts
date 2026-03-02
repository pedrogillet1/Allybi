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

import { markOAuthStateNonceUsedDurable } from "./oauthStateNonceStore.service";

describe("oauthStateNonceStore durable replay guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns false when durable nonce create hits unique constraint", async () => {
    mockCreate.mockResolvedValueOnce({ id: "row-1" });
    mockCreate.mockRejectedValueOnce({ code: "P2002", message: "Unique constraint" });

    const first = await markOAuthStateNonceUsedDurable(
      "slack",
      "user-1",
      "nonce-1",
      Math.floor(Date.now() / 1000),
      15 * 60,
      true,
    );
    const second = await markOAuthStateNonceUsedDurable(
      "slack",
      "user-1",
      "nonce-1",
      Math.floor(Date.now() / 1000),
      15 * 60,
      true,
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
