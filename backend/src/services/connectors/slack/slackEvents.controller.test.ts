import { afterEach, describe, expect, test } from "@jest/globals";

import { SlackEventsController } from "./slackEvents.controller";

type MockRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
  send: (payload: unknown) => MockRes;
};

function makeRes(): MockRes {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

const originalSigningSecret = process.env.SLACK_SIGNING_SECRET;

afterEach(() => {
  process.env.SLACK_SIGNING_SECRET = originalSigningSecret;
});

describe("SlackEventsController", () => {
  test("rejects event requests when SLACK_SIGNING_SECRET is not configured", async () => {
    process.env.SLACK_SIGNING_SECRET = "";

    const controller = new SlackEventsController({
      ingestDocuments: async () => [],
    } as any);

    const req: any = {
      headers: {},
      body: {
        type: "event_callback",
        event: { type: "message", channel: "C1", ts: "1710000000.0001" },
      },
    };
    const res = makeRes();

    await controller.handle(req, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "INVALID_SLACK_SIGNATURE",
        }),
      }),
    );
  });
});
