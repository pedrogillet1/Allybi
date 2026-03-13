import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import type { TurnExecutor } from "./handlers/types";
import type {
  ChatRequest,
  ChatResult,
  TurnRouteDecision,
} from "../domain/chat.types";
import { TurnContextBuilder } from "./turnContext.builder";
import type { IntentDecisionOutput } from "../../../services/config/intentConfig.service";
import { normalizeTurnError, normalizeTurnSuccess } from "./responseEnvelope";
import {
  createChatKernelRuntime,
  type ChatKernelRuntime,
} from "./chatKernel.factory";

export class ChatKernelExecutionError extends Error {
  constructor(
    public readonly envelope: ReturnType<typeof normalizeTurnError>,
  ) {
    super(envelope.message || "Chat turn failed");
    this.name = "ChatKernelExecutionError";
  }
}

export class ChatKernelService {
  private readonly runtime: ChatKernelRuntime;

  constructor(
    private readonly executor: TurnExecutor,
    runtime: ChatKernelRuntime = createChatKernelRuntime(executor),
  ) {
    this.runtime = runtime;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private readIntentState(
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.asRecord(context.intentState);
  }

  private withIntentMetadata(
    req: ChatRequest,
    intentDecision: IntentDecisionOutput | null,
  ): ChatRequest {
    if (!intentDecision) return req;

    const meta = this.asRecord(req.meta);
    const context = this.asRecord(req.context);
    const intentState = this.readIntentState(context);

    return {
      ...req,
      meta: {
        ...meta,
        intentFamily: intentDecision.intentFamily,
        operator: intentDecision.operatorId,
        domain: intentDecision.domainId,
        domainId: intentDecision.domainId,
        requiresClarification: intentDecision.requiresClarification === true,
        clarifyReason:
          typeof intentDecision.clarifyReason === "string"
            ? intentDecision.clarifyReason
            : null,
      },
      context: {
        ...context,
        intentState: {
          ...intentState,
          lastRoutingDecision: intentDecision.persistable,
          activeDomain: intentDecision.domainId,
        },
      },
    };
  }

  private enforceClarificationResult(result: ChatResult): ChatResult {
    if (result.status === "blocked" || result.status === "failed") {
      return result;
    }
    const fallbackText = "Can you clarify what you want me to do next?";
    const assistantText =
      String(result.assistantText || "").trim() || fallbackText;
    const missingSlots = Array.isArray(result.completion?.missingSlots)
      ? [...result.completion!.missingSlots]
      : [];
    if (!missingSlots.includes("intent")) missingSlots.push("intent");
    return {
      ...result,
      assistantText,
      status: "clarification_required",
      failureCode: result.failureCode || "INTENT_NEEDS_CLARIFICATION",
      completion: {
        answered: false,
        missingSlots,
        nextAction:
          result.completion?.nextAction ||
          "Clarify the document or action you want.",
      },
    };
  }

  async handleTurn(req: ChatRequest): Promise<ChatResult> {
    const ctx = this.runtime.contextBuilder.build(req);
    const resolved = this.runtime.router.decideWithIntent(ctx);
    const nextReq = this.withIntentMetadata(
      ctx.request,
      resolved.intentDecision,
    );
    const nextCtx =
      nextReq === ctx.request ? ctx : { ...ctx, request: nextReq };
    return this.dispatch(resolved.route, { ctx: nextCtx });
  }

  async streamTurn(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const ctx = this.runtime.contextBuilder.build(params.req);
    const resolved = this.runtime.router.decideWithIntent(ctx);
    const nextReq = this.withIntentMetadata(
      ctx.request,
      resolved.intentDecision,
    );
    const nextCtx =
      nextReq === ctx.request ? ctx : { ...ctx, request: nextReq };
    return this.dispatch(resolved.route, {
      ctx: nextCtx,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
    });
  }

  private async dispatch(
    route: TurnRouteDecision,
    params: {
      ctx: ReturnType<TurnContextBuilder["build"]>;
      sink?: StreamSink;
      streamingConfig?: LLMStreamingConfig;
    },
  ): Promise<ChatResult> {
    const op = (() => {
      switch (route) {
        case "CONNECTOR":
          return this.runtime.connectorHandler.handle(params);
        case "KNOWLEDGE":
          return this.runtime.knowledgeHandler.handle(params);
        case "GENERAL":
        case "CLARIFY":
        default:
          return this.runtime.generalHandler.handle(params);
      }
    })();

    try {
      let result = await op;
      if (route === "CLARIFY") {
        result = this.enforceClarificationResult(result);
      }
      normalizeTurnSuccess(result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat turn failed";
      const envelope = normalizeTurnError("CHAT_TURN_FAILED", message);
      throw new ChatKernelExecutionError(envelope);
    }
  }
}
