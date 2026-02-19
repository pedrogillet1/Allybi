import type { TurnContext } from "../chat.types";

const EXPLICIT_CONNECTOR_PATTERN =
  /\b(email|gmail|outlook|calendar|slack|inbox|send|message\s+[\w.-]+)\b/i;

export type EditorGuardResult = {
  routeForcedToEditor: boolean;
  allowConnectorEscape: boolean;
  errorCode?: string;
  message?: string;
};

export class EditorModeGuard {
  enforce(ctx: TurnContext): EditorGuardResult {
    if (!ctx.viewer?.mode) {
      return { routeForcedToEditor: false, allowConnectorEscape: true };
    }

    const allowConnectorEscape = EXPLICIT_CONNECTOR_PATTERN.test(
      ctx.messageText || "",
    );
    if (allowConnectorEscape) {
      return { routeForcedToEditor: false, allowConnectorEscape: true };
    }

    // Selection precedence guardrail: selection present => authoritative.
    if (ctx.viewer.selection?.ranges?.length) {
      return { routeForcedToEditor: true, allowConnectorEscape: false };
    }

    return {
      routeForcedToEditor: true,
      allowConnectorEscape: false,
      errorCode: "DOCX_TARGET_REQUIRED",
      message: "Select content to edit or specify a concrete target.",
    };
  }
}
