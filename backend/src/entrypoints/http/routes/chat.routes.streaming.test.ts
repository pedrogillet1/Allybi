import "reflect-metadata";
import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the router
// ---------------------------------------------------------------------------

const streamChatMock = jest.fn();

jest.mock("../../../middleware/auth.middleware", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: "user_stream_1", email: "test@test.com", role: "user" };
    next();
  },
}));

jest.mock("../../../middleware/authorize.middleware", () => ({
  authorizeByMethod: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/validate.middleware", () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));

// Break heavy dependency chains
jest.mock("../../../services/prismaChat.service", () => ({
  ConversationNotFoundError: class ConversationNotFoundError extends Error {
    constructor(m?: string) { super(m || "not found"); this.name = "ConversationNotFoundError"; }
  },
}));

jest.mock("../../../modules/chat/api/chatResultEnvelope", () => ({
  toChatFinalEvent: (result: any) => ({ type: "final", ...result }),
  toChatHttpEnvelope: (result: any) => ({ ok: true, data: result }),
}));

jest.mock("../../../services/chat/chatMicrocopy.service", () => ({
  resolveGenericChatFailureMessage: (_lang: string, _code: string) => "Something went wrong. Please try again.",
}));

jest.mock("../../../services/chat/chatLanguage.service", () => ({
  resolveChatPreferredLanguage: () => "en",
}));

import router from "./chat.routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  // Provide a mock chat service via app.locals
  app.locals.services = {
    chat: { streamChat: streamChatMock },
  };
  app.use("/", router);
  return app;
}

function parseSSEEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => {
      const json = chunk.replace(/^data: /, "");
      try {
        return JSON.parse(json);
      } catch {
        return { _raw: json };
      }
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /stream — SSE streaming", () => {
  beforeEach(() => {
    streamChatMock.mockReset();
  });

  test("returns correct SSE headers", async () => {
    streamChatMock.mockImplementation(async ({ sink }: any) => {
      sink.close();
      return {
        assistantMessageId: "msg_1",
        conversationId: "00000000-0000-4000-8000-000000000001",
        answer: "hello",
        answerMode: "general_answer",
        sources: [],
      };
    });

    const app = buildApp();
    const res = await request(app)
      .post("/stream")
      .send({ message: "hello", conversationId: "00000000-0000-4000-8000-000000000001" })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.headers["cache-control"]).toMatch(/no-cache/);
  });

  test("streams delta events to client", async () => {
    streamChatMock.mockImplementation(async ({ sink }: any) => {
      sink.write({ event: "delta", data: { text: "Hello " } });
      sink.write({ event: "delta", data: { text: "world!" } });
      sink.close();
      return {
        assistantMessageId: "msg_2",
        conversationId: "00000000-0000-4000-8000-000000000001",
        answer: "Hello world!",
        answerMode: "general_answer",
        sources: [],
      };
    });

    const app = buildApp();
    const res = await request(app)
      .post("/stream")
      .send({ message: "test", conversationId: "00000000-0000-4000-8000-000000000001" });

    const events = parseSSEEvents(res.text);
    const deltas = events.filter((e) => e.type === "delta");
    expect(deltas.length).toBe(2);
    expect(deltas[0].text).toBe("Hello ");
    expect(deltas[1].text).toBe("world!");
  });

  test("emits final event with correct shape", async () => {
    streamChatMock.mockImplementation(async ({ sink }: any) => {
      sink.write({ event: "delta", data: { text: "answer" } });
      sink.close();
      return {
        assistantMessageId: "msg_3",
        conversationId: "00000000-0000-4000-8000-000000000001",
        answer: "answer",
        answerMode: "doc_grounded_single",
        navType: "document_nav",
        sources: [{ docId: "d1", title: "Doc" }],
      };
    });

    const app = buildApp();
    const res = await request(app)
      .post("/stream")
      .send({ message: "test", conversationId: "00000000-0000-4000-8000-000000000001" });

    const events = parseSSEEvents(res.text);
    const finals = events.filter((e) => e.type === "final");
    expect(finals.length).toBe(1);
    expect(finals[0]).toHaveProperty("assistantMessageId");

    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents.length).toBe(1);
  });

  test("sends safe error message on stream failure", async () => {
    streamChatMock.mockRejectedValue(new Error("LLM provider timeout"));

    const app = buildApp();
    const res = await request(app)
      .post("/stream")
      .send({ message: "test", conversationId: "00000000-0000-4000-8000-000000000001" });

    const events = parseSSEEvents(res.text);
    const errors = events.filter((e) => e.type === "error");
    expect(errors.length).toBe(1);
    // Error message should be safe (not leak internals unless debug mode is on)
    expect(typeof errors[0].message).toBe("string");
    expect((errors[0].message as string).length).toBeGreaterThan(0);

    // Stream should still end with done event
    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents.length).toBe(1);
  });

  test("emits initial stage event", async () => {
    streamChatMock.mockImplementation(async ({ sink }: any) => {
      sink.close();
      return {
        assistantMessageId: "msg_4",
        conversationId: "00000000-0000-4000-8000-000000000001",
        answer: "ok",
        answerMode: "general_answer",
        sources: [],
      };
    });

    const app = buildApp();
    const res = await request(app)
      .post("/stream")
      .send({ message: "test", conversationId: "00000000-0000-4000-8000-000000000001" });

    const events = parseSSEEvents(res.text);
    const stages = events.filter((e) => e.type === "stage");
    expect(stages.length).toBeGreaterThanOrEqual(1);
    expect(stages[0].stage).toBe("retrieving");
  });
});
