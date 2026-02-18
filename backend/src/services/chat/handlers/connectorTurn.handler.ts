import type { LLMStreamingConfig, StreamSink } from "../../llm/types/llmStreaming.types";
import type { ChatResult, TurnContext } from "../chat.types";
import type { LegacyChatExecutor } from "./types";

export class ConnectorTurnHandler {
  constructor(private readonly legacy: LegacyChatExecutor) {}

  async handle(params: {
    ctx: TurnContext;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<ChatResult> {
    if (params.sink && params.streamingConfig) {
      return this.legacy.streamChat({ req: params.ctx.request, sink: params.sink, streamingConfig: params.streamingConfig });
    }
    return this.legacy.chat(params.ctx.request);
  }
}
