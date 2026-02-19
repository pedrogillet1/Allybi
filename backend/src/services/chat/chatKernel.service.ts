import type {
  LLMStreamingConfig,
  StreamSink,
} from "../llm/types/llmStreaming.types";
import { logger } from "../../utils/logger";
import type { TurnExecutor } from "./handlers/types";
import type { ChatRequest, ChatResult, TurnRouteDecision } from "./chat.types";
import { TurnContextBuilder } from "./turnContext.builder";
import { TurnRouterService } from "./turnRouter.service";
import { normalizeTurnError, normalizeTurnSuccess } from "./responseEnvelope";
import { EditorTurnHandler } from "./handlers/editorTurn.handler";
import { ConnectorTurnHandler } from "./handlers/connectorTurn.handler";
import { KnowledgeTurnHandler } from "./handlers/knowledgeTurn.handler";
import { GeneralTurnHandler } from "./handlers/generalTurn.handler";
import { EditorModeGuard } from "./guardrails/editorMode.guard";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

export class ChatKernelService {
  private readonly contextBuilder = new TurnContextBuilder();
  private readonly routePolicy = new TurnRoutePolicyService();
  private readonly guard = new EditorModeGuard(this.routePolicy);
  private readonly router = new TurnRouterService(this.routePolicy, this.guard);
  private readonly editorHandler: EditorTurnHandler;
  private readonly connectorHandler: ConnectorTurnHandler;
  private readonly knowledgeHandler: KnowledgeTurnHandler;
  private readonly generalHandler: GeneralTurnHandler;

  constructor(private readonly executor: TurnExecutor) {
    this.editorHandler = new EditorTurnHandler(executor);
    this.connectorHandler = new ConnectorTurnHandler(executor);
    this.knowledgeHandler = new KnowledgeTurnHandler(executor);
    this.generalHandler = new GeneralTurnHandler(executor);
  }

  async handleTurn(req: ChatRequest): Promise<ChatResult> {
    const ctx = this.contextBuilder.build(req);
    const guard = this.guard.enforce(ctx);

    if (guard.errorCode && ctx.viewer?.mode) {
      logger.info("[chat-kernel] editor guard clarification", {
        conversationId: req.conversationId,
        errorCode: guard.errorCode,
      });
    }

    const route = this.router.decide(ctx);
    return this.dispatch(route, { ctx });
  }

  async streamTurn(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const ctx = this.contextBuilder.build(params.req);
    const guard = this.guard.enforce(ctx);

    if (guard.errorCode && ctx.viewer?.mode && params.sink.isOpen()) {
      params.sink.write({
        event: "worklog",
        data: {
          eventType: "STEP_ADD",
          label: guard.message || guard.errorCode,
        },
      } as any);
    }

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
        case "EDITOR":
          return this.editorHandler.handle(params);
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
