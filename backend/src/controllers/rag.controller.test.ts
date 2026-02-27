import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { RagController, ragController } from "./rag.controller";

// ---------------------------------------------------------------------------
// Mock chat service
// ---------------------------------------------------------------------------

const mockChatResult = {
  conversationId: "conv-123",
  userMessageId: "umsg-1",
  assistantMessageId: "amsg-1",
  assistantText: "The document is about TypeScript best practices.",
  attachmentsPayload: [],
  sources: [],
  answerMode: "doc_grounded_single" as const,
  answerClass: "DOCUMENT" as const,
  navType: null,
  fallbackReasonCode: undefined,
};

const mockChatService = {
  chat: jest.fn<() => Promise<typeof mockChatResult>>(),
  streamChat: jest.fn<() => Promise<typeof mockChatResult>>(),
  createConversation: jest.fn(),
  listConversations: jest.fn(),
  getConversation: jest.fn(),
  getConversationWithMessages: jest.fn(),
  updateTitle: jest.fn(),
  deleteConversation: jest.fn(),
  deleteAllConversations: jest.fn(),
  listMessages: jest.fn(),
  createMessage: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: any = {}): any {
  return {
    user: { id: "test-user" },
    body: { query: "What is the document about?" },
    app: { locals: { services: { chat: mockChatService } } },
    headers: {},
    on: jest.fn(),
    off: jest.fn(),
    ...overrides,
  };
}

function makeRes(): { res: any; state: any } {
  const state: any = {};
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockImplementation((body: any) => {
      state.body = body;
      return res;
    }),
    setHeader: jest.fn(),
    writeHead: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    flushHeaders: jest.fn(),
    get writableEnded() {
      return false;
    },
  };
  return { res, state };
}

function makeNext() {
  return jest.fn();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("RagController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockChatService.chat as any).mockResolvedValue(mockChatResult);
    (mockChatService.streamChat as any).mockResolvedValue(mockChatResult);
  });

  // ── 1. Module exports ────────────────────────────────────────────────────

  describe("module exports", () => {
    test("ragController is an instance of RagController", () => {
      expect(ragController).toBeInstanceOf(RagController);
    });

    test("ragController exposes query and stream methods", () => {
      expect(typeof ragController.query).toBe("function");
      expect(typeof ragController.stream).toBe("function");
    });
  });

  // ── 2. query – 401 when no user context ──────────────────────────────────

  describe("query()", () => {
    test("returns 401 via next() when req.user is absent", async () => {
      const req = makeReq({
        user: undefined,
        auth: undefined,
        userId: undefined,
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err: any = (next as any).mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(401);
    });

    test("returns 401 via next() when user.id is empty string", async () => {
      const req = makeReq({ user: { id: "" } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      const err: any = (next as any).mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });

    test("resolves userId from req.user.userId when id is absent", async () => {
      const req = makeReq({ user: { userId: "alt-user" } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "alt-user" }),
      );
    });

    test("resolves userId from req.auth.userId when user is absent", async () => {
      const req = makeReq({ user: undefined, auth: { userId: "auth-user" } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "auth-user" }),
      );
    });

    test("resolves userId from req.userId when user and auth are absent", async () => {
      const req = makeReq({
        user: undefined,
        auth: undefined,
        userId: "direct-user",
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "direct-user" }),
      );
    });

    // ── 3. query – 400 when no query string ──────────────────────────────

    test("returns 400 when body.query is absent and no fallbacks", async () => {
      const req = makeReq({ body: {} });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing "query".' });
      expect(next).not.toHaveBeenCalled();
    });

    test("returns 400 when query is whitespace-only", async () => {
      const req = makeReq({ body: { query: "   " } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing "query".' });
    });

    test("reads query from body.q as fallback", async () => {
      const req = makeReq({ body: { q: "fallback q field" } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ message: "fallback q field" }),
      );
    });

    test("reads query from body.message as fallback", async () => {
      const req = makeReq({ body: { message: "fallback message field" } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ message: "fallback message field" }),
      );
    });

    test("truncates query to 4000 characters", async () => {
      const longQuery = "x".repeat(5000);
      const req = makeReq({ body: { query: longQuery } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ message: "x".repeat(4000) }),
      );
    });

    // ── 4. query – 503 when chat service is missing ───────────────────────

    test("returns 503 via next() when chat service is missing from app.locals", async () => {
      const req = makeReq({
        app: { locals: { services: {} } },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err: any = (next as any).mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(503);
    });

    test("returns 503 via next() when app.locals.services is absent", async () => {
      const req = makeReq({ app: { locals: {} } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      const err: any = (next as any).mock.calls[0][0];
      expect(err.statusCode).toBe(503);
    });

    // ── 5. query – successful response ───────────────────────────────────

    test("returns composed JSON response on success", async () => {
      const req = makeReq();
      const { res, state } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledTimes(1);

      const body = state.body;
      expect(body.content).toBe(mockChatResult.assistantText);
      expect(body.meta).toMatchObject({
        conversationId: mockChatResult.conversationId,
        messageId: mockChatResult.assistantMessageId,
        answerMode: mockChatResult.answerMode,
        answerClass: mockChatResult.answerClass,
        routeSource: "rag_wrapper",
        sources: [],
        fallbackReasonCode: null,
        navType: null,
      });
    });

    test("passes userId, message, and meta.routeSource to chat service", async () => {
      const req = makeReq({
        user: { id: "user-abc" },
        body: { query: "Tell me about contracts." },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-abc",
          message: "Tell me about contracts.",
          meta: expect.objectContaining({
            routeSource: "rag_wrapper",
            ragCompat: true,
          }),
        }),
      );
    });

    test("passes conversationId when provided in body", async () => {
      const req = makeReq({
        body: { query: "Hello", conversationId: "conv-abc" },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-abc" }),
      );
    });

    test("passes conversationId from snake_case field as fallback", async () => {
      const req = makeReq({
        body: { query: "Hello", conversation_id: "conv-snake" },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-snake" }),
      );
    });

    test("merges body.documentIds and options.documentIds into deduped attachedDocumentIds", async () => {
      const req = makeReq({
        body: {
          query: "What is this?",
          documentIds: ["doc-1", "doc-2", "doc-2"],
          options: { documentIds: ["doc-2", "doc-3"] },
        },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      const call: any = (mockChatService.chat as any).mock.calls[0][0];
      expect(call.attachedDocumentIds).toEqual(
        expect.arrayContaining(["doc-1", "doc-2", "doc-3"]),
      );
      expect(call.attachedDocumentIds).toHaveLength(3);
    });

    test("filters out blank strings from documentIds", async () => {
      const req = makeReq({
        body: {
          query: "Hi",
          documentIds: ["doc-1", "  ", "", "doc-2"],
        },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      const call: any = (mockChatService.chat as any).mock.calls[0][0];
      expect(call.attachedDocumentIds).toEqual(["doc-1", "doc-2"]);
    });

    test("passes ragOptions context when options object has keys", async () => {
      const req = makeReq({
        body: {
          query: "Summary please",
          options: { topK: 5, threshold: 0.7 },
        },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { ragOptions: { topK: 5, threshold: 0.7 } },
        }),
      );
    });

    test("passes undefined context when options object is empty", async () => {
      const req = makeReq({
        body: { query: "Hello", options: {} },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(mockChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({ context: undefined }),
      );
    });

    test("forwards chat service rejection to next()", async () => {
      const serviceError = new Error("Database timeout");
      (mockChatService.chat as any).mockRejectedValueOnce(serviceError);

      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.query(req, res, next);

      expect(next).toHaveBeenCalledWith(serviceError);
    });
  });

  // ── 6. stream – SSE headers and events ───────────────────────────────────

  describe("stream()", () => {
    test("sets SSE Content-Type header", async () => {
      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/event-stream; charset=utf-8",
      );
    });

    test("sets Cache-Control, Connection, and X-Accel-Buffering headers", async () => {
      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "no-cache, no-transform",
      );
      expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
      expect(res.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
    });

    test("writes 'ready' SSE event immediately after headers", async () => {
      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const writeCalls: string[] = (res.write as any).mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(writeCalls.some((s) => s.includes("event: ready"))).toBe(true);
      expect(writeCalls.some((s) => s.includes('"ok":true'))).toBe(true);
    });

    test("writes 'final' SSE event containing the composed response", async () => {
      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const writeCalls: string[] = (res.write as any).mock.calls.map(
        (c: any[]) => c[0],
      );
      const finalEventLine = writeCalls.find((s) => s.includes("event: final"));
      expect(finalEventLine).toBeDefined();

      const dataLine = writeCalls[writeCalls.indexOf(finalEventLine!) + 1];
      const payload = JSON.parse(dataLine.replace(/^data: /, ""));
      expect(payload.content).toBe(mockChatResult.assistantText);
      expect(payload.meta.routeSource).toBe("rag_wrapper");
    });

    test("calls res.end() after the stream completes", async () => {
      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      expect(res.end).toHaveBeenCalledTimes(1);
    });

    test("registers and deregisters close listener on req", async () => {
      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      expect(req.on).toHaveBeenCalledWith("close", expect.any(Function));
      expect(req.off).toHaveBeenCalledWith("close", expect.any(Function));
    });

    test("returns 400 via json when query is missing", async () => {
      const req = makeReq({ body: {} });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing "query".' });
    });

    test("returns 401 via next() when userId is missing", async () => {
      const req = makeReq({
        user: undefined,
        auth: undefined,
        userId: undefined,
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const err: any = (next as any).mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });

    test("returns 503 via next() when chat service is missing", async () => {
      const req = makeReq({ app: { locals: {} } });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const err: any = (next as any).mock.calls[0][0];
      expect(err.statusCode).toBe(503);
    });

    test("writes 'error' SSE event and still calls res.end() when streamChat rejects", async () => {
      (mockChatService.streamChat as any).mockRejectedValueOnce(
        new Error("LLM timeout"),
      );

      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const writeCalls: string[] = (res.write as any).mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(writeCalls.some((s) => s.includes("event: error"))).toBe(true);
      expect(res.end).toHaveBeenCalledTimes(1);
      // next() should NOT be called; the error is handled inline
      expect(next).not.toHaveBeenCalled();
    });

    test("writes 'attachments' SSE event when result carries non-empty attachments", async () => {
      const attachment = { type: "table", data: [[1, 2]] };
      (mockChatService.streamChat as any).mockResolvedValueOnce({
        ...mockChatResult,
        attachmentsPayload: [attachment],
      });

      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const writeCalls: string[] = (res.write as any).mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(writeCalls.some((s) => s.includes("event: attachments"))).toBe(
        true,
      );
    });

    test("passes userId and message to streamChat", async () => {
      const req = makeReq({
        user: { id: "streamer-user" },
        body: { query: "Stream this query" },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      expect(mockChatService.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          req: expect.objectContaining({
            userId: "streamer-user",
            message: "Stream this query",
          }),
        }),
      );
    });

    test("passes a StreamSink with transport='sse' to streamChat", async () => {
      const req = makeReq();
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const call: any = (mockChatService.streamChat as any).mock.calls[0][0];
      expect(call.sink).toBeDefined();
      expect(call.sink.transport).toBe("sse");
    });

    test("merges documentIds + options.documentIds for stream route", async () => {
      const req = makeReq({
        body: {
          query: "Analyse this",
          documentIds: ["d1", "d2"],
          options: { documentIds: ["d2", "d3"] },
        },
      });
      const { res } = makeRes();
      const next = makeNext();

      await ragController.stream(req, res, next);

      const call: any = (mockChatService.streamChat as any).mock.calls[0][0];
      const ids: string[] = call.req.attachedDocumentIds;
      expect(ids).toHaveLength(3);
      expect(ids).toEqual(expect.arrayContaining(["d1", "d2", "d3"]));
    });
  });
});
