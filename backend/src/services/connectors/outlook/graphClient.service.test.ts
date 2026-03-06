import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import { GraphClientService } from "./graphClient.service";

describe("GraphClientService retry behavior", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("retries once on 429 when retryOnRateLimit is enabled", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [{ id: "msg-1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    global.fetch = fetchMock as any;
    const timerSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation(((fn: any) => {
        if (typeof fn === "function") fn();
        return 0 as any;
      }) as any);

    const svc = new GraphClientService();
    const result = await svc.listMessages({ accessToken: "token-1", top: 1 });
    expect(Array.isArray(result.value)).toBe(true);
    expect(result.value?.[0]?.id).toBe("msg-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timerSpy).toHaveBeenCalled();
  });

  test("fails fast on non-retryable HTTP error", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response("unauthorized", {
        status: 401,
        headers: { "content-type": "text/plain" },
      }),
    );
    global.fetch = fetchMock as any;

    const svc = new GraphClientService();
    await expect(
      svc.listMessages({ accessToken: "token-1", top: 1 }),
    ).rejects.toThrow(/Graph request failed \(401\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

