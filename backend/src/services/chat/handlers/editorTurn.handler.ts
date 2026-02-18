import type { LLMStreamingConfig, StreamSink } from "../../llm/types/llmStreaming.types";
import type { ChatResult, TurnContext } from "../chat.types";
import type { LegacyChatExecutor } from "./types";

export class EditorTurnHandler {
  constructor(private readonly legacy: LegacyChatExecutor) {}

  async handle(params: {
    ctx: TurnContext;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const req = {
      ...params.ctx.request,
      meta: {
        ...(params.ctx.request.meta || {}),
        viewerMode: true,
      },
    };

    if (params.sink && params.streamingConfig) {
      return this.legacy.streamChat({ req, sink: params.sink, streamingConfig: params.streamingConfig });
    }

    return this.legacy.chat(req);
  }
}
