import type { ChatRequest, ChatResult } from "../../domain/chat.types";
import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../../services/llm/types/llmStreaming.types";

export interface TurnExecutor {
  chat(req: ChatRequest): Promise<ChatResult>;
  streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult>;
}
