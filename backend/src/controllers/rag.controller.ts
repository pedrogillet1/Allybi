import type { Request, Response, NextFunction } from "express";
import type { ChatResult, PrismaChatServicePort } from "../modules/chat";
import type {
  LLMStreamingConfig,
  StreamEvent,
  StreamSink,
} from "../services/llm/types/llmStreaming.types";

type ChatLanguage = "en" | "pt" | "es";

type Attachment = Record<string, unknown>;

interface ComposedResponse {
  content: string;
  attachments?: Attachment[];
  language?: ChatLanguage;
  meta?: Record<string, unknown>;
}

const DEFAULT_STREAMING_CONFIG: LLMStreamingConfig = {
  chunking: { maxCharsPerDelta: 64 },
  markerHold: { enabled: false, flushAt: "final", maxBufferedMarkers: 0 },
};

function getChatService(req: Request): PrismaChatServicePort {
  const svc = req.app.locals?.services?.chat as
    | PrismaChatServicePort
    | undefined;
  if (!svc) {
    const err = new Error(
      "Chat service not available (container wiring missing).",
    );
    // @ts-expect-error
    err.statusCode = 503;
    throw err;
  }
  return svc;
}

function getUserId(req: Request): string {
  const anyReq = req as any;
  const userId =
    anyReq.user?.id ||
    anyReq.user?.userId ||
    anyReq.auth?.userId ||
    anyReq.userId;
  if (!userId || typeof userId !== "string") {
    const err = new Error("Unauthorized (missing user id).");
    // @ts-expect-error
    err.statusCode = 401;
    throw err;
  }
  return userId;
}

function readString(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toLanguage(value: unknown): ChatLanguage | undefined {
  if (value == null) return undefined;
  const raw = String(value).toLowerCase().trim();
  if (raw.startsWith("pt")) return "pt";
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("en")) return "en";
  return undefined;
}

function toAttachments(value: unknown): Attachment[] {
  if (Array.isArray(value)) return value as Attachment[];
  return [];
}

function toComposedResponse(
  result: ChatResult,
  preferredLanguage?: ChatLanguage,
): ComposedResponse {
  return {
    content: String(result.assistantText || ""),
    attachments: toAttachments(result.attachmentsPayload),
    language: preferredLanguage,
    meta: {
      conversationId: result.conversationId,
      messageId: result.assistantMessageId,
      answerMode: result.answerMode || "general_answer",
      answerClass: result.answerClass || null,
      navType: result.navType || null,
      sources: Array.isArray(result.sources) ? result.sources : [],
      fallbackReasonCode: result.fallbackReasonCode || null,
      routeSource: "rag_wrapper",
    },
  };
}

function sseInit(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

class RagCompatSink implements StreamSink {
  readonly transport = "sse" as const;
  private open = true;

  constructor(private readonly res: Response) {}

  write(event: StreamEvent): void {
    if (!this.isOpen()) return;
    const name = String((event as any)?.event || "");
    const data = (event as any)?.data ?? {};

    if (name === "delta") {
      sseSend(this.res, "delta", { delta: String((data as any)?.text || "") });
      return;
    }
    if (name === "meta") {
      sseSend(this.res, "meta", data);
      return;
    }
    if (name === "progress" || name === "worklog" || name === "stage") {
      sseSend(this.res, "meta", { streamEvent: name, ...(data as any) });
      return;
    }
    if (name === "error") {
      sseSend(this.res, "error", {
        error: String((data as any)?.message || "Stream failed."),
        code: String((data as any)?.code || ""),
      });
      return;
    }
  }

  flush(): void {
    const anyRes = this.res as any;
    if (typeof anyRes.flush === "function") anyRes.flush();
  }

  close(): void {
    this.open = false;
  }

  isOpen(): boolean {
    return this.open && !this.res.writableEnded;
  }
}

export class RagController {
  query = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chat = getChatService(req);
      const userId = getUserId(req);

      const query = readString(
        req.body?.query ?? req.body?.q ?? req.body?.message,
        4000,
      );
      if (!query) return res.status(400).json({ error: 'Missing "query".' });

      const conversationId = readString(
        req.body?.conversationId ?? req.body?.conversation_id,
        120,
      );
      const preferredLanguage =
        toLanguage(req.body?.locale) ||
        toLanguage(req.headers["accept-language"]);
      const options =
        req.body?.options && typeof req.body.options === "object"
          ? (req.body.options as Record<string, unknown>)
          : {};
      const documentIds = Array.isArray(req.body?.documentIds)
        ? req.body.documentIds
            .filter(
              (id: unknown): id is string =>
                typeof id === "string" && id.trim().length > 0,
            )
            .map((id: string) => id.trim())
        : [];
      const optionDocIds = Array.isArray(options.documentIds)
        ? options.documentIds
            .filter(
              (id: unknown): id is string =>
                typeof id === "string" && id.trim().length > 0,
            )
            .map((id: string) => id.trim())
        : [];
      const attachedDocumentIds = Array.from(
        new Set([...documentIds, ...optionDocIds]),
      );

      const result = await chat.chat({
        userId,
        conversationId,
        message: query,
        attachedDocumentIds,
        preferredLanguage,
        context: Object.keys(options).length
          ? { ragOptions: options }
          : undefined,
        meta: { routeSource: "rag_wrapper", ragCompat: true },
      });

      return res.json(toComposedResponse(result, preferredLanguage));
    } catch (err) {
      return next(err);
    }
  };

  stream = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chat = getChatService(req);
      const userId = getUserId(req);

      const query = readString(
        req.body?.query ?? req.body?.q ?? req.body?.message,
        4000,
      );
      if (!query) return res.status(400).json({ error: 'Missing "query".' });

      const conversationId = readString(
        req.body?.conversationId ?? req.body?.conversation_id,
        120,
      );
      const preferredLanguage =
        toLanguage(req.body?.locale) ||
        toLanguage(req.headers["accept-language"]);
      const options =
        req.body?.options && typeof req.body.options === "object"
          ? (req.body.options as Record<string, unknown>)
          : {};
      const documentIds = Array.isArray(req.body?.documentIds)
        ? req.body.documentIds
            .filter(
              (id: unknown): id is string =>
                typeof id === "string" && id.trim().length > 0,
            )
            .map((id: string) => id.trim())
        : [];
      const optionDocIds = Array.isArray(options.documentIds)
        ? options.documentIds
            .filter(
              (id: unknown): id is string =>
                typeof id === "string" && id.trim().length > 0,
            )
            .map((id: string) => id.trim())
        : [];
      const attachedDocumentIds = Array.from(
        new Set([...documentIds, ...optionDocIds]),
      );

      sseInit(res);
      sseSend(res, "ready", { ok: true });

      const sink = new RagCompatSink(res);
      const onClose = () => sink.close();
      req.on("close", onClose);

      try {
        const result = await chat.streamChat({
          req: {
            userId,
            conversationId,
            message: query,
            attachedDocumentIds,
            preferredLanguage,
            context: Object.keys(options).length
              ? { ragOptions: options }
              : undefined,
            meta: { routeSource: "rag_wrapper", ragCompat: true },
          },
          sink,
          streamingConfig: DEFAULT_STREAMING_CONFIG,
        });
        const response = toComposedResponse(result, preferredLanguage);
        if (response.attachments?.length) {
          sseSend(res, "attachments", { attachments: response.attachments });
        }
        sseSend(res, "final", response);
      } catch (e: any) {
        sseSend(res, "error", { error: e?.message || "Stream failed." });
      } finally {
        sink.close();
        req.off("close", onClose);
        res.end();
      }
      return;
    } catch (err) {
      return next(err);
    }
  };
}

export const ragController = new RagController();
