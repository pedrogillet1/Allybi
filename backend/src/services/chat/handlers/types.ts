import type { ChatRequest, ChatResult } from "../chat.types";
import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../llm/types/llmStreaming.types";

export interface TurnExecutor {
  chat(req: ChatRequest): Promise<ChatResult>;
  streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult>;
}
