import { randomUUID } from "crypto";
import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../../services/llm/types/llmStreaming.types";
import type {
  ChatRequest,
  ChatResult,
  TurnContext,
} from "../../domain/chat.types";
import type { TurnExecutor } from "./types";
import {
  ConnectorHandlerService,
  type ConnectorHandlerResult,
} from "../../../../services/core/handlers/connectorHandler.service";
import prisma from "../../../../config/database";
import { resolveConnectorTurnConfig } from "../../config/chatRuntimeConfig";
import { createDefaultHandlerDeps } from "./connectorTurn.factory";
import type { ConnectorTurnRuntime, HandlerDeps } from "./connectorTurn.types";
import { ConnectorTurnResultComposer } from "./ConnectorTurnResultComposer";
import { ConnectorTurnOperatorService } from "./ConnectorTurnOperatorService";
import {
  type ConnectorActionContext,
  type ConnectorOperator,
  type Provider,
  asRecord,
  asString,
  resolveOperator,
} from "./connectorTurn.shared";
function resolveConnectorChatTimeoutMs(): number {
  return resolveConnectorTurnConfig().timeoutMs;
}

export class ConnectorTurnHandler {
  private readonly deps: HandlerDeps;
  private readonly composer = new ConnectorTurnResultComposer();
  private readonly operatorService: ConnectorTurnOperatorService;

  constructor(
    private readonly executor: TurnExecutor,
    deps?: Partial<HandlerDeps>,
  ) {
    this.deps = createDefaultHandlerDeps(deps);
    this.operatorService = new ConnectorTurnOperatorService(
      this.deps,
      this,
      this.composer,
    );
  }

  async handle(params: {
    ctx: TurnContext;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const operator = resolveOperator(params.ctx.request);
    const base =
      params.sink && params.streamingConfig && !operator
        ? await this.executor.streamChat({
            req: params.ctx.request,
            sink: params.sink,
            streamingConfig: params.streamingConfig,
          })
        : await this.executor.chat(params.ctx.request);
    if (!operator) return base;

    let result: ChatResult;
    try {
      result = await this.operatorService.handleOperator({
        ctx: params.ctx,
        base,
        operator,
      });
    } catch {
      result = this.composer.compose(base, {
        assistantText:
          "I couldn't access your connector right now. Reconnect and try again.",
        answerMode: "action_receipt",
        status: "failed",
        failureCode: "CONNECTOR_RUNTIME_FAILED",
      });
    }
    await this.persistAssistantOverride(base, result).catch(() => {});
    return result;
  }

  private async persistAssistantOverride(
    base: ChatResult,
    next: ChatResult,
  ): Promise<void> {
    const messageId = asString(base.assistantMessageId);
    if (!messageId) return;

    const attachments = Array.isArray(next.attachmentsPayload)
      ? next.attachmentsPayload
      : [];

    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        metadata: true,
        isEncrypted: true,
      },
    });
    if (!row) return;

    let existingMeta: Record<string, unknown> = {};
    try {
      const parsed = row.metadata ? JSON.parse(row.metadata) : null;
      existingMeta = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      existingMeta = {};
    }

    const mergedMeta: Record<string, unknown> = {
      ...existingMeta,
      attachments,
      answerMode: next.answerMode || existingMeta.answerMode || "action_receipt",
      answerClass: next.answerClass || existingMeta.answerClass || "GENERAL",
      navType: next.navType ?? existingMeta.navType ?? null,
      sources: Array.isArray(next.sources) ? next.sources : [],
    };
    delete mergedMeta.fallbackReasonCode;
    delete mergedMeta.fallbackTelemetry;
    delete mergedMeta.fallbackPolicy;
    delete mergedMeta.fallbackReasonCodeUser;
    delete mergedMeta.promptType;

    const data: Record<string, unknown> = {
      metadata: JSON.stringify(mergedMeta),
    };

    if (!row.isEncrypted) {
      data.content = String(next.assistantText || "");
    }

    await prisma.message.update({
      where: { id: messageId },
      data,
    });
  }

  baseContext(
    req: ChatRequest,
    base: ChatResult,
  ): ConnectorActionContext {
    const meta = asRecord(req.meta);
    return {
      userId: req.userId,
      conversationId:
        base.conversationId || req.conversationId || `conv_${randomUUID()}`,
      correlationId:
        asString(meta.requestId) || base.traceId || `corr_${randomUUID()}`,
      clientMessageId: base.userMessageId || `msg_${randomUUID()}`,
    };
  }

  async resolveProviderStatus(
    req: ChatRequest,
    base: ChatResult,
    provider: Provider,
  ): Promise<ConnectorHandlerResult> {
    return this.deps.connectorHandler.execute({
      action: "status",
      provider,
      context: this.baseContext(req, base),
    });
  }

  async withConnectorTimeout<T>(
    label: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const timeoutMs = resolveConnectorChatTimeoutMs();
    let timer: ReturnType<typeof setTimeout> | null = null;

    return new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      const maybeTimer = timer as NodeJS.Timeout & { unref?: () => void };
      if (typeof maybeTimer.unref === "function") {
        maybeTimer.unref();
      }

      run()
        .then(resolve, reject)
        .finally(() => {
          if (timer) clearTimeout(timer);
          timer = null;
      });
    });
  }

  async getAccessToken(
    userId: string,
    provider: Provider,
  ): Promise<string> {
    try {
      return await this.deps.tokenVault.getValidAccessToken(userId, provider);
    } catch {
      if (provider === "gmail") {
        await this.deps.gmailOAuth.refreshAccessToken(userId);
      } else if (provider === "outlook") {
        await this.deps.outlookOAuth.refreshAccessToken(userId);
      } else {
        await this.deps.slackOAuth.refreshAccessToken(userId);
      }
      return this.deps.tokenVault.getValidAccessToken(userId, provider);
    }
  }
}
