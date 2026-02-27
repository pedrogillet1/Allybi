import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../llm/types/llmStreaming.types";
import type { ChatResult, TurnContext } from "../chat.types";
import type { TurnExecutor } from "./types";

/**
 * @deprecated No longer used by ChatKernelService.
 * Editor flows are now routed through the dedicated editing agent pipeline
 * via /api/editor-session/assistant/stream. Kept for rollback safety.
 */
export class EditorTurnHandler {
  constructor(private readonly executor: TurnExecutor) {}

  async handle(params: {
    ctx: TurnContext;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const viewerMode = Boolean(
      (params.ctx.request.meta as any)?.viewerMode || params.ctx.viewer?.mode,
    );
    const req = {
      ...params.ctx.request,
      meta: {
        ...(params.ctx.request.meta || {}),
        viewerMode,
      },
    };

    if (params.sink && params.streamingConfig) {
      return this.executor.streamChat({
        req,
        sink: params.sink,
        streamingConfig: params.streamingConfig,
      });
    }

    return this.executor.chat(req);
  }
}
