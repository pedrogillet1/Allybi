import type {
  LLMStreamingConfig,
  StreamSink,
} from "../llm/types/llmStreaming.types";
import type { TurnExecutor } from "./handlers/types";
import type { ChatRequest, ChatResult, TurnRouteDecision } from "./chat.types";
import { TurnContextBuilder } from "./turnContext.builder";
import { TurnRouterService } from "./turnRouter.service";
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

  async handleTurn(req: ChatRequest): Promise<ChatResult> {
    const ctx = this.contextBuilder.build(req);
    const route = this.router.decide(ctx);
    return this.dispatch(route, { ctx });
  }

  async streamTurn(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const ctx = this.contextBuilder.build(params.req);
    const route = this.router.decide(ctx);
    return this.dispatch(route, {
      ctx,
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
