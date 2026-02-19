import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../llm/types/llmStreaming.types";
import type { ChatResult, TurnContext } from "../chat.types";
import type { TurnExecutor } from "./types";

export class GeneralTurnHandler {
  constructor(private readonly executor: TurnExecutor) {}

  async handle(params: {
    ctx: TurnContext;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<ChatResult> {
    if (params.sink && params.streamingConfig) {
      return this.executor.streamChat({
        req: params.ctx.request,
        sink: params.sink,
        streamingConfig: params.streamingConfig,
      });
    }
    return this.executor.chat(params.ctx.request);
  }
}
