import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import { SlackClientService } from "./slackClient.service";

describe("SlackClientService retry/rate-limit behavior", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("waits on 429 and throws explicit rate-limit error", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response("too many requests", {
        status: 429,
        headers: { "retry-after": "1" },
      }),
    );
    global.fetch = fetchMock as any;
    const timerSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation(((fn: any) => {
        if (typeof fn === "function") fn();
        return 0 as any;
      }) as any);

    const svc = new SlackClientService();
    await expect(
      svc.listConversations({ accessToken: "token-1", limit: 10 }),
    ).rejects.toThrow(/rate limited/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(timerSpy).toHaveBeenCalled();
  });

  test("throws slack API error when payload ok=false", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as any;

    const svc = new SlackClientService();
    await expect(
      svc.listConversations({ accessToken: "token-1", limit: 10 }),
    ).rejects.toThrow(/invalid_auth/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

