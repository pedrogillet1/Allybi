import {
  EditorStateService,
  type EditorEvent,
  type EditorStage,
} from "./editorState.service";

export interface EditorStreamAppendInput {
  sessionId: string;
  delta: string;
  // Optional tags to help the renderer (no chain-of-thought)
  channel?: "assistant" | "system";
}

export interface EditorStreamStageInput {
  sessionId: string;
  stage: EditorStage;
  message?: string;
}

/**
 * EditorStreamService
 * - Stores streamed deltas as small, structured events
 * - Avoids DB writes per token (state lives in EditorStateService)
 * - Provides "stage boundary" markers to flush UI sections deterministically
 */
export class EditorStreamService {
  constructor(private readonly state: EditorStateService) {}

  appendDelta(input: EditorStreamAppendInput): EditorEvent {
    const delta = (input.delta || "").toString();
    if (!delta) {
      return this.state.addEvent(input.sessionId, "delta", {
        delta: "",
        channel: input.channel ?? "assistant",
      });
    }

    // Keep payloads small: cap extremely large deltas (defense-in-depth)
    const capped = delta.length > 20_000 ? delta.slice(0, 20_000) : delta;
    return this.state.addEvent(input.sessionId, "delta", {
      delta: capped,
      channel: input.channel ?? "assistant",
    });
  }

  setStage(input: EditorStreamStageInput): EditorEvent {
    this.state.updateSession(input.sessionId, { stage: input.stage });
    return this.state.addEvent(input.sessionId, "stage", {
      stage: input.stage,
      message: input.message ?? null,
    });
  }

  message(
    sessionId: string,
    text: string,
    level: "info" | "warning" | "error" = "info",
  ): EditorEvent {
    const type =
      level === "warning" ? "warning" : level === "error" ? "error" : "message";
    const capped = (text || "").slice(0, 2000);
    return this.state.addEvent(sessionId, type, { text: capped });
  }
}
