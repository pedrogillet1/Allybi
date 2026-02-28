import type {
  LLMStreamingConfig,
  StreamSink,
} from "../llm/types/llmStreaming.types";
import type { TurnExecutor } from "./handlers/types";
import type { ChatRequest, ChatResult, TurnRouteDecision } from "./chat.types";
import { TurnContextBuilder } from "./turnContext.builder";
import { TurnRouterService } from "./turnRouter.service";
import type { IntentDecisionOutput } from "../config/intentConfig.service";
import { normalizeTurnError, normalizeTurnSuccess } from "./responseEnvelope";
import { ConnectorTurnHandler } from "./handlers/connectorTurn.handler";
import { KnowledgeTurnHandler } from "./handlers/knowledgeTurn.handler";
import { GeneralTurnHandler } from "./handlers/generalTurn.handler";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

export class ChatKernelService {
  private readonly contextBuilder = new TurnContextBuilder();
  private readonly routePolicy = new TurnRoutePolicyService();
  private readonly router = new TurnRouterService(this.routePolicy);
  private readonly connectorHandler: ConnectorTurnHandler;
  private readonly knowledgeHandler: KnowledgeTurnHandler;
  private readonly generalHandler: GeneralTurnHandler;

  constructor(private readonly executor: TurnExecutor) {
    this.connectorHandler = new ConnectorTurnHandler(executor);
    this.knowledgeHandler = new KnowledgeTurnHandler(executor);
    this.generalHandler = new GeneralTurnHandler(executor);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private withIntentMetadata(
    req: ChatRequest,
    intentDecision: IntentDecisionOutput | null,
  ): ChatRequest {
    if (!intentDecision) return req;

    const meta = this.asRecord(req.meta);
    const context = this.asRecord(req.context);
    const intentState = this.asRecord((context as any).intentState);

    return {
      ...req,
      meta: {
        ...meta,
        intentFamily: intentDecision.intentFamily,
        operator: intentDecision.operatorId,
        domain: intentDecision.domainId,
        domainId: intentDecision.domainId,
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

  async handleTurn(req: ChatRequest): Promise<ChatResult> {
    const ctx = this.contextBuilder.build(req);
    const resolved = this.router.decideWithIntent(ctx);
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
    const ctx = this.contextBuilder.build(params.req);
    const resolved = this.router.decideWithIntent(ctx);
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
          return this.connectorHandler.handle(params);
        case "KNOWLEDGE":
          return this.knowledgeHandler.handle(params);
        case "GENERAL":
        case "CLARIFY":
        default:
          return this.generalHandler.handle(params);
      }
    })();

    try {
      const result = await op;
      normalizeTurnSuccess(result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat turn failed";
      const envelope = normalizeTurnError("CHAT_TURN_FAILED", message);
      throw new Error(envelope.message || "Chat turn failed");
    }
  }
}
