import { Router } from "express";
import type { Request, Response } from "express";
import { randomUUID } from "crypto";

import { authMiddleware } from "../../../middleware/auth.middleware";
import { rateLimitMiddleware } from "../../../middleware/rateLimit.middleware";
import { createEditorSessionController } from "../../../controllers/editorSession.controller";
import {
  EditingFacadeService,
  type EditDomain,
  type EditOperator,
  type ResolvedTarget,
} from "../../../modules/editing/application";
import DocumentRevisionStoreService from "../../../services/editing/documentRevisionStore.service";
import { normalizeEditOperator } from "../../../services/editing/editOperatorAliases.service";
import { buildMultiIntentPlan } from "../../../services/editing/allybi";
import {
  resolveChatPreferredLanguage,
  type ChatLanguage,
} from "../../../services/chat/chatLanguage.service";
import { resolveGenericChatFailureMessage } from "../../../services/chat/chatMicrocopy.service";
import { toChatFinalEvent } from "../../../modules/chat/api/chatResultEnvelope";
import type {
  LLMStreamingConfig,
  StreamDelta,
  StreamEvent,
  StreamSink,
  StreamTransport,
} from "../../../services/llm/types/llmStreaming.types";
import { logger } from "../../../utils/logger";

const router = Router();
const controller = createEditorSessionController();

router.post("/start", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.start(req, res),
);
router.get("/:sessionId", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.get(req, res),
);
router.post("/apply", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.apply(req, res),
);
router.post("/cancel", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.cancel(req, res),
);

// ---------------------------------------------------------------------------
// POST /assistant/stream — SSE streaming for editor assistant
// Replaces the former /api/chat/viewer/stream endpoint.
// Delegates to the editing agent pipeline instead of the chat kernel.
// ---------------------------------------------------------------------------

const editingFacade = new EditingFacadeService({
  revisionStore: new DocumentRevisionStoreService(),
});

const DEFAULT_STREAMING_CONFIG: LLMStreamingConfig = {
  chunking: { maxCharsPerDelta: 64 },
  markerHold: { enabled: false, flushAt: "final", maxBufferedMarkers: 0 },
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getChatService(req: Request): any {
  const svc = (req.app.locals?.services as any)?.chat;
  if (!svc) throw new Error("CHAT_SERVICE_NOT_WIRED");
  return svc;
}

function getUserId(req: Request): string | null {
  const anyReq = req as any;
  const userId = anyReq?.user?.id || anyReq?.userId || anyReq?.auth?.userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

function inferDomain(body: Record<string, unknown>): EditDomain {
  const explicit = asString(body.domain).toLowerCase();
  if (explicit === "docx" || explicit === "sheets") return explicit;

  const meta =
    body.meta && typeof body.meta === "object"
      ? (body.meta as Record<string, unknown>)
      : {};
  const viewerSelection =
    meta.viewerSelection && typeof meta.viewerSelection === "object"
      ? (meta.viewerSelection as Record<string, unknown>)
      : {};
  const selectionDomain = asString(viewerSelection.domain).toLowerCase();
  if (selectionDomain === "docx") return "docx";
  if (
    selectionDomain === "xlsx" ||
    selectionDomain === "excel" ||
    selectionDomain === "sheets"
  ) {
    return "sheets";
  }

  const viewerContext =
    meta.viewerContext && typeof meta.viewerContext === "object"
      ? (meta.viewerContext as Record<string, unknown>)
      : {};
  const fileType = asString(viewerContext.fileType).toLowerCase();
  if (
    fileType === "excel" ||
    fileType === "xlsx" ||
    fileType === "sheet" ||
    fileType === "sheets" ||
    fileType === "spreadsheet"
  ) {
    return "sheets";
  }

  return "docx";
}

function inferDocumentId(body: Record<string, unknown>): string {
  const explicit = asString(body.documentId);
  if (explicit) return explicit;

  const meta =
    body.meta && typeof body.meta === "object"
      ? (body.meta as Record<string, unknown>)
      : {};
  const viewerContext =
    meta.viewerContext && typeof meta.viewerContext === "object"
      ? (meta.viewerContext as Record<string, unknown>)
      : {};
  const activeDocumentId = asString(viewerContext.activeDocumentId);
  if (activeDocumentId) return activeDocumentId;

  const attached = Array.isArray(body.attachedDocuments)
    ? body.attachedDocuments
    : [];
  for (const item of attached) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id =
      asString(obj.id) || asString(obj.documentId) || asString(obj.docId);
    if (id) return id;
  }

  return "";
}

function extractAttachedDocumentIds(body: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const attached = Array.isArray(body.attachedDocuments)
    ? body.attachedDocuments
    : [];
  for (const item of attached) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id =
      asString(obj.id) || asString(obj.documentId) || asString(obj.docId);
    if (id) ids.add(id);
  }
  const single =
    asString(body.attachedDocumentId) ||
    asString(body.documentId) ||
    asString((body as any).docId);
  if (single) ids.add(single);
  return [...ids];
}

function inferViewerSelection(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const meta =
    body.meta && typeof body.meta === "object"
      ? (body.meta as Record<string, unknown>)
      : {};
  if (meta.viewerSelection && typeof meta.viewerSelection === "object") {
    return meta.viewerSelection as Record<string, unknown>;
  }
  return {};
}

function inferBeforeText(
  body: Record<string, unknown>,
  selection: Record<string, unknown>,
): string {
  const explicit = asString(body.beforeText);
  if (explicit) return explicit;
  const selected = asString(selection.text);
  if (selected) return selected;
  return "";
}

function inferTarget(
  domain: EditDomain,
  selection: Record<string, unknown>,
  beforeText: string,
): ResolvedTarget | undefined {
  if (domain === "docx") {
    const paragraphId = asString(selection.paragraphId);
    if (!paragraphId) return undefined;
    return {
      id: paragraphId,
      label: beforeText || "Selected paragraph",
      confidence: 1,
      candidates: [],
      decisionMargin: 1,
      isAmbiguous: false,
      resolutionReason: "viewer_selection",
    };
  }

  if (domain === "sheets") {
    const rangeA1 =
      asString(selection.rangeA1) ||
      asString((selection as any).a1) ||
      (Array.isArray((selection as any).ranges) &&
      (selection as any).ranges.length > 0
        ? asString((selection as any).ranges[0])
        : "");
    const sheetName = asString(selection.sheetName);
    const targetId = rangeA1
      ? sheetName
        ? `${sheetName}!${rangeA1}`
        : rangeA1
      : "";
    if (!targetId) return undefined;
    return {
      id: targetId,
      label: targetId,
      confidence: 1,
      candidates: [],
      decisionMargin: 1,
      isAmbiguous: false,
      resolutionReason: "viewer_selection",
    };
  }

  return undefined;
}

function inferSheetSelection(selection: Record<string, unknown>): {
  sheetName: string | null;
  rangeA1: string | null;
} {
  const sheetName = asString(selection.sheetName) || null;
  const rangeA1 =
    asString(selection.rangeA1) ||
    asString((selection as any).a1) ||
    (Array.isArray((selection as any).ranges) &&
    (selection as any).ranges.length > 0
      ? asString((selection as any).ranges[0])
      : "");
  return {
    sheetName,
    rangeA1: rangeA1 || null,
  };
}

function looksLikeQuestion(message: string): boolean {
  const text = String(message || "")
    .trim()
    .toLowerCase();
  if (!text) return false;
  if (text.includes("?")) return true;
  return /^(what|why|how|where|when|who|which|explain|analyze|interpret|describe|meaning|does)\b/.test(
    text,
  );
}

function looksLikeExplicitEditCommand(
  message: string,
  domain: EditDomain,
): boolean {
  const text = String(message || "")
    .trim()
    .toLowerCase();
  if (!text) return false;

  const commonEdit =
    /\b(rewrite|rephrase|translate|replace|find and replace|find-replace|insert|delete|remove|edit|fix|correct|change|update|convert|merge|split|tone|formal|concise|casual|friendly|grammar|typo|format)\b/;
  if (commonEdit.test(text)) return true;

  if (domain === "sheets") {
    return /\b(set|fill|formula|sort|filter|table|freeze|chart|highlight|conditional format|pivot|calculate|compute)\b/.test(
      text,
    );
  }
  return false;
}

function shouldUseQaPath(input: {
  message: string;
  domain: EditDomain;
  rawOperator: unknown;
}): boolean {
  const explicitOperator = asString(input.rawOperator);
  if (explicitOperator) return false;
  if (looksLikeExplicitEditCommand(input.message, input.domain)) return false;
  return looksLikeQuestion(input.message);
}

function resolveEditingOperator(input: {
  domain: EditDomain;
  message: string;
  rawOperator: unknown;
  explicitTarget?: string | null;
}): { operator: EditOperator; canonicalOperator?: string } {
  const normalized = normalizeEditOperator(input.rawOperator, {
    domain: input.domain,
    instruction: input.message,
  });
  if (normalized.operator) {
    return {
      operator: normalized.operator,
      canonicalOperator: normalized.canonicalOperator || undefined,
    };
  }

  const plan = buildMultiIntentPlan({
    domain: input.domain,
    message: input.message,
    explicitTarget: input.explicitTarget || null,
  });
  const first = Array.isArray(plan.steps)
    ? plan.steps.find((step) =>
        Boolean(String(step.runtimeOperator || "").trim()),
      )
    : null;
  if (first?.runtimeOperator) {
    return {
      operator: first.runtimeOperator as EditOperator,
      canonicalOperator: first.canonicalOperator || undefined,
    };
  }

  return {
    operator: input.domain === "sheets" ? "COMPUTE_BUNDLE" : "EDIT_PARAGRAPH",
  };
}

function shouldInjectSelectionInQa(message: string): boolean {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  return /\b(this|that|selected|selection|highlight(ed)?|here|cell|range|paragraph|section|line)\b/.test(
    text,
  );
}

function buildQaMessage(input: {
  message: string;
  beforeText: string;
  domain: EditDomain;
}): string {
  const base = String(input.message || "").trim();
  const selected = String(input.beforeText || "").trim();
  if (!base || !selected || !shouldInjectSelectionInQa(base)) return base;
  const clipped =
    selected.length > 1800 ? `${selected.slice(0, 1797)}...` : selected;
  const label =
    input.domain === "sheets" ? "Selected range content" : "Selected text";
  return `${base}\n\n${label}:\n${clipped}`;
}

function buildAssistantText(
  preview: Record<string, unknown> | null,
  domain: EditDomain,
): string {
  const diff =
    preview?.diff && typeof preview.diff === "object"
      ? (preview.diff as Record<string, unknown>)
      : null;
  const after = asString(diff?.after);
  const summary = asString(diff?.summary);

  if (after) {
    const clipped =
      after.length > 700 ? `${after.slice(0, 697).trimEnd()}...` : after;
    return clipped;
  }
  if (summary) return summary;
  return domain === "sheets"
    ? "Draft sheet edits are ready. Review and apply when ready."
    : "Draft edit is ready. Review and apply when ready.";
}

function sendSse(res: Response, payload: Record<string, unknown>): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

class EditorAssistantChatSink implements StreamSink {
  transport: StreamTransport = "sse";
  private open = true;

  constructor(
    private readonly res: Response,
    private readonly language: ChatLanguage,
  ) {}

  private normalizeStage(raw: unknown): string {
    const s = String(raw || "").trim();
    if (!s) return "processing";
    if (s === "retrieval") return "retrieving";
    if (s === "compose" || s === "generation") return "composing";
    if (s === "validation") return "validating";
    if (s === "render") return "finalizing";
    return s;
  }

  write(event: StreamEvent): void {
    if (!this.open || this.res.writableEnded) return;
    const ev = String(event.event || "");
    if (ev === "delta") {
      const text = (event.data as StreamDelta)?.text;
      if (text) sendSse(this.res, { type: "delta", text });
      return;
    }
    if (ev === "meta") {
      const data = event.data as any;
      sendSse(this.res, {
        type: "meta",
        answerMode: data?.answerMode,
        answerClass: data?.answerClass ?? null,
        navType: data?.navType ?? null,
      });
      return;
    }
    if (ev === "progress") {
      const data = event.data as any;
      sendSse(this.res, {
        type: "stage",
        stage: this.normalizeStage(data?.stage) || "processing",
        message: data?.message || "",
        key: data?.key || null,
        params: data?.params || null,
        phase: data?.phase || null,
        step: data?.step || null,
        status: data?.status || null,
        vars: data?.vars || null,
        summary: data?.summary || null,
        scope: data?.scope || null,
        documentKind: data?.documentKind || null,
        documentLabel: data?.documentLabel || null,
      });
      return;
    }
    if (ev === "worklog") {
      sendSse(this.res, { type: "worklog", ...(event.data as any) });
      return;
    }
    if (ev === "sources") {
      const data = event.data as any;
      sendSse(this.res, { type: "sources", sources: data?.sources || data });
      return;
    }
    if (ev === "followups") {
      const data = event.data as any;
      sendSse(this.res, {
        type: "followups",
        followups: data?.followups || data,
      });
      return;
    }
    if (ev === "action") {
      sendSse(this.res, { type: "action", ...(event.data as any) });
      return;
    }
    if (ev === "listing") {
      const data = event.data as any;
      sendSse(this.res, {
        type: "listing",
        items: data?.items || [],
        ...(Array.isArray(data?.breadcrumb) && data.breadcrumb.length
          ? { breadcrumb: data.breadcrumb }
          : {}),
      });
      return;
    }
    if (ev === "error") {
      const data = event.data as any;
      const safeMessage =
        resolveGenericChatFailureMessage(
          this.language,
          String(data?.code || data?.message || "stream_error"),
        ) || String(data?.message || "Request failed");
      sendSse(this.res, { type: "error", message: safeMessage });
    }
  }

  flush(): void {}

  close(): void {
    this.open = false;
  }

  isOpen(): boolean {
    return this.open && !this.res.writableEnded;
  }
}

router.post(
  "/assistant/stream",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const message = asString(body.message);
    const domain = inferDomain(body);
    const documentId = inferDocumentId(body);
    const selection = inferViewerSelection(body);
    const beforeText = inferBeforeText(body, selection);
    const proposedText = asString(body.proposedText);
    const targetHint =
      domain === "docx"
        ? asString((selection as any).paragraphId)
        : asString((selection as any).rangeA1) ||
          asString((selection as any).a1);
    const resolvedOperator = resolveEditingOperator({
      domain,
      message,
      rawOperator: body.operator,
      explicitTarget: targetHint || null,
    });
    const operator: EditOperator = resolvedOperator.operator;
    const target = inferTarget(domain, selection, beforeText);

    if (!message || !documentId) {
      res.status(400).json({ error: "message and documentId are required" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(`: heartbeat\n\n`);
    }, 15_000);

    try {
      const correlationId =
        (typeof req.headers["x-correlation-id"] === "string"
          ? req.headers["x-correlation-id"].trim()
          : "") || randomUUID();

      const clientMessageId =
        (typeof req.headers["x-client-message-id"] === "string"
          ? req.headers["x-client-message-id"].trim()
          : "") || randomUUID();

      const language = body.language as string | undefined;
      const safeLanguage =
        language === "en" || language === "pt" || language === "es"
          ? language
          : undefined;
      const runId = clientMessageId;
      const qaPath = shouldUseQaPath({
        message,
        domain,
        rawOperator: body.operator,
      });

      if (qaPath) {
        const preferredLanguage = resolveChatPreferredLanguage(
          language,
          message,
        );
        const chat = getChatService(req);
        const rawMeta =
          body.meta && typeof body.meta === "object"
            ? (body.meta as Record<string, unknown>)
            : {};
        const rawContext =
          body.context && typeof body.context === "object"
            ? (body.context as Record<string, unknown>)
            : {};
        const existingSignals =
          rawContext.signals && typeof rawContext.signals === "object"
            ? (rawContext.signals as Record<string, unknown>)
            : {};
        const sheetSelection = inferSheetSelection(selection);
        const attachedDocumentIds = Array.from(
          new Set([documentId, ...extractAttachedDocumentIds(body)]),
        ).filter(Boolean);

        const qaRequestMeta: Record<string, unknown> = {
          ...rawMeta,
          viewerMode: true,
          intentFamily: "documents",
          operator: "extract",
          operatorFamily: null,
          answerMode: undefined,
        };
        const qaRequestContext: Record<string, unknown> = {
          ...rawContext,
          signals: {
            ...existingSignals,
            explicitDocLock: true,
            activeDocId: documentId,
            singleDocIntent: true,
            hardScopeActive: true,
            ...(domain === "sheets"
              ? {
                  sheetHintPresent: Boolean(sheetSelection.sheetName),
                  resolvedSheetName: sheetSelection.sheetName,
                  rangeExplicit: Boolean(sheetSelection.rangeA1),
                  resolvedRangeA1: sheetSelection.rangeA1,
                }
              : {}),
          },
        };

        sendSse(res, {
          type: "meta",
          answerMode: "doc_grounded_single",
          answerClass: "DOCUMENT",
          navType: null,
          executionPath: "chat_runtime",
          domain,
        });
        sendSse(res, {
          type: "worklog",
          eventType: "RUN_START",
          runId,
          title: domain === "sheets" ? "Analyzing sheet" : "Analyzing document",
          summary: `Working on: ${message.slice(0, 120)}${message.length > 120 ? "..." : ""}`,
        });
        sendSse(res, {
          type: "stage",
          stage: "retrieving",
          key: "allybi.stage.search.scanning_library",
          message: "",
        });

        const sink = new EditorAssistantChatSink(res, preferredLanguage);
        const qaMessage = buildQaMessage({ message, beforeText, domain });
        const result = await chat.streamChat({
          req: {
            userId,
            conversationId:
              asString(body.conversationId) || `editing:${domain}:${userId}`,
            message: qaMessage,
            attachedDocumentIds,
            preferredLanguage,
            meta: qaRequestMeta,
            context: qaRequestContext,
            connectorContext: {
              activeProvider: null,
              gmail: { connected: false, canSend: false },
              outlook: { connected: false, canSend: false },
              slack: { connected: false, canSend: false },
            },
          },
          sink,
          streamingConfig: DEFAULT_STREAMING_CONFIG,
        });

        sendSse(res, {
          type: "worklog",
          eventType: "RUN_COMPLETE",
          runId,
          summary: "Completed",
        });
        sendSse(res, {
          ...toChatFinalEvent(result),
          domain,
          executionPath: "chat_runtime",
        } as Record<string, unknown>);
        return;
      }

      sendSse(res, {
        type: "meta",
        answerMode: "action_receipt",
        answerClass: "edit",
        agentId: null,
        domain,
        executionPath: "editing_agent_router",
      });
      sendSse(res, {
        type: "stage",
        stage: "editing",
        key: "allybi.stage.edit.progress",
        message: "",
      });
      sendSse(res, {
        type: "worklog",
        eventType: "RUN_START",
        runId,
        title:
          domain === "sheets" ? "Preparing sheet edits" : "Preparing edits",
        summary: `Working on: ${message.slice(0, 120)}${message.length > 120 ? "..." : ""}`,
      });
      sendSse(res, {
        type: "worklog",
        eventType: "STEP_ADD",
        runId,
        stepId: "plan",
        label: "Plan edit",
        status: "running",
      });
      sendSse(res, {
        type: "progress",
        runId,
        percent: 10,
      });

      const execution = await editingFacade.executeWithAgent({
        mode: "preview",
        context: {
          userId,
          conversationId: `editing:${domain || "generic"}:${userId}`,
          correlationId,
          clientMessageId,
          ...(safeLanguage ? { language: safeLanguage } : {}),
        },
        planRequest: {
          instruction: message,
          operator,
          canonicalOperator: resolvedOperator.canonicalOperator,
          domain,
          documentId,
        },
        beforeText,
        proposedText,
        ...(target ? { target } : {}),
      });

      sendSse(res, {
        type: "worklog",
        eventType: "STEP_UPDATE",
        runId,
        stepId: "plan",
        status: execution.response.ok ? "done" : "error",
      });
      sendSse(res, {
        type: "progress",
        runId,
        percent: execution.response.ok ? 70 : 100,
      });

      if (execution.response.ok) {
        const preview =
          execution.response.result &&
          typeof execution.response.result === "object"
            ? (execution.response.result as unknown as Record<string, unknown>)
            : null;
        const diff =
          preview?.diff && typeof preview.diff === "object"
            ? (preview.diff as Record<string, unknown>)
            : null;
        const finalProposedText =
          proposedText || asString(diff?.after) || asString(body.proposedText);
        const effectiveTarget =
          preview?.target && typeof preview.target === "object"
            ? (preview.target as ResolvedTarget)
            : target;
        const assistantText = buildAssistantText(preview, domain);
        const editSessionAttachment = {
          type: "edit_session",
          domain,
          documentId,
          instruction: message,
          operator,
          canonicalOperator: resolvedOperator.canonicalOperator,
          beforeText,
          proposedText: finalProposedText,
          target: effectiveTarget ?? null,
          diff: diff ?? null,
          receipt: execution.response.receipt ?? null,
          requiresConfirmation: Boolean((preview as any)?.requiresConfirmation),
        };

        sendSse(res, {
          type: "worklog",
          eventType: "STEP_ADD",
          runId,
          stepId: "preview",
          label: "Build preview",
          status: "done",
        });
        sendSse(res, {
          type: "stage",
          stage: "editing",
          key: "allybi.stage.edit.ready",
          message: "",
        });
        sendSse(res, {
          type: "progress",
          runId,
          percent: 95,
        });
        if (assistantText) {
          sendSse(res, {
            type: "delta",
            text: assistantText,
          });
        }

        sendSse(res, {
          type: "final",
          ok: true,
          agentId: execution.agentId,
          domain,
          executionPath: "editing_agent_router",
          result: execution.response.result ?? null,
          receipt: execution.response.receipt ?? null,
          message: {
            messageId: randomUUID(),
            text: assistantText,
            answerMode: "action_receipt",
            answerClass: "edit",
            status: "success",
            attachments: [editSessionAttachment],
            sources: [],
            followups: [],
          },
        });
        sendSse(res, {
          type: "worklog",
          eventType: "RUN_COMPLETE",
          runId,
        });
        sendSse(res, {
          type: "progress",
          runId,
          percent: 100,
        });
      } else {
        sendSse(res, {
          type: "error",
          message: execution.response.error || "Editing agent failed",
        });
        sendSse(res, {
          type: "worklog",
          eventType: "RUN_ERROR",
          runId,
          summary: execution.response.error || "Editing agent failed",
        });
      }
    } catch (e: any) {
      logger.error("[EditorSession] assistant/stream error", {
        path: req.path,
        error: e?.message,
        stack: e?.stack,
      });
      sendSse(res, {
        type: "error",
        message: "Editor assistant request failed",
      });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        sendSse(res, { type: "done" });
        res.end();
      }
    }
  },
);

export default router;
