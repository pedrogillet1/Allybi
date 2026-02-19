import { describe, expect, test, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import { ragController } from "./rag.controller";
import type { ChatResult } from "../services/chatRuntime.contracts";

function makeChatResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    conversationId: "conv_1",
    userMessageId: "msg_user_1",
    assistantMessageId: "msg_assistant_1",
    assistantText: "Answer content",
    attachmentsPayload: [{ type: "source_buttons", buttons: [] }],
    sources: [],
    answerMode: "general_answer",
    answerClass: "GENERAL",
    navType: null,
    ...overrides,
  };
}

function makeRes() {
  const writes: string[] = [];
  const res = {
    writableEnded: false,
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    json: jest.fn((payload: any) => payload),
    write: jest.fn((chunk: string) => {
      writes.push(String(chunk));
      return true;
    }),
    end: jest.fn(() => {
      (res as any).writableEnded = true;
    }),
  } as unknown as Response;

  return { res, writes };
}

describe("RagController compatibility wrapper", () => {
  test("query delegates to chat service and maps to composed response", async () => {
    const chat = {
      chat: jest.fn(async () => makeChatResult()),
    };
    const { res } = makeRes();
    const req = {
      app: { locals: { services: { chat } } },
      body: {
        query: "What is in this file?",
        conversationId: "a6fb19ef-6f5a-4dd2-b9e2-e53e405eb7cb",
        documentIds: ["86adf9ad-af53-41c4-84f6-3ac9944f5404"],
      },
      headers: {},
      user: { id: "user_1" },
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    await ragController.query(req, res, next);

    expect(chat.chat).toHaveBeenCalledTimes(1);
    expect(chat.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        message: "What is in this file?",
        attachedDocumentIds: ["86adf9ad-af53-41c4-84f6-3ac9944f5404"],
      }),
    );
    expect((res.json as any).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        content: "Answer content",
        attachments: [{ type: "source_buttons", buttons: [] }],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("stream delegates to chat.streamChat and emits SSE delta + final", async () => {
    const chat = {
      streamChat: jest.fn(async ({ sink }: any) => {
        sink.write({ event: "delta", data: { text: "chunk-one" } });
        return makeChatResult({ assistantText: "chunk-one complete" });
      }),
    };
    const { res, writes } = makeRes();
    const handlers = new Map<string, (...args: any[]) => void>();
    const req = {
      app: { locals: { services: { chat } } },
      body: {
        query: "stream this answer",
        conversationId: "a6fb19ef-6f5a-4dd2-b9e2-e53e405eb7cb",
      },
      headers: {},
      user: { id: "user_1" },
      on: jest.fn((event: string, cb: (...args: any[]) => void) => {
        handlers.set(event, cb);
      }),
      off: jest.fn((event: string) => {
        handlers.delete(event);
      }),
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    await ragController.stream(req, res, next);

    expect(chat.streamChat).toHaveBeenCalledTimes(1);
    expect(writes.join("")).toContain("event: delta");
    expect(writes.join("")).toContain("event: final");
    expect(next).not.toHaveBeenCalled();
  });
});
