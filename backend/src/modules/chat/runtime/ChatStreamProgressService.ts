import type {
  StreamProgressStage,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";

type SinkWithIsOpen = StreamSink & {
  isOpen?: () => boolean;
};

export class ChatStreamProgressService {
  write(
    sink: StreamSink | undefined,
    stage: StreamProgressStage,
    code: string,
  ): void {
    if (!sink) return;
    const sinkWithState = sink as SinkWithIsOpen;
    if (typeof sinkWithState.isOpen === "function" && !sinkWithState.isOpen()) {
      return;
    }
    sink.write({
      event: "progress",
      data: {
        stage,
        key: code,
        t: Date.now(),
      },
    });
  }
}
