import { describe, expect, test, jest, beforeEach } from "@jest/globals";

const executeWithAgentMock = jest.fn();
const buildMultiIntentPlanMock = jest.fn();

jest.mock("../../../middleware/auth.middleware", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: "user_1" };
    next();
  },
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../modules/editing/application", () => ({
  EditingFacadeService: jest.fn().mockImplementation(() => ({
    executeWithAgent: executeWithAgentMock,
  })),
}));

jest.mock("../../../controllers/editorSession.controller", () => ({
  createEditorSessionController: () => ({
    start: (_req: any, res: any) => res.status(501).json({ ok: false }),
    get: (_req: any, res: any) => res.status(501).json({ ok: false }),
    apply: (_req: any, res: any) => res.status(501).json({ ok: false }),
    cancel: (_req: any, res: any) => res.status(501).json({ ok: false }),
  }),
}));

jest.mock("../../../services/editing/documentRevisionStore.service", () => ({
  __esModule: true,
  default: class MockDocumentRevisionStoreService {},
}));

jest.mock("../../../services/editing/allybi", () => ({
  buildMultiIntentPlan: (...args: any[]) => buildMultiIntentPlanMock(...args),
}));

import router from "./editor-session.routes";

describe("editor-session /assistant/stream", () => {
  beforeEach(() => {
    executeWithAgentMock.mockReset();
    buildMultiIntentPlanMock.mockReset();
    buildMultiIntentPlanMock.mockReturnValue({
      directives: [],
      steps: [],
      conflicts: [],
    });
  });

  test("streams stage/worklog/final/done frames with edit_session attachment", async () => {
    executeWithAgentMock.mockResolvedValue({
      agentId: "edit_agent_docx",
      response: {
        ok: true,
        result: {
          ok: true,
          target: {
            id: "docx:p:1",
            label: "Paragraph 1",
            confidence: 1,
            candidates: [],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "viewer_selection",
          },
          diff: {
            kind: "paragraph",
            before: "Before text",
            after: "After text",
            changed: true,
            summary: "Updated paragraph",
            changes: [],
          },
          requiresConfirmation: false,
        },
        receipt: null,
      },
    });

    const layer = (router as any).stack.find(
      (entry: any) => entry?.route?.path === "/assistant/stream",
    );
    expect(layer).toBeTruthy();
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const chunks: string[] = [];
    const req: any = {
      body: {
        message: "Rewrite this paragraph",
        meta: {
          viewerContext: {
            fileType: "docx",
            activeDocumentId: "doc_1",
          },
          viewerSelection: {
            paragraphId: "docx:p:1",
            text: "Before text",
            domain: "docx",
          },
        },
      },
      headers: {},
      user: { id: "user_1" },
      path: "/assistant/stream",
    };
    const res: any = {
      writableEnded: false,
      statusCode: 200,
      headers: {},
      writeHead(code: number, headers: Record<string, unknown>) {
        this.statusCode = code;
        this.headers = headers;
      },
      flushHeaders() {},
      write(chunk: string) {
        chunks.push(String(chunk || ""));
      },
      end() {
        this.writableEnded = true;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        chunks.push(JSON.stringify(payload));
        this.writableEnded = true;
        return this;
      },
    };

    await handler(req, res);

    const output = chunks.join("");
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["Content-Type"] || "")).toContain(
      "text/event-stream",
    );
    expect(output).toContain('"type":"stage"');
    expect(output).toContain('"type":"worklog"');
    expect(output).toContain('"type":"final"');
    expect(output).toContain('"type":"done"');
    expect(output).toContain('"type":"edit_session"');
    expect(executeWithAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "preview",
        beforeText: "Before text",
      }),
    );
  });

  test("routes question intents to chat runtime with doc lock", async () => {
    executeWithAgentMock.mockResolvedValue({
      agentId: "edit_agent_docx",
      response: { ok: false, error: "should_not_be_called" },
    });

    const streamChatMock = jest.fn().mockImplementation(async (params: any) => {
      params?.sink?.write?.({
        event: "delta",
        data: { text: "This document is about..." },
      });
      return {
        conversationId: "conv_qa_1",
        userMessageId: "msg_user_1",
        assistantMessageId: "msg_asst_1",
        assistantText: "This document is about...",
        answerMode: "doc_grounded_single",
        answerClass: "DOCUMENT",
        navType: null,
        sources: [],
      };
    });

    const layer = (router as any).stack.find(
      (entry: any) => entry?.route?.path === "/assistant/stream",
    );
    expect(layer).toBeTruthy();
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const chunks: string[] = [];
    const req: any = {
      body: {
        message: "What is this document about?",
        meta: {
          viewerContext: {
            fileType: "docx",
            activeDocumentId: "doc_qa_1",
          },
          viewerSelection: {
            paragraphId: "docx:p:12",
            text: "Selected paragraph content",
            domain: "docx",
          },
        },
      },
      headers: {},
      user: { id: "user_1" },
      path: "/assistant/stream",
      app: {
        locals: {
          services: {
            chat: {
              streamChat: streamChatMock,
            },
          },
        },
      },
    };
    const res: any = {
      writableEnded: false,
      statusCode: 200,
      headers: {},
      writeHead(code: number, headers: Record<string, unknown>) {
        this.statusCode = code;
        this.headers = headers;
      },
      flushHeaders() {},
      write(chunk: string) {
        chunks.push(String(chunk || ""));
      },
      end() {
        this.writableEnded = true;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        chunks.push(JSON.stringify(payload));
        this.writableEnded = true;
        return this;
      },
    };

    await handler(req, res);

    const output = chunks.join("");
    expect(res.statusCode).toBe(200);
    expect(streamChatMock).toHaveBeenCalled();
    expect(executeWithAgentMock).not.toHaveBeenCalled();
    expect(output).toContain('"executionPath":"chat_runtime"');
    expect(output).toContain('"type":"final"');
    expect(output).toContain('"type":"done"');

    const streamReq = streamChatMock.mock.calls[0][0]?.req;
    expect(streamReq?.attachedDocumentIds).toContain("doc_qa_1");
    expect(streamReq?.context?.signals?.explicitDocLock).toBe(true);
    expect(streamReq?.context?.signals?.activeDocId).toBe("doc_qa_1");
  });

  test("uses allybi operator planning for edit path when operator is omitted", async () => {
    buildMultiIntentPlanMock.mockReturnValue({
      directives: ['replace "foo" with "bar"'],
      steps: [
        {
          stepId: "step_1",
          canonicalOperator: "DOCX_FIND_REPLACE",
          runtimeOperator: "EDIT_DOCX_BUNDLE",
          domain: "docx",
          requiresConfirmation: false,
          previewRenderType: "docx_text_diff",
        },
      ],
      conflicts: [],
    });

    executeWithAgentMock.mockResolvedValue({
      agentId: "edit_agent_docx",
      response: {
        ok: true,
        result: {
          ok: true,
          target: {
            id: "synthetic:bulk_docx_edit",
            label: "Bulk DOCX edit",
            confidence: 1,
            candidates: [],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "operator_does_not_require_target",
          },
          diff: {
            kind: "paragraph",
            before: "",
            after: "Prepared replacement",
            changed: true,
            summary: "Prepared replacement",
            changes: [],
          },
          requiresConfirmation: true,
        },
        receipt: null,
      },
    });

    const layer = (router as any).stack.find(
      (entry: any) => entry?.route?.path === "/assistant/stream",
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req: any = {
      body: {
        message: 'replace "foo" with "bar"',
        meta: {
          viewerContext: {
            fileType: "docx",
            activeDocumentId: "doc_edit_1",
          },
          viewerSelection: {
            domain: "docx",
          },
        },
      },
      headers: {},
      user: { id: "user_1" },
      path: "/assistant/stream",
    };
    const chunks: string[] = [];
    const res: any = {
      writableEnded: false,
      statusCode: 200,
      headers: {},
      writeHead(code: number, headers: Record<string, unknown>) {
        this.statusCode = code;
        this.headers = headers;
      },
      flushHeaders() {},
      write(chunk: string) {
        chunks.push(String(chunk || ""));
      },
      end() {
        this.writableEnded = true;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        chunks.push(JSON.stringify(payload));
        this.writableEnded = true;
        return this;
      },
    };

    await handler(req, res);

    expect(executeWithAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        planRequest: expect.objectContaining({
          operator: "EDIT_DOCX_BUNDLE",
          canonicalOperator: "DOCX_FIND_REPLACE",
        }),
      }),
    );
    expect(chunks.join("")).toContain('"type":"final"');
  });
});
